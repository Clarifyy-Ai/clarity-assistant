// @ts-nocheck
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  Mic, Search, ChevronRight, AlertCircle, RefreshCcw,
  Plus, Clock, Sparkles, Phone, Video,
  MoreHorizontal, Trash2, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

const SESSION_TYPES = ["all", "live", "mock", "practice"] as const;
type FilterType = (typeof SESSION_TYPES)[number];

export default function CallSessions() {
  usePageMeta({
    title: "Call Sessions | Clarify AI",
    description: "View and manage your interview sessions.",
  });

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user?.id) fetchSessions();
  }, [user?.id]);

  async function fetchSessions() {
    setLoading(true);
    setError(false);
    try {
      const { data, error: fetchError } = await supabase
        .from("sessions")
        .select("id, type, title, overall_score, created_at, started_at, ended_at, questions_asked, status, tags")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setSessions(data ?? []);
    } catch (err) {
      console.error("[CallSessions] fetch error:", err);
      setError(true);
      toast.error("Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSession(id: string) {
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete session");
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    toast.success("Session deleted");
  }

  const filtered = sessions.filter((s) => {
    if (filter !== "all" && s.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.title?.toLowerCase().includes(q) ||
        s.type?.toLowerCase().includes(q) ||
        s.tags?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Call Sessions"
          subtitle={`${sessions.length} total sessions`}
        />
        <div className="flex items-center gap-2">
          <Link to="/app/live">
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Start Session
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search sessions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          fullWidth={false}
          className="sm:w-64"
        />
        <div className="flex gap-1.5">
          {SESSION_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium border transition-all capitalize",
                filter === t
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <Card className="text-center py-16 flex flex-col items-center justify-center border-destructive/20 bg-destructive/5">
          <AlertCircle className="w-10 h-10 text-destructive/60 mb-3" />
          <p className="text-foreground font-medium mb-1">Unable to load sessions</p>
          <p className="text-muted-foreground text-sm mb-4">There was a problem connecting to the database.</p>
          <Button onClick={fetchSessions} variant="outline" size="sm">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <Phone className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">No sessions yet</p>
          <p className="text-muted-foreground text-sm mb-4">
            {sessions.length === 0 ? "Start your first live session to see your history here." : "No sessions match your filter."}
          </p>
          {sessions.length === 0 && (
            <Link to="/app/live">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Start Session
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 px-4 py-2.5 bg-muted/30 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <span>Session</span>
            <span>Type</span>
            <span>Duration</span>
            <span>AI Usage</span>
            <span>Created</span>
            <span>Actions</span>
          </div>

          {/* Rows */}
          {filtered.map((s) => {
            let duration: string | null = null;
            if (s.started_at && s.ended_at) {
              const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
              if (ms > 0) duration = `${Math.floor(ms / 60000)}m`;
            }

            const typeColor =
              s.type === "live" ? "bg-red-500/10 text-red-400 border-red-500/20" :
              s.type === "mock" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
              "bg-violet-500/10 text-violet-400 border-violet-500/20";

            return (
              <div
                key={s.id}
                className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-2 sm:gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors items-center"
              >
                {/* Session name */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {s.title ?? `${s.type ?? "practice"} session`}
                  </p>
                  {(() => {
                    const ageMs = Date.now() - new Date(s.created_at).getTime();
                    const isExpired =
                      s.status === "abandoned" ||
                      (s.status !== "completed" && ageMs > 24 * 60 * 60 * 1000);
                    if (isExpired) {
                      return <Badge variant="secondary" className="text-[9px] mt-0.5">Expired</Badge>;
                    }
                    if (s.status && s.status !== "completed") {
                      return <Badge variant="secondary" className="text-[9px] mt-0.5">{s.status}</Badge>;
                    }
                    return null;
                  })()}
                </div>

                {/* Type */}
                <div>
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize", typeColor)}>
                    {s.type === "live" ? <Mic className="w-2.5 h-2.5" /> : <Video className="w-2.5 h-2.5" />}
                    {s.type ?? "practice"}
                  </span>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {duration ?? "—"}
                </div>

                {/* AI Usage */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3" />
                  {s.questions_asked ?? 0} Qs
                </div>

                {/* Created */}
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Link to={`/app/sessions/${s.id}`}>
                    <button className="p-1.5 hover:bg-muted/20 rounded-lg transition-colors" title="View">
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </Link>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
