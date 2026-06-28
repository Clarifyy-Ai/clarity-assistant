import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { practiceRoomsDB } from "@/lib/supabase/database";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Video,
  Square,
  Play,
  MessageSquare,
  Users,
  Send,
  Loader2,
  CheckCircle,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase";

type Room = Pick<
  Tables<"practice_rooms">,
  | "id"
  | "name"
  | "description"
  | "status"
  | "max_players"
  | "is_public"
  | "host_id"
  | "created_at"
>;
type Participant = Tables<"room_participants">;
type ChatMessage = Tables<"room_chat">;

export default function RoomSession() {
  const { roomId: id } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadRoom = useCallback(async () => {
    if (!id || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const r = await practiceRoomsDB.getById(id);
      if (!r) {
        setRoom(null);
        return;
      }

      setRoom(r as Room);

      const existing = await practiceRoomsDB.findParticipant(id, user.id);
      const role = r.host_id === user.id ? "host" : "participant";

      if (!existing) {
        await practiceRoomsDB.addParticipant({
          room_id: id,
          user_id: user.id,
          role,
        });
      } else if (existing.left_at) {
        await practiceRoomsDB.reactivateParticipant(existing.id, role);
      }

      const [parts, msgs] = await Promise.all([
        practiceRoomsDB.listParticipants(id),
        practiceRoomsDB.listMessages(id, 200),
      ]);

      setParticipants(parts);
      setMessages(msgs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load room";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (!id || !user?.id) return;
    return () => {
      void practiceRoomsDB.markParticipantLeft(id, user.id);
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`room:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${id}`,
        },
        async () => {
          const data = await practiceRoomsDB.listParticipants(id);
          setParticipants(data);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_chat",
          filter: `room_id=eq.${id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "practice_rooms",
          filter: `id=eq.${id}`,
        },
        (payload) => setRoom(payload.new as Room),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function startSession() {
    if (!id) return;
    try {
      await practiceRoomsDB.updateStatus(id, "in_progress");
    } catch {
      toast.error("Failed to start session");
    }
  }

  async function endSession() {
    if (!id) return;
    try {
      await practiceRoomsDB.updateStatus(id, "completed");
      toast.success("Session ended");
    } catch {
      toast.error("Failed to end session");
    }
  }

  async function leaveRoom() {
    if (!id || !user?.id) return;
    try {
      await practiceRoomsDB.markParticipantLeft(id, user.id);
    } catch {
      // still navigate away
    }
    navigate("/app/rooms");
  }

  async function sendMessage() {
    if (!id || !user?.id || !draft.trim()) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      await practiceRoomsDB.sendMessage({
        room_id: id,
        user_id: user.id,
        message: text,
      });
    } catch {
      toast.error("Failed to send");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse h-32" />
        <Card className="animate-pulse h-64" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="text-center py-12 border-destructive/30">
        <p className="text-foreground font-medium mb-2">Could not load room</p>
        <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void loadRoom()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  if (!room) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Room not found</p>
        <Link to="/app/rooms" className="text-sm text-primary hover:underline mt-2 inline-block">
          Back to {PRODUCT_NAMES.groupPractice}
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
        icon={<Video className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: PRODUCT_NAMES.groupPractice, href: "/app/rooms" },
          { label: room.name },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    isActive
                      ? "bg-red-500 animate-pulse"
                      : isCompleted
                        ? "bg-emerald-500"
                        : "bg-blue-500",
                  )}
                />
                <span className="text-sm font-medium capitalize">
                  {room.status?.replace("_", " ")}
                </span>
              </div>
              <div className="flex gap-2">
                {isHost && isWaiting && (
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Play className="w-4 h-4" />}
                    onClick={() => void startSession()}
                  >
                    Start session
                  </Button>
                )}
                {isHost && isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Square className="w-4 h-4" />}
                    onClick={() => void endSession()}
                    className="text-red-400 hover:text-red-300"
                  >
                    End session
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<LogOut className="w-4 h-4" />}
                  onClick={() => void leaveRoom()}
                  className="text-muted-foreground"
                >
                  Leave
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Video className="w-4 h-4" />}
                disabled
                title="Voice and video (WebRTC) is coming soon. Text chat is available now."
                className="opacity-60 cursor-not-allowed"
              >
                Join voice / video
              </Button>
              <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
                Voice and video (WebRTC) is coming soon. Text-based practice rooms are available now.
              </p>
            </div>
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
                    <div
                      key={m.id}
                      className={cn("flex", isMine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                          isMine
                            ? "bg-primary/20 text-foreground"
                            : "bg-muted/50 text-foreground border border-border",
                        )}
                      >
                        {m.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {!isCompleted && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
                className="flex gap-2 mt-3 pt-3 border-t border-border"
              >
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={sending || !draft.trim()}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
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
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-bold text-primary">
                      {p.user_id.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground truncate flex-1">
                      {p.user_id === user?.id ? "You" : `User ${p.user_id.slice(0, 6)}`}
                    </span>
                    {p.role === "host" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        Host
                      </span>
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
                <span className="text-foreground">
                  {new Date(room.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
