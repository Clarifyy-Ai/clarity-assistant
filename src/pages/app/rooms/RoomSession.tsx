// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Video, Square, Play, MessageSquare, Users, Send, Loader2, CheckCircle, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Room {
  id: string;
  name: string;
  description: string | null;
  status: string;
  max_players: number;
  is_public: boolean;
  host_id: string;
  created_at: string;
}

interface Participant {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
}

export default function RoomSession() {
  const { roomId: id } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initial fetch + auto-join
  useEffect(() => {
    if (!id) return;
    // Wait for auth to hydrate before fetching — but never leave the page
    // stuck on a skeleton: if user is null after first render, flip loading
    // so the "Room not found" / sign-in fallback can render.
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: r, error: roomErr } = await supabase
          .from("practice_rooms")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (cancelled) return;
        if (roomErr) {
          console.error("[RoomSession] room fetch failed:", roomErr);
          toast.error(roomErr.message || "Failed to load room");
        }
        setRoom((r as Room | null) ?? null);

        if (r) {
          // Join if not already a participant
          const { data: existing } = await supabase
            .from("room_participants")
            .select("id")
            .eq("room_id", id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!existing) {
            const { error: joinErr } = await supabase.from("room_participants").insert({
              room_id: id,
              user_id: user.id,
              role: r.host_id === user.id ? "host" : "participant",
            });
            if (joinErr) console.error("[RoomSession] auto-join failed:", joinErr);
          }

          const [{ data: parts }, { data: msgs }] = await Promise.all([
            supabase.from("room_participants").select("*").eq("room_id", id).is("left_at", null),
            supabase.from("room_chat").select("*").eq("room_id", id).order("created_at", { ascending: true }).limit(200),
          ]);

          if (!cancelled) {
            setParticipants((parts as Participant[]) ?? []);
            setMessages((msgs as ChatMessage[]) ?? []);
          }
        }
      } catch (err) {
        console.error("[RoomSession] unexpected error:", err);
        if (!cancelled) toast.error("Failed to load room");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, user?.id]);

  // Mark participant left when navigating away without clicking Leave
  useEffect(() => {
    if (!id || !user?.id) return;
    return () => {
      void supabase
        .from("room_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", id)
        .eq("user_id", user.id)
        .is("left_at", null);
    };
  }, [id, user?.id]);

  // Realtime presence + chat
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`room:${id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${id}` },
        async () => {
          const { data } = await supabase
            .from("room_participants").select("*")
            .eq("room_id", id).is("left_at", null);
          setParticipants((data as Participant[]) ?? []);
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "room_chat", filter: `room_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "practice_rooms", filter: `id=eq.${id}` },
        (payload) => setRoom(payload.new as Room))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function startSession() {
    if (!id) return;
    const { error } = await supabase
      .from("practice_rooms").update({ status: "in_progress" }).eq("id", id);
    if (error) toast.error("Failed to start session");
  }

  async function endSession() {
    if (!id) return;
    const { error } = await supabase
      .from("practice_rooms").update({ status: "completed" }).eq("id", id);
    if (!error) toast.success("Session ended");
  }

  async function leaveRoom() {
    if (!id || !user?.id) return;
    await supabase
      .from("room_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("room_id", id).eq("user_id", user.id);
    navigate("/app/rooms");
  }

  async function sendMessage() {
    if (!id || !user?.id || !draft.trim()) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    const { error } = await supabase.from("room_chat").insert({
      room_id: id, user_id: user.id, message: text,
    });
    if (error) {
      toast.error("Failed to send");
      setDraft(text);
    }
    setSending(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse h-32" />
        <Card className="animate-pulse h-64" />
      </div>
    );
  }

  if (!room) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Room not found</p>
        <Link to="/app/rooms" className="text-sm text-violet-500 hover:underline mt-2 inline-block">
          Back to Practice Rooms
        </Link>
      </Card>
    );
  }

  const isHost = room.host_id === user?.id;
  const isActive = room.status === "in_progress";
  const isCompleted = room.status === "completed";
  const isWaiting = room.status === "waiting";

  return (
    <div>
      <PageHeader
        title={room.name}
        subtitle={room.description ?? "Live practice room"}
        icon={<Video className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Practice Rooms", href: "/app/rooms" },
          { label: room.name },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-violet-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full",
                  isActive ? "bg-red-500 animate-pulse" :
                  isCompleted ? "bg-emerald-500" : "bg-blue-500")} />
                <span className="text-sm font-medium capitalize">{room.status?.replace("_", " ")}</span>
              </div>
              <div className="flex gap-2">
                {isHost && isWaiting && (
                  <Button variant="primary" size="sm" leftIcon={<Play className="w-4 h-4" />} onClick={startSession}>
                    Start session
                  </Button>
                )}
                {isHost && isActive && (
                  <Button variant="ghost" size="sm" leftIcon={<Square className="w-4 h-4" />} onClick={endSession}
                    className="text-red-400 hover:text-red-300">
                    End session
                  </Button>
                )}
                <Button variant="ghost" size="sm" leftIcon={<LogOut className="w-4 h-4" />} onClick={leaveRoom}
                  className="text-muted-foreground">
                  Leave
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Real-time chat and participant presence are active. Video/voice rooms require a
              future WebRTC release — use Live Co-Pilot for audio practice in the meantime.
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Live Chat
            </h3>

            <div className="space-y-2 min-h-[260px] max-h-[420px] overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No messages yet. Say hi 👋
                </p>
              ) : (
                messages.map((m) => {
                  const isMine = m.user_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                        isMine ? "bg-violet-500/20 text-foreground" : "bg-muted/50 text-foreground border border-border"
                      )}>
                        {m.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {!isCompleted && (
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex gap-2 mt-3 pt-3 border-t border-border">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <Button type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            )}
          </Card>

          {isCompleted && (
            <Card className="text-center py-6">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Session complete</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Participants ({participants.length}/{room.max_players})
            </h3>
            {participants.length > 0 ? (
              <div className="space-y-2">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-violet-500/15 flex items-center justify-center text-[11px] font-bold text-violet-500">
                      {p.user_id.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground truncate flex-1">
                      {p.user_id === user?.id ? "You" : `User ${p.user_id.slice(0, 6)}`}
                    </span>
                    {p.role === "host" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-500">Host</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No participants yet</p>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Room Info</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Visibility</span>
                <span className="text-foreground">{room.is_public ? "Public" : "Private"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{new Date(room.created_at).toLocaleString()}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
