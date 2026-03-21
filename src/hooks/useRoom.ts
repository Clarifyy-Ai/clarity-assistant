// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { generateId, generateShareToken } from "@/lib/utils";
import type {
  PracticeRoom,
  RoomParticipant,
  RoomQuestion,
  RoomChatMessage,
  RoomStatus,
} from "@/types/room.types";

// ─────────────────────────────────────────────────────────────────
// useRoom
// Collaborative practice room — real-time sync via Supabase
// Realtime channels. Handles host/participant roles, question
// rotation, in-room chat, and observer mode.
// ─────────────────────────────────────────────────────────────────

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

  const channelRef     = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isHostRef      = useRef(false);

  // ── Load room ─────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !user) return;
    loadRoom(roomId);
    return () => cleanup();
  }, [roomId, user?.id]);

  async function loadRoom(id: string): Promise<void> {
    setIsLoading(true);
    try {
      const [roomRes, participantsRes, questionsRes, messagesRes] =
        await Promise.all([
          supabase.from("practice_rooms").select("*").eq("id", id).single(),
          supabase.from("room_participants").select("*").eq("room_id", id),
          supabase.from("room_questions").select("*").eq("room_id", id).order("order_index"),
          supabase.from("room_chat").select("*").eq("room_id", id).order("created_at").limit(100),
        ]);

      if (roomRes.data)         setRoom(roomRes.data as PracticeRoom);
      if (participantsRes.data) setParticipants(participantsRes.data as RoomParticipant[]);
      if (questionsRes.data)    setQuestions(questionsRes.data as RoomQuestion[]);
      if (messagesRes.data)     setMessages(messagesRes.data as RoomChatMessage[]);

      isHostRef.current = roomRes.data?.host_id === user?.id;

      // Subscribe to real-time updates
      subscribeToRoom(id);

    } catch (err) {
      setError("Failed to load room");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Real-time subscriptions ───────────────────────────────────

  function subscribeToRoom(id: string): void {
    // Main changes channel
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
        setParticipants((prev) => [...prev, payload.new as RoomParticipant]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "room_participants",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setParticipants((prev) =>
          prev.map((p) => p.id === (payload.new as RoomParticipant).id
            ? payload.new as RoomParticipant : p)
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "room_chat",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as RoomChatMessage]);
      })
      .subscribe();

    // Presence channel — online/offline status
    presenceRef.current = supabase.channel(`presence:room:${id}`, {
      config: { presence: { key: user?.id } },
    });

    presenceRef.current
      .on("presence", { event: "sync" }, () => {
        const state = presenceRef.current!.presenceState();
        const onlineIds = Object.keys(state);
        setParticipants((prev) =>
          prev.map((p) => ({
            ...p,
            is_online: onlineIds.includes(p.user_id),
          }))
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

  // ── Create room ───────────────────────────────────────────────

  const createRoom = useCallback(async (params: {
    name:          string;
    interviewType: string;
    maxParticipants?: number;
    isPublic?:     boolean;
  }): Promise<{ roomId: string | null; shareToken: string | null; error: string | null }> => {
    if (!user) return { roomId: null, shareToken: null, error: "Not authenticated" };

    const roomId     = generateId();
    const shareToken = generateShareToken();

    const newRoom: Partial<PracticeRoom> = {
      id:               roomId,
      host_id:          user.id,
      name:             params.name,
      interview_type:   params.interviewType as any,
      status:           "waiting",
      max_participants: params.maxParticipants ?? 4,
      is_public:        params.isPublic ?? false,
      share_token:      shareToken,
      current_question_index: 0,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    };

    const { error } = await supabase.from("practice_rooms").insert(newRoom);
    if (error) return { roomId: null, shareToken: null, error: error.message };

    // Auto-join as host
    await joinRoom(roomId, "interviewer");

    return { roomId, shareToken, error: null };
  }, [user]);

  // ── Join room ─────────────────────────────────────────────────

  const joinRoom = useCallback(async (
    id: string,
    role: "candidate" | "interviewer" | "observer" = "candidate"
  ): Promise<{ error: string | null }> => {
    if (!user) return { error: "Not authenticated" };

    const participant: Partial<RoomParticipant> = {
      id:         generateId(),
      room_id:    id,
      user_id:    user.id,
      full_name:  profile?.full_name ?? "Anonymous",
      avatar_url: profile?.avatar_url ?? null,
      role,
      is_online:  true,
      is_ready:   false,
      joined_at:  new Date().toISOString(),
    };

    const { error } = await supabase.from("room_participants").insert(participant);
    return { error: error?.message ?? null };
  }, [user, profile]);

  // ── Leave room ────────────────────────────────────────────────

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!user || !roomId) return;

    await supabase
      .from("room_participants")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    cleanup();
  }, [user, roomId]);

  // ── Start room (host only) ────────────────────────────────────

  const startRoom = useCallback(async (): Promise<void> => {
    if (!isHostRef.current || !roomId) return;

    await supabase
      .from("practice_rooms")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", roomId);
  }, [roomId]);

  // ── Advance question (host only) ──────────────────────────────

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

  // ── Send chat message ─────────────────────────────────────────

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!user || !roomId || !content.trim()) return;

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
  }, [user, roomId, profile]);

  // ── Toggle ready ──────────────────────────────────────────────

  const toggleReady = useCallback(async (): Promise<void> => {
    if (!user || !roomId) return;

    const me = participants.find((p) => p.user_id === user.id);
    if (!me) return;

    await supabase
      .from("room_participants")
      .update({ is_ready: !me.is_ready })
      .eq("id", me.id);
  }, [user, roomId, participants]);

  // ── Cleanup ───────────────────────────────────────────────────

  function cleanup(): void {
    channelRef.current?.unsubscribe();
    presenceRef.current?.unsubscribe();
    channelRef.current  = null;
    presenceRef.current = null;
  }

  // ── Computed ──────────────────────────────────────────────────

  const isHost            = isHostRef.current;
  const me                = participants.find((p) => p.user_id === user?.id);
  const currentQuestion   = questions[room?.current_question_index ?? 0] ?? null;
  const allReady          = participants.filter((p) => p.role !== "observer").every((p) => p.is_ready);
  const onlineCount       = participants.filter((p) => p.is_online).length;
  const shareUrl          = room?.share_token
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
