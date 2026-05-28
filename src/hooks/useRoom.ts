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
import { practiceRoomsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import { generateId } from "@/lib/utils";
import type {
  PracticeRoom,
  RoomParticipant,
  RoomQuestion,
  RoomChatMessage,
} from "@/types/room.types";
import type { Tables } from "@/integrations/supabase";
import type { InterviewType } from "@/types/session.types";

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

function mapPracticeRoom(row: Tables<"practice_rooms">): PracticeRoom {
  return {
    id: row.id,
    host_id: row.host_id,
    name: row.name,
    interview_type: "mixed",
    status: row.status as PracticeRoom["status"],
    max_participants: row.max_players,
    is_public: row.is_public,
    share_token: row.id,
    current_question_index: 0,
    started_at: null,
    ended_at: null,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function mapParticipant(row: Tables<"room_participants">): RoomParticipant {
  return {
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    full_name: "Participant",
    avatar_url: null,
    role: row.role as RoomParticipant["role"],
    is_online: row.left_at === null,
    is_ready: false,
    joined_at: row.joined_at,
  };
}

function mapQuestion(row: Tables<"room_questions">, index: number): RoomQuestion {
  return {
    id: row.id,
    room_id: row.room_id,
    question_text: row.question,
    question_type: (row.question_type ?? "mixed") as InterviewType,
    order_index: index,
    created_at: row.created_at,
  };
}

function mapMessage(row: Tables<"room_chat">): RoomChatMessage {
  return {
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    full_name: "Participant",
    avatar_url: null,
    content: row.message,
    type: "chat",
    created_at: row.created_at,
  };
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
          practiceRoomsDB.getById(id),
          practiceRoomsDB.listParticipants(id),
          practiceRoomsDB.listQuestions(id),
          practiceRoomsDB.listMessages(id, 100),
        ]);

      // ✅ FIX: Surface actual Supabase error messages rather than swallowing them
      if (!roomRes) throw new Error("Room not found");

      setRoom(mapPracticeRoom(roomRes));
      setParticipants(participantsRes.map(mapParticipant));
      setQuestions(questionsRes.map(mapQuestion));
      setMessages(messagesRes.map(mapMessage));

      isHostRef.current = roomRes.host_id === user?.id;

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
        if (payload.new) setRoom(mapPracticeRoom(payload.new as Tables<"practice_rooms">));
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "room_participants",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setParticipants((prev) => {
          // Deduplicate in case the INSERT fires before our optimistic update
          const next = mapParticipant(payload.new as Tables<"room_participants">);
          const exists = prev.some((p) => p.id === next.id);
          return exists ? prev : [...prev, next];
        });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "room_participants",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === (payload.new as Tables<"room_participants">).id
              ? mapParticipant(payload.new as Tables<"room_participants">)
              : p,
          ),
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "room_chat",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setMessages((prev) => {
          const next = mapMessage(payload.new as Tables<"room_chat">);
          const exists = prev.some((m) => m.id === next.id);
          return exists ? prev : [...prev, next];
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
    const existing = await practiceRoomsDB.findParticipant(id, userId);

    if (existing) {
      try {
        await practiceRoomsDB.reactivateParticipant(existing.id, role);
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Failed to rejoin room" };
      }
    }

    const participant: any = {
      room_id:    id,
      user_id:    userId,
      role,
    };

    try {
      await practiceRoomsDB.addParticipant(participant);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to join room" };
    }
  }, [user?.id]);

  /* ── Create room ────────────────────────────────────────────────────────── */

  const createRoom = useCallback(async (params: {
    name:             string;
    interviewType:    string;
    maxParticipants?: number;
    isPublic?:        boolean;
  }): Promise<{ roomId: string | null; shareToken: string | null; error: string | null }> => {
    let userId: string;
    try {
      userId = requireUserId(user?.id, "createRoom");
    } catch (err) {
      return { roomId: null, shareToken: null, error: (err as Error).message };
    }

    const newRoomId  = generateId();

    const newRoom: any = {
      id:               newRoomId,
      host_id:          userId,
      name:             params.name.trim(),
      description:      `Interview type: ${params.interviewType}`,
      status:           "waiting",
      max_players:      params.maxParticipants ?? 4,
      is_public:        params.isPublic ?? false,
    };

    try {
      await practiceRoomsDB.create(newRoom);
    } catch (err) {
      return {
        roomId: null,
        shareToken: null,
        error: err instanceof Error ? err.message : "Failed to create room",
      };
    }

    const joinResult = await joinRoom(newRoomId, "interviewer");
    if (joinResult.error) {
      await practiceRoomsDB.delete(newRoomId);
      return {
        roomId: null,
        shareToken: null,
        error: `Room created but failed to join as host: ${joinResult.error}. Room has been removed.`,
      };
    }

    return { roomId: newRoomId, shareToken: newRoomId, error: null };
  }, [user?.id, joinRoom]);


  /* ── Leave room ─────────────────────────────────────────────────────────── */

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!user?.id || !roomId) return;

    await practiceRoomsDB.markParticipantLeft(roomId, user.id);

    cleanup();
  }, [user?.id, roomId, cleanup]);

  /* ── Start room (host only) ─────────────────────────────────────────────── */

  const startRoom = useCallback(async (): Promise<void> => {
    if (!isHostRef.current || !roomId) return;

    await practiceRoomsDB.updateStatus(roomId, "in_progress");
  }, [roomId]);

  /* ── Advance question (host only) ───────────────────────────────────────── */

  const nextQuestion = useCallback(async (): Promise<void> => {
    if (!isHostRef.current || !room) return;

    const nextIndex = room.current_question_index + 1;
    if (nextIndex >= questions.length) {
      await practiceRoomsDB.updateStatus(room.id, "completed");
    } else {
      setRoom({ ...room, current_question_index: nextIndex });
    }
  }, [room, questions.length]);

  /* ── Send chat message ──────────────────────────────────────────────────── */

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!user?.id || !roomId || !content.trim()) return;

    const message: Tables<"room_chat">["Insert"] = {
      room_id:    roomId,
      user_id:    user.id,
      message:    content.trim(),
    };

    await practiceRoomsDB.sendMessage(message);
  }, [user?.id, roomId]);

  /* ── Toggle ready ───────────────────────────────────────────────────────── */

  const toggleReady = useCallback(async (): Promise<void> => {
    if (!user?.id || !roomId) return;

    const me = participants.find((p) => p.user_id === user.id);
    if (!me) return;

    setParticipants((prev) =>
      prev.map((p) => (p.id === me.id ? { ...p, is_ready: !p.is_ready } : p)),
    );
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
