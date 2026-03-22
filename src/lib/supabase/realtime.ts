// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// realtime.ts — Supabase Realtime channel management.
// ─────────────────────────────────────────────────────────────────────────────

import type { RealtimeChannel } from "@supabase/supabase-js"; // ✅ FIXED import source
import { supabase }             from "@/lib/supabase/client";
import { DatabaseError, ErrorCode } from "@/lib/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface PostgresChange<T = Record<string, unknown>> {
  eventType: RealtimeEvent;
  new:       T;
  old:       Partial<T>;
  table:     string;
  schema:    string;
}

export interface ChannelConfig {
  channelName: string;
  onError?:    (error: Error) => void;
  onClose?:    () => void;
}

export interface PostgresChangeConfig<T> extends ChannelConfig {
  table:    string;
  schema?:  string;
  event?:   RealtimeEvent;
  filter?:  string;
  onChange: (change: PostgresChange<T>) => void;
}

export interface BroadcastConfig<T> extends ChannelConfig {
  event:     string;
  onMessage: (payload: T) => void;
}

export interface PresenceConfig<T extends object> extends ChannelConfig {
  userState:  T;
  onSync?:    (state: Record<string, T[]>) => void;
  onJoin?:    (key: string, newPresence: T[]) => void;
  onLeave?:   (key: string, leftPresence: T[]) => void;
}

// ─── Active Channel Registry ──────────────────────────────────────────────────

const activeChannels = new Map<string, RealtimeChannel>();

function registerChannel(name: string, channel: RealtimeChannel): void {
  if (activeChannels.has(name)) {
    removeChannel(name);
  }
  activeChannels.set(name, channel);
}

export function removeChannel(name: string): void {
  const channel = activeChannels.get(name);
  if (channel) {
    supabase.removeChannel(channel);
    activeChannels.delete(name);
  }
}

export function removeAllChannels(): void {
  activeChannels.forEach((_, name) => removeChannel(name));
}

export function getActiveChannelNames(): string[] {
  return [...activeChannels.keys()];
}

// ─── Postgres Changes ─────────────────────────────────────────────────────────

export function subscribeToTable<T = Record<string, unknown>>(
  config: PostgresChangeConfig<T>
): () => void {
  const {
    channelName,
    table,
    schema  = "public",
    event   = "*",
    filter,
    onChange,
    onError,
    onClose,
  } = config;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event,
        schema,
        table,
        ...(filter ? { filter } : {}),
      },
      (payload) => {
        onChange({
          eventType: payload.eventType as RealtimeEvent,
          new:       payload.new as T,
          old:       payload.old as Partial<T>,
          table:     payload.table,
          schema:    payload.schema,
        });
      }
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || error) {
        onError?.(error ?? new DatabaseError(
          `Realtime channel "${channelName}" error`,
          ErrorCode.DB_REALTIME_FAILED,
          { channelName, table }
        ));
      }
      if (status === "CLOSED") {
        onClose?.();
      }
    });

  registerChannel(channelName, channel);
  return () => removeChannel(channelName);
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

export function subscribeToBroadcast<T>(
  config: BroadcastConfig<T>
): { unsubscribe: () => void; send: (payload: T) => Promise<void> } {
  const { channelName, event, onMessage, onError, onClose } = config;

  const channel = supabase
    .channel(channelName)
    .on(
      "broadcast",
      { event },
      ({ payload }) => onMessage(payload as T)
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || error) {
        onError?.(error ?? new Error(`Broadcast channel error: ${channelName}`));
      }
      if (status === "CLOSED") onClose?.();
    });

  registerChannel(channelName, channel);

  const send = async (payload: T): Promise<void> => {
    await channel.send({
      type:    "broadcast",
      event,
      payload: payload as Record<string, unknown>,
    });
  };

  return {
    unsubscribe: () => removeChannel(channelName),
    send,
  };
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export function subscribeToPresence<T extends object>(
  config: PresenceConfig<T>
): {
  unsubscribe: () => void;
  track:       (state?: Partial<T>) => Promise<void>;
  untrack:     () => Promise<void>;
  getState:    () => Record<string, T[]>;
} {
  const { channelName, userState, onSync, onJoin, onLeave, onError } = config;

  const channel = supabase
    .channel(channelName, {
      config: { presence: { key: channelName } },
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<T>();
      onSync?.(state);
    })
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      onJoin?.(key, newPresences as T[]);
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      onLeave?.(key, leftPresences as T[]);
    })
    .subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        await channel.track(userState);
      }
      if (status === "CHANNEL_ERROR" || error) {
        onError?.(error ?? new Error(`Presence channel error: ${channelName}`));
      }
    });

  registerChannel(channelName, channel);

  return {
    unsubscribe: () => removeChannel(channelName),
    track:       (state) => channel.track({ ...userState, ...state }),
    untrack:     () => channel.untrack(),
    getState:    () => channel.presenceState<T>(),
  };
}

// ─── Domain-Specific Subscriptions ───────────────────────────────────────────

export function subscribeToSession<T>(
  sessionId: string,
  onChange: (change: PostgresChange<T>) => void
): () => void {
  return subscribeToTable<T>({
    channelName: `session-${sessionId}`,
    table:       "sessions",
    event:       "UPDATE",
    filter:      `id=eq.${sessionId}`,
    onChange,
  });
}

export function subscribeToNotifications(
  userId: string,
  onNotification: (row: Record<string, unknown>) => void
): () => void {
  return subscribeToTable({
    channelName: `notifications-${userId}`,
    table:       "notifications",
    event:       "INSERT",
    filter:      `user_id=eq.${userId}`,
    onChange:    (change) => onNotification(change.new),
  });
}

export function subscribeToCredits(
  userId: string,
  onUpdate: (credits: Record<string, unknown>) => void
): () => void {
  return subscribeToTable({
    channelName: `credits-${userId}`,
    table:       "credits",
    event:       "UPDATE",
    filter:      `user_id=eq.${userId}`,
    onChange:    (change) => onUpdate(change.new),
  });
}
