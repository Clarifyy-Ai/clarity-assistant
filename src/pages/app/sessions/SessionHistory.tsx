// @ts-nocheck
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  ClipboardList, Mic, FlaskConical,
  Search, ChevronRight, Filter, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// SessionHistory — all sessions list with filter + search
// ─────────────────────────────────────────────────────────────────

const SESSION_TYPES = ["all", "mock", "live", "prep"] as const;
type FilterType = typeof SESSION_TYPES[number];

export default function SessionHistory() {
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
    const { data } = await supabase
      .from("sessions")
      .select("id, session_type, interview_type, target_company, overall_score, created_at, duration_seconds, question_count")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setSessions(data ?? []);
    setLoading(false);
  }

  const filtered = sessions.filter((s) => {
    if (filter !== "all" && s.session_type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.target_company?.toLowerCase().includes(q) ||
        s.interview_type?.toLowerCase().includes(q) ||
        s.session_type?.toLowerCase().includes(q)
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
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                  : "bg-white/3 border-white/10 text-gray-500 hover:text-gray-300"
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
          <ClipboardList className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No sessions found.</p>
          <Link
            to="/app/mock"
            className="text-xs text-violet-400 hover:text-violet-300 mt-2 inline-block transition-colors"
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
  const icon =
    s.session_type === "mock"  ? <ClipboardList className="w-4 h-4" /> :
    s.session_type === "live"  ? <Mic className="w-4 h-4" /> :
                                 <FlaskConical className="w-4 h-4" />;

  const iconBg =
    s.session_type === "mock"  ? "bg-blue-500/10 text-blue-400" :
    s.session_type === "live"  ? "bg-red-500/10 text-red-400"   :
                                 "bg-violet-500/10 text-violet-400";

  const scoreColor =
    s.overall_score === null ? "text-gray-600" :
    s.overall_score >= 75    ? "text-emerald-400" :
    s.overall_score >= 50    ? "text-amber-400"   : "text-red-400";

  const duration = s.duration_seconds
    ? `${Math.floor(s.duration_seconds / 60)}m`
    : null;

  return (
    <Link
      to={`/app/sessions/${s.id}`}
      className="flex items-center gap-4 p-4 bg-white/3 border border-white/8 rounded-2xl hover:bg-white/5 hover:border-white/15 transition-all group"
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        iconBg
      )}>
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white capitalize">
            {s.session_type} Interview
          </span>
          {s.interview_type && (
            <Badge variant="default" size="sm">{s.interview_type}</Badge>
          )}
          {s.target_company && (
            <Badge variant="violet" size="sm">{s.target_company}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-500">
            {format(new Date(s.created_at), "MMM d, yyyy · h:mm a")}
          </span>
          {s.question_count && (
            <span className="text-xs text-gray-600">
              {s.question_count} questions
            </span>
          )}
          {duration && (
            <span className="text-xs text-gray-600">{duration}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {s.overall_score !== null && (
          <span className={cn("text-lg font-black", scoreColor)}>
            {s.overall_score}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  );
}
