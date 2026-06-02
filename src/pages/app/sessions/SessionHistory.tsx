import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { sessionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import type { Tables } from "@/integrations/supabase";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  ClipboardList, Mic, FlaskConical,
  Search, ChevronRight, AlertCircle, RefreshCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const SESSION_TYPES = ["all", "mock", "live", "practice"] as const;
type FilterType = typeof SESSION_TYPES[number];

type SessionSummary = Pick<
  Tables<"sessions">,
  | "id"
  | "type"
  | "title"
  | "overall_score"
  | "created_at"
  | "started_at"
  | "ended_at"
  | "questions_asked"
  | "status"
  | "tags"
>;

export default function SessionHistory() {
  usePageMeta({ title: "Session History | Clarify AI", description: "Review all your interview practice sessions." });

  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const fetchSessions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(false);
    try {
      const data = await sessionsDB.listSummariesByUserId(user.id, 50);
      setSessions(data);
    } catch (err) {
      console.error("[SessionHistory] Unexpected error:", err);
      setError(true);
      toast.error("Failed to load session history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

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
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Sessions"
        subtitle={`${sessions.length} total sessions`}
      />

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

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <Card className="text-center py-16 flex flex-col items-center justify-center border-destructive/20 bg-destructive/5">
          <AlertCircle className="w-10 h-10 text-destructive/60 mb-3" />
          <p className="text-foreground font-medium mb-1">Unable to load sessions</p>
          <p className="text-muted-foreground text-sm mb-4">There was a problem connecting to the database.</p>
          <Button onClick={() => void fetchSessions()} variant="outline" size="sm">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">No sessions yet</p>
          <p className="text-muted-foreground text-sm mb-4">
            {sessions.length === 0 ? "Start your first mock interview to see your history here." : "No sessions match your filter criteria."}
          </p>
          {sessions.length === 0 && (
            <Link to="/app/mock">
              <Button size="sm">Start your first mock</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({ session: s }: { session: any }) {
  const sessionType = s.type ?? "practice";

  const icon =
    sessionType === "mock"     ? <ClipboardList className="w-4 h-4" /> :
    sessionType === "live"     ? <Mic className="w-4 h-4" /> :
                                 <FlaskConical className="w-4 h-4" />;

  const iconBg =
    sessionType === "mock"     ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
    sessionType === "live"     ? "bg-red-500/10 text-red-400 border border-red-500/20"   :
                                 "bg-violet-500/10 text-violet-400 border border-violet-500/20";

  const scoreColor =
    s.overall_score === null    ? "text-muted-foreground" :
    s.overall_score >= 75       ? "text-emerald-500" :
    s.overall_score >= 50       ? "text-amber-500"   : "text-red-500";

  let duration: string | null = null;
  if (s.started_at && s.ended_at) {
    const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
    if (ms > 0) duration = `${Math.floor(ms / 60000)}m`;
  }

  return (
    <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 hover:border-primary/50 transition-colors group">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        {icon}
      </div>

      <div className="flex-1 min-w-0 w-full">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant="outline" className="capitalize text-[10px] py-0">{sessionType}</Badge>
          {s.status && s.status !== "completed" && (
            <Badge variant="secondary" className="text-[10px] py-0">{s.status}</Badge>
          )}
        </div>
        <h3 className="text-sm font-semibold text-foreground truncate">
          {s.title ?? `${sessionType} session`}
        </h3>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-muted-foreground font-medium">
            {format(new Date(s.created_at), "MMM d, yyyy · h:mm a")}
          </span>
          {s.questions_asked != null && s.questions_asked > 0 && (
            <span className="text-xs text-muted-foreground flex items-center before:content-['•'] before:mr-2 before:text-border">
              {s.questions_asked} Qs
            </span>
          )}
          {duration && (
            <span className="text-xs text-muted-foreground flex items-center before:content-['•'] before:mr-2 before:text-border">
              {duration}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between w-full sm:w-auto gap-4 mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-border">
        {s.overall_score !== null ? (
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Score</p>
            <span className={cn("text-xl font-black", scoreColor)}>
              {s.overall_score}%
            </span>
          </div>
        ) : (
          <div className="text-center opacity-50">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Score</p>
            <span className="text-xl font-black text-muted-foreground">--</span>
          </div>
        )}
        <Link to={`/app/sessions/${s.id}`}>
          <Button variant="secondary" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            View Details
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
