// @ts-nocheck
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  ClipboardList, Mic, FlaskConical,
  Search, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// SessionHistory — all sessions list with filter + search
// ─────────────────────────────────────────────────────────────────

const SESSION_TYPES = ["all", "mock", "live", "practice"] as const;
type FilterType = typeof SESSION_TYPES[number];

export default function SessionHistory() {
  usePageMeta({ title: "Session History | Clarify AI", description: "Review all your interview practice sessions." });

  const { user }    = useAuthStore();
  const [sessions,  setSessions]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterType>("all");
  const [search,    setSearch]    = useState("");

  useEffect(() => {
    if (!user) return;
    fetchSessions();
  }, [user?.id]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, type, title, overall_score, created_at, started_at, ended_at, questions_asked, status, tags")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("[SessionHistory] Fetch error:", error.message);
        toast.error("Failed to load session history. Please try again.");
        setSessions([]);
      } else {
        setSessions(data ?? []);
      }
    } catch (err) {
      console.error("[SessionHistory] Unexpected error:", err);
      toast.error("Something went wrong loading sessions.");
      setSessions([]);
    }
    setLoading(false);
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
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Sessions"
        subtitle={`${sessions.length} total sessions`}
      />

      {/* ── Filters ──────────────────────────────────── */}
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

      {/* ── Session list ─────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {sessions.length === 0 ? "No sessions yet. Start your first mock interview!" : "No sessions match your filter."}
          </p>
          <Link
            to="/app/mock"
            className="text-xs text-primary hover:opacity-80 mt-2 inline-block transition-opacity"
          >
            Start your first mock →
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
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
    sessionType === "mock"     ? "bg-blue-500/10 text-blue-400" :
    sessionType === "live"     ? "bg-red-500/10 text-red-400"   :
                                 "bg-violet-500/10 text-violet-400";

  const scoreColor =
    s.overall_score === null    ? "text-muted-foreground" :
    s.overall_score >= 75       ? "text-emerald-400" :
    s.overall_score >= 50       ? "text-amber-400"   : "text-red-400";

  // Calculate duration from started_at / ended_at
  let duration: string | null = null;
  if (s.started_at && s.ended_at) {
    const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
    if (ms > 0) duration = `${Math.floor(ms / 60000)}m`;
  }

  return (
    <Link
      to={`/app/sessions/${s.id}`}
      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-card border border-border rounded-2xl hover:bg-secondary/60 hover:border-border transition-all group"
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        iconBg
      )}>
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs sm:text-sm font-semibold text-foreground capitalize">
            {s.title ?? `${sessionType} session`}
          </span>
          <Badge variant="default" size="sm">{sessionType}</Badge>
          {s.status && s.status !== "completed" && (
            <Badge variant="violet" size="sm">{s.status}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {format(new Date(s.created_at), "MMM d, yyyy · h:mm a")}
          </span>
          {s.questions_asked != null && s.questions_asked > 0 && (
            <span className="text-xs text-muted-foreground">
              {s.questions_asked} questions
            </span>
          )}
          {duration && (
            <span className="text-xs text-muted-foreground">{duration}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {s.overall_score !== null && (
          <span className={cn("text-lg font-black", scoreColor)}>
            {s.overall_score}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
