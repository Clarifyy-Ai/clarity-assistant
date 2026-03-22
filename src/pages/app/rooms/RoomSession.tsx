// @ts-nocheck
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Video, Clock, CheckCircle, Play, Square,
  MessageSquare, Mic, MicOff, Loader2, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Session {
  id: string;
  title: string;
  type: string;
  status: string;
  difficulty: string;
  duration_minutes: number;
  capacity: number;
  created_at: string;
  questions?: unknown[];
  feedback?: string;
  score?: number;
}

interface Participant {
  id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export default function RoomSession() {
  const { roomId: id } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("practice_rooms")
        .select("*")
        .eq("id", id)
        .eq("host_id", user.id)
        .single();
      setSession(data as Session | null);

      const { data: parts } = await supabase
        .from("practice_room_participants")
        .select("id, user_id, display_name, joined_at")
        .eq("room_id", id);
      setParticipants((parts as Participant[]) ?? []);

      setLoading(false);
    })();
  }, [id, user?.id]);

  useEffect(() => {
    if (session?.status !== "in_progress") return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [session?.status]);

  async function handleComplete() {
    if (!id) return;
    const { error } = await supabase
      .from("practice_rooms")
      .update({ status: "completed" })
      .eq("id", id);
    if (!error) {
      setSession((prev) => prev ? { ...prev, status: "completed" } : prev);
      toast.success("Session completed! Review your feedback below.");
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse h-32" />
        <Card className="animate-pulse h-64" />
      </div>
    );
  }

  if (!session) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Session not found</p>
        <Link to="/app/rooms" className="text-sm text-violet-500 hover:underline mt-2 inline-block">
          Back to Practice Rooms
        </Link>
      </Card>
    );
  }

  const isActive = session.status === "in_progress";
  const isCompleted = session.status === "completed";

  return (
    <div>
      <PageHeader
        title={session.title || "Practice Session"}
        description={`${session.type?.replace("_", " ") ?? "Behavioral"} · ${session.difficulty ?? "medium"}`}
        icon={<Video className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Practice Rooms", href: "/app/rooms" },
          { label: session.title || "Session" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isActive && (
            <Card className="border-violet-500/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-foreground">Session in Progress</span>
                </div>
                <span className="text-lg font-mono font-bold text-foreground">{formatTime(elapsed)}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={recording ? "ghost" : "primary"}
                  size="sm"
                  onClick={() => setRecording(!recording)}
                  leftIcon={recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                >
                  {recording ? "Mute" : "Unmute"}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleComplete} leftIcon={<Square className="w-4 h-4" />}
                  className="text-red-400 hover:text-red-300">
                  End Session
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/app/rooms")}
                  className="text-muted-foreground hover:text-foreground">
                  Leave Room
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Interview Conversation
            </h3>
            {isActive ? (
              <div className="space-y-4 min-h-[200px]">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground">
                    Welcome to your {session.type?.replace("_", " ")} interview practice. I'll be asking you questions
                    at a {session.difficulty} difficulty level. Take your time, and use the STAR method when answering
                    behavioral questions. Ready to begin?
                  </div>
                </div>
              </div>
            ) : isCompleted ? (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-foreground font-medium">Session Complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Duration: {session.duration_minutes} minutes
                </p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Play className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Session not yet started</p>
              </div>
            )}
          </Card>

          {isCompleted && session.feedback && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-2">AI Feedback</h3>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {session.feedback}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Session Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="text-foreground capitalize">{session.type?.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Difficulty</span>
                <span className="text-foreground capitalize">{session.difficulty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="text-foreground">{session.duration_minutes} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={cn(
                  "capitalize",
                  isCompleted ? "text-emerald-500" : isActive ? "text-amber-500" : "text-muted-foreground"
                )}>
                  {session.status?.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span className="text-foreground">{new Date(session.created_at).toLocaleString()}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Participants ({participants.length}/{session.capacity ?? 2})
            </h3>
            {participants.length > 0 ? (
              <div className="space-y-2">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-500/15 flex items-center justify-center text-[10px] font-bold text-violet-500">
                      {(p.display_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground truncate">{p.display_name}</span>
                    {p.user_id === user?.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">You</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No other participants yet.</p>
            )}
          </Card>

          {isCompleted && session.score != null && (
            <Card className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Overall Score</p>
              <p className="text-3xl font-bold text-foreground">{session.score}<span className="text-sm text-muted-foreground">/100</span></p>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tips</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Use STAR method for behavioral questions</li>
              <li>Take a moment to think before answering</li>
              <li>Be specific with examples</li>
              <li>Quantify your impact when possible</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
