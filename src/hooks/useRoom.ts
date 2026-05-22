// @ts-nocheck
// src/hooks/useRoom.ts — PRODUCTION FIXED
// Fixes (F4):
// - requireUserId() guard: createRoom/joinRoom throw immediately if user.id is undefined
//   (auth not hydrated → was silently inserting undefined as host_id, failing RLS)
// - Host participant insert: awaited with error check; if it fails, room is rolled back
// - createRoom: RLS/insert errors from both room + participant surfaced as error string
// - joinRoom: duplicate participant guard (prevents unique constraint violation on rejoin)
// - loadRoom: surfaces actual Supabase error message instead of generic "Failed to load room"
// - cleanup(): extracted to stable ref-based function so useEffect teardown is safe

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { generateId, generateShareToken } from "@/lib/utils";
import type {
  PracticeRoom,
  RoomParticipant,
  RoomQuestion,
  RoomChatMessage,
} from "@/types/room.types";

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */

/**
 * ✅ FIX: Guard that throws a typed Error when user.id is absent.
 * Prevents undefined being silently inserted as host_id, which passes
 * TypeScript (ts-nocheck) but is rejected by the RLS `host_id = auth.uid()` policy.
 */
function requireUserId(userId: string | undefined | null, context: string): string {
  if (!userId) throw new Error(`${context}: user is not authenticated. Please sign in.`);
  return userId;
}

/* ─── HOOK ────────────────────────────────────────────────────────────────── */

interface UseRoomOptions {
  roomId?: string;
}

export function useRoom({ roomId }: UseRoomOptions = {}) {
  const { user, profile } = useAuthStore();

  const [room,         setRoom]         = useState<PracticeRoom | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [questions,    setQuestions]    = useState<RoomQuestion[]>([]);
  const [messages,     setMessages]     = useState<RoomChatMessage[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isHostRef   = useRef(false);

  /* ── Cleanup (stable — no closure over state) ──────────────────────────── */

  // ✅ FIX: cleanup extracted to a stable callback so useEffect teardown is
  // safe even if component unmounts before loadRoom completes.
  const cleanup = useCallback((): void => {
    channelRef.current?.unsubscribe();
    presenceRef.current?.unsubscribe();
    channelRef.current  = null;
    presenceRef.current = null;
  }, []);

  /* ── Load room ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!roomId || !user?.id) return;
    void loadRoom(roomId);
    return () => cleanup();
  }, [roomId, user?.id, cleanup]);

  async function loadRoom(id: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const [roomRes, participantsRes, questionsRes, messagesRes] =
        await Promise.all([
          supabase.from("practice_rooms").select("*").eq("id", id).single(),
          supabase.from("room_participants").select("*").eq("room_id", id),
          supabase.from("room_questions").select("*").eq("room_id", id).order("order_index"),
          supabase.from("room_chat").select("*").eq("room_id", id).order("created_at").limit(100),
        ]);

      // ✅ FIX: Surface actual Supabase error messages rather than swallowing them
      if (roomRes.error) throw new Error(roomRes.error.message);

      if (roomRes.data)         setRoom(roomRes.data as PracticeRoom);
      if (participantsRes.data) setParticipants(participantsRes.data as RoomParticipant[]);
      if (questionsRes.data)    setQuestions(questionsRes.data as RoomQuestion[]);
      if (messagesRes.data)     setMessages(messagesRes.data as RoomChatMessage[]);

      isHostRef.current = roomRes.data?.host_id === user?.id;

      subscribeToRoom(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load room");
    } finally {
      setIsLoading(false);
    }
  }

  /* ── Real-time subscriptions ────────────────────────────────────────────── */

  function subscribeToRoom(id: string): void {
    channelRef.current = supabase
      .channel(`room:${id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "practice_rooms",
        filter: `id=eq.${id}`,
      }, (payload) => {
        if (payload.new) setRoom(payload.new as PracticeRoom);
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "room_participants",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setParticipants((prev) => {
          // Deduplicate in case the INSERT fires before our optimistic update
          const exists = prev.some((p) => p.id === (payload.new as RoomParticipant).id);
          return exists ? prev : [...prev, payload.new as RoomParticipant];
        });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "room_participants",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === (payload.new as RoomParticipant).id
              ? (payload.new as RoomParticipant)
              : p,
          ),
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "room_chat",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === (payload.new as RoomChatMessage).id);
          return exists ? prev : [...prev, payload.new as RoomChatMessage];
        });
      })
      .subscribe();

    presenceRef.current = supabase.channel(`presence:room:${id}`, {
      config: { presence: { key: user?.id } },
    });

    presenceRef.current
      .on("presence", { event: "sync" }, () => {
        const state = presenceRef.current!.presenceState();
        const onlineIds = Object.keys(state);
        setParticipants((prev) =>
          prev.map((p) => ({ ...p, is_online: onlineIds.includes(p.user_id) })),
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceRef.current!.track({
            user_id:    user?.id,
            full_name:  profile?.full_name,
            avatar_url: profile?.avatar_url,
            online_at:  new Date().toISOString(),
          });
        }
      });
  }

  /* ── Create room ────────────────────────────────────────────────────────── */

  const createRoom = useCallback(async (params: {
    name:             string;
    interviewType:    string;
    maxParticipants?: number;
    isPublic?:        boolean;
  }): Promise<{ roomId: string | null; shareToken: string | null; error: string | null }> => {
    // ✅ FIX: requireUserId throws immediately if user.id is undefined/null.
    // Previously user.id could be undefined (auth not yet hydrated), which was
    // silently inserted as host_id and then rejected by RLS at query time,
    // surfacing only as a generic toast with no actionable message.
    let userId: string;
    try {
      userId = requireUserId(user?.id, "createRoom");
    } catch (err) {
      return { roomId: null, shareToken: null, error: (err as Error).message };
    }

    const newRoomId  = generateId();
    const shareToken = generateShareToken();

    const newRoom: Partial<PracticeRoom> = {
      id:               newRoomId,
      host_id:          userId,            // ✅ guaranteed non-undefined
      name:             params.name.trim(),
      interview_type:   params.interviewType as any,
      status:           "waiting",
      max_participants: params.maxParticipants ?? 4,
      is_public:        params.isPublic ?? false,
      share_token:      shareToken,
      current_question_index: 0,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    };

    // 1. Insert room
    const { error: roomError } = await supabase.from("practice_rooms").insert(newRoom);
    if (roomError) {
      return { roomId: null, shareToken: null, error: roomError.message };
    }

    // 2. ✅ FIX: Insert host into room_participants IMMEDIATELY after room creation,
    // before any realtime subscription is active. The room_chat RLS policy checks
    // that the requesting user exists in room_participants, so this MUST succeed
    // before any chat/channel operations are attempted.
    const joinResult = await joinRoom(newRoomId, "interviewer");
    if (joinResult.error) {
      // Rollback: delete the room so we don't leave an orphaned room with no host
      await supabase.from("practice_rooms").delete().eq("id", newRoomId);
      return {
        roomId: null,
        shareToken: null,
        error: `Room created but failed to join as host: ${joinResult.error}. Room has been removed.`,
      };
    }

    return { roomId: newRoomId, shareToken, error: null };
  }, [user?.id, joinRoom]);

  /* ── Join room ──────────────────────────────────────────────────────────── */

  const joinRoom = useCallback(async (
    id: string,
    role: "candidate" | "interviewer" | "observer" = "candidate",
  ): Promise<{ error: string | null }> => {
    // ✅ FIX: guard user.id before insert
    let userId: string;
    try {
      userId = requireUserId(user?.id, "joinRoom");
    } catch (err) {
      return { error: (err as Error).message };
    }

    // ✅ FIX: Duplicate guard — prevents unique constraint violation when the
    // same user rejoins (e.g. page refresh, reconnect, or back navigation).
    const { data: existing } = await supabase
      .from("room_participants")
      .select("id")
      .eq("room_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      // Already a participant — update online status and role instead of inserting
      const { error: updateError } = await supabase
        .from("room_participants")
        .update({ is_online: true, role, joined_at: new Date().toISOString() })
        .eq("id", existing.id);
      return { error: updateError?.message ?? null };
    }

    const participant: Partial<RoomParticipant> = {
      id:         generateId(),
      room_id:    id,
      user_id:    userId,               // ✅ guaranteed non-undefined
      full_name:  profile?.full_name ?? "Anonymous",
      avatar_url: profile?.avatar_url ?? null,
      role,
      is_online:  true,
      is_ready:   false,
      joined_at:  new Date().toISOString(),
    };

    const { error } = await supabase.from("room_participants").insert(participant);
    return { error: error?.message ?? null };
  }, [user?.id, profile]);

  /* ── Leave room ─────────────────────────────────────────────────────────── */

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!user?.id || !roomId) return;

    await supabase
      .from("room_participants")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    cleanup();
  }, [user?.id, roomId, cleanup]);

  /* ── Start room (host only) ─────────────────────────────────────────────── */

  const startRoom = useCallback(async (): Promise<void> => {
    if (!isHostRef.current || !roomId) return;

    await supabase
      .from("practice_rooms")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", roomId);
  }, [roomId]);

  /* ── Advance question (host only) ───────────────────────────────────────── */

  const nextQuestion = useCallback(async (): Promise<void> => {
    if (!isHostRef.current || !room) return;

    const nextIndex = room.current_question_index + 1;
    if (nextIndex >= questions.length) {
      await supabase
        .from("practice_rooms")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", room.id);
    } else {
      await supabase
        .from("practice_rooms")
        .update({ current_question_index: nextIndex })
        .eq("id", room.id);
    }
  }, [room, questions.length]);

  /* ── Send chat message ──────────────────────────────────────────────────── */

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!user?.id || !roomId || !content.trim()) return;

    const message: Partial<RoomChatMessage> = {
      id:         generateId(),
      room_id:    roomId,
      user_id:    user.id,
      full_name:  profile?.full_name ?? "Anonymous",
      avatar_url: profile?.avatar_url ?? null,
      content:    content.trim(),
      type:       "chat",
      created_at: new Date().toISOString(),
    };

    await supabase.from("room_chat").insert(message);
  }, [user?.id, roomId, profile]);

  /* ── Toggle ready ───────────────────────────────────────────────────────── */

  const toggleReady = useCallback(async (): Promise<void> => {
    if (!user?.id || !roomId) return;

    const me = participants.find((p) => p.user_id === user.id);
    if (!me) return;

    await supabase
      .from("room_participants")
      .update({ is_ready: !me.is_ready })
      .eq("id", me.id);
  }, [user?.id, roomId, participants]);

  /* ── Computed ───────────────────────────────────────────────────────────── */

  const isHost          = isHostRef.current;
  const me              = participants.find((p) => p.user_id === user?.id);
  const currentQuestion = questions[room?.current_question_index ?? 0] ?? null;
  const allReady        = participants
    .filter((p) => p.role !== "observer")
    .every((p) => p.is_ready);
  const onlineCount = participants.filter((p) => p.is_online).length;
  const shareUrl    = room?.share_token
    ? `${window.location.origin}/room/join/${room.share_token}`
    : null;

  return {
    room,
    participants,
    questions,
    messages,
    isLoading,
    error,
    isHost,
    me,
    currentQuestion,
    allReady,
    onlineCount,
    shareUrl,
    createRoom,
    joinRoom,
    leaveRoom,
    startRoom,
    nextQuestion,
    sendMessage,
    toggleReady,
  };
}
