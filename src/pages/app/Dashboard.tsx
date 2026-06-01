// src/pages/app/Dashboard.tsx
// FIX: session count flicker (null→skeleton), XP div-by-zero,
// window.location.href→navigate, error handling on queries.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { useUIStore } from "@/store/uiStore";
import { useDocumentStore } from "@/store/documentStore";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useGamification } from "@/hooks/useGamification";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { SetupChecklist } from "@/components/layout/SetupChecklist";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton, SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Mic, ClipboardList, FlaskConical, BarChart2,
  CalendarDays, Flame, Zap, ChevronRight,
  Star, TrendingUp, Trophy, Clock,
  Building2, AlertTriangle, RefreshCw,
  ListTodo, PenTool, FolderOpen, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getStealthLabel } from "@/lib/stealth/stealthConfig";
import type { Tables } from "@/integrations/supabase/types";

/* ─── INLINE ERROR / RETRY (file-local) ──────────────────────────────────── */
// ✅ FIX P0-B: per-section retry banner — failed fetches no longer blank the
// whole dashboard. Keep file-local to avoid touching shared components.
function InlineErrorRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      <span className="flex-1 text-red-300 truncate">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-red-300 hover:text-red-200 font-semibold whitespace-nowrap"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
    </div>
  );
}


/* ─── LOCAL TYPES ────────────────────────────────────────────────────────── */

type SessionRow = Pick<
  Tables<"sessions">,
  "id" | "type" | "status" | "overall_score" | "title" | "created_at"
>;

type ScheduledInterview = {
  id: string;
  company_name: string;
  role_title: string;
  stage?: string;
  status?: string;
  scheduled_at?: string;
  interview_type?: string;
};

interface GamificationData {
  streakCurrent:     number;
  streakLongest:     number;
  xp:                number;
  level:             number;
  levelLabel?:       string;
  // FIX: include computed level-progress fields from useGamification
  xpToNextLevel:     number;
  xpProgressPercent: number;
}

/* ─── QUICK ACTIONS ──────────────────────────────────────────────────────── */

interface QuickAction {
  to:           string;
  icon:         React.ElementType;
  stealthIcon?: React.ElementType;
  label:        string;
  sub:          string;
  stealthSub?:  string;
  highlight:    boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    to:          "/app/live",
    icon:        Mic,
    stealthIcon: ListTodo,
    label:       "Live Co-Pilot",
    sub:         "Real interview mode",
    stealthSub:  "Join your standup",
    highlight:   true,
  },
  {
    to:          "/app/mock",
    icon:        ClipboardList,
    stealthIcon: PenTool,
    label:       "Mock Interview",
    sub:         "Practice session",
    stealthSub:  "Review session",
    highlight:   false,
  },
  {
    to:          "/app/prep",
    icon:        FlaskConical,
    stealthIcon: FolderOpen,
    label:       "Prep Lab",
    sub:         "STAR builder + tools",
    stealthSub:  "Document templates",
    highlight:   false,
  },
  {
    to:          "/app/analytics",
    icon:        BarChart2,
    stealthIcon: BarChart3,
    label:       "Analytics",
    sub:         "Progress trends",
    stealthSub:  "Team reports",
    highlight:   false,
  },
];

/* ─── DASHBOARD ──────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { profile, isLoading } = useAuthStore();
  const stealth    = useUIStore((s) => s.stealth_mode);
  const docStore   = useDocumentStore();
  const scheduler  = useInterviewSchedulerStore();
  const gamification = useGamification() as GamificationData;
  const navigate     = useNavigate();

  useInterviewScheduler();

  // FIX Issue 22: null = loading, number = loaded
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [sessionCountError, setSessionCountError] = useState<string | null>(null);
  const [sessionCountReloadKey, setSessionCountReloadKey] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;
    setSessionCountError(null);
    void supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .then(({ count, error }) => {
        if (error) {
          // ✅ FIX P0-B: surface inline retry instead of silent toast
          setSessionCountError("Couldn't load session count");
          console.error("[Dashboard] session count error:", error);
          return;
        }
        setSessionCount(count ?? 0);
      });
  }, [profile?.id, sessionCountReloadKey]);


  const todayInterview = (scheduler.interviews as ScheduledInterview[]).find((i) => {
    if (!i.scheduled_at) return false;
    const d   = new Date(i.scheduled_at);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth()    === now.getMonth()    &&
      d.getDate()     === now.getDate()
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const hour      = new Date().getHours();
  const greeting  =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="text-[10px] sm:text-xs font-bold text-amber-600 dark:text-amber-400">
              {gamification.streakCurrent} day streak
            </span>
          </div>

          {/* FIX: low-credit warning badge at <50 credits (manual Ch.2) */}
          {(() => {
            const credits     = profile?.credits ?? 0;
            const isLowCredit = credits < 50;
            return (
              <div className={cn(
                "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-xl",
                isLowCredit
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-primary/10 border-primary/20",
              )}>
                {isLowCredit
                  ? <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400" />
                  : <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />}
                <span className={cn(
                  "text-[10px] sm:text-xs font-bold",
                  isLowCredit ? "text-red-400" : "text-primary",
                )}>
                  {credits} credits{isLowCredit ? " — low" : ""}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* FIX: persistent low-credit warning banner (manual Ch.2 — show when <50) */}
      {(profile?.credits ?? 0) < 50 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300 flex-1">
            You have fewer than 50 credits remaining. Top up to keep practising without interruptions.
          </p>
          <a
            href="/app/settings/billing"
            className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap"
          >
            Add credits →
          </a>
        </div>
      )}

      {/* ── Interview Day Banner ────────────────────────────────────── */}
      {todayInterview && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate("/app/interview-day")}
          onKeyDown={(e) => e.key === "Enter" && navigate("/app/interview-day")}
          className="flex items-center gap-4 p-4 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-500/30 rounded-2xl cursor-pointer hover:border-violet-500/50 transition-all"
        >
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-foreground font-semibold text-sm">
              {stealth
                ? "📅 Meeting today"
                : `🎯 Interview today — ${todayInterview.company_name}`}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {format(new Date(todayInterview.scheduled_at!), "h:mm a")} ·{" "}
              {stealth
                ? "Tap to enter focus mode"
                : `${todayInterview.role_title} · Tap to enter focus mode`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      )}

      {/* ── Quick Actions ───────────────────────────────────────────── */}
      {/* FIX Issue 29: smaller padding on xs, truncate labels */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon  = stealth ? (action.stealthIcon ?? action.icon) : action.icon;
          const label = getStealthLabel(action.label, stealth);
          const sub   = stealth ? (action.stealthSub ?? action.sub) : action.sub;
          return (
            <Link
              key={action.to}
              to={action.to}
              className={cn(
                "flex flex-col gap-2 sm:gap-3 p-2 sm:p-4 rounded-2xl border transition-all group",
                action.highlight
                  ? "bg-primary/10 border-primary/30 hover:bg-primary/15 hover:border-primary/40"
                  : "bg-card border-border hover:bg-secondary/60 hover:border-border",
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                action.highlight ? "bg-primary/20" : "bg-secondary",
              )}>
                <Icon className={cn(
                  "w-4 h-4",
                  action.highlight ? "text-primary" : "text-muted-foreground",
                )} />
              </div>
              <div>
                <p className={cn(
                  "text-sm font-semibold truncate",
                  action.highlight ? "text-primary" : "text-foreground",
                )}>
                  {label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-colors mt-auto" />
            </Link>
          );
        })}
      </div>

      {/* ── Stats row ───────────────────────────────────────────────── */}
      {sessionCountError && (
        <InlineErrorRetry
          message={sessionCountError}
          onRetry={() => setSessionCountReloadKey((k) => k + 1)}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total sessions"
          value={sessionCountError ? "—" : sessionCount === null ? "—" : sessionCount}
          icon={<ClipboardList className="w-4 h-4 text-blue-400" />}
          color="blue"
        />

        <StatCard
          label="Credits"
          value={profile?.credits ?? 0}
          icon={<Zap className="w-4 h-4 text-emerald-400" />}
          color="emerald"
        />
        <StatCard
          label="Best streak"
          value={`${gamification.streakLongest}d`}
          icon={<Trophy className="w-4 h-4 text-amber-400" />}
          color="amber"
        />
        <StatCard
          label="XP total"
          value={gamification.xp.toLocaleString()}
          icon={<Zap className="w-4 h-4 text-violet-400" />}
          color="violet"
        />
      </div>

      {/* ── Main content: 2-col layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <RecentSessions />
          <UpcomingInterviews
            interviews={(scheduler.interviews as ScheduledInterview[]).slice(0, 3)}
          />
        </div>
        <div className="space-y-5">
          <SetupChecklist />
          <XPLevelCard gamification={gamification} />
          <DocumentsStatusCard />
        </div>
      </div>
    </div>
  );
}

/* ─── STAT CARD ──────────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string | number;
  icon:  React.ReactNode;
  color: string;
  trend?: "up" | "down" | "neutral";
}

function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {icon}
        {trend === "up" && (
          <span className="text-[10px] text-emerald-400">↑ improving</span>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-black text-foreground">{value}</p>
      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

/* ─── RECENT SESSIONS ────────────────────────────────────────────────────── */

function RecentSessions() {
  const stealth       = useUIStore((s) => s.stealth_mode);
  const { user }      = useAuthStore();
  const navigate      = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    void supabase
      .from("sessions")
      .select("id, type, status, overall_score, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load recent sessions");
        setSessions((data ?? []) as SessionRow[]);
        setLoading(false);
      });
  }, [user?.id]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          {stealth ? "Recent Activity" : "Recent Sessions"}
        </h3>
        <Link
          to="/app/sessions"
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No sessions yet"
          description="Start a mock interview to see your recent activity here."
          actionLabel="Start mock interview"
          // FIX Issue 33: use navigate instead of window.location.href
          onAction={() => navigate("/app/mock")}
          compact
        />
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isMock = s.type === "mock";
            const score  = s.overall_score;
            return (
              <Link
                key={s.id}
                to={`/app/sessions/${s.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/5 transition-all group"
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  isMock
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-violet-500/10 text-violet-400",
                )}>
                  {isMock
                    ? <ClipboardList className="w-3.5 h-3.5" />
                    : <FlaskConical  className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium capitalize">
                    {s.type ?? "Session"}{s.title ? ` — ${s.title}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(s.created_at), "MMM d, h:mm a")}
                  </p>
                </div>
                {score != null && (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-lg",
                    score >= 75
                      ? "bg-emerald-500/10 text-emerald-400"
                      : score >= 50
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-red-500/10 text-red-400",
                  )}>
                    {score}
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── UPCOMING INTERVIEWS ────────────────────────────────────────────────── */

function UpcomingInterviews({ interviews }: { interviews: ScheduledInterview[] }) {
  const stealth  = useUIStore((s) => s.stealth_mode);
  const navigate = useNavigate();

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-violet-400" />
          {stealth ? "Upcoming Meetings" : "Upcoming Interviews"}
        </h3>
        <Link
          to="/app/interviews"
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
        >
          Manage <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {interviews.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={stealth ? "No upcoming meetings" : "No upcoming interviews"}
          description={stealth
            ? "Add a meeting to track it here."
            : "Schedule an interview to see it here."}
          actionLabel={stealth ? "+ Add meeting" : "+ Add interview"}
          // FIX Issue 33: use navigate instead of window.location.href
          onAction={() => navigate("/app/interviews/new")}
          compact
        />
      ) : (
        <div className="space-y-2">
          {interviews.map((iv) => (
            <Link
              key={iv.id}
              to={`/app/interviews/${iv.id}`}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/5 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium truncate">
                  {iv.company_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {iv.scheduled_at
                    ? format(new Date(iv.scheduled_at), "EEE, MMM d · h:mm a")
                    : "Time TBD"}
                </p>
              </div>
              {iv.interview_type && (
                <Badge variant="violet" size="sm">{iv.interview_type}</Badge>
              )}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─── XP LEVEL CARD ──────────────────────────────────────────────────────── */

function XPLevelCard({ gamification }: { gamification: GamificationData }) {
  // FIX: use pre-computed values from useGamification's computeLevel() which
  // correctly uses the non-linear XP_LEVELS thresholds instead of the old
  // flat XP_PER_LEVEL = 200 constant (wrong for levels 2+).
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-xs font-black text-white">
            {gamification.level}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {gamification.levelLabel ?? `Level ${gamification.level}`}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {gamification.xp.toLocaleString()} XP total
            </p>
          </div>
        </div>
        <Zap className="w-4 h-4 text-violet-400" />
      </div>
      <ProgressBar
        value={gamification.xpProgressPercent}
        max={100}
        color="violet"
        size="sm"
        showLabel
        label={`${gamification.xpToNextLevel.toLocaleString()} XP to next level`}
      />
    </Card>
  );
}

/* ─── DOCUMENTS STATUS ───────────────────────────────────────────────────── */

function DocumentsStatusCard() {
  const docStore  = useDocumentStore();
  const hasResume = !!docStore.active_resume_id;
  const hasJD     = !!docStore.active_jd_id;

  const items: { label: string; ok: boolean; to: string }[] = [
    { label: "Active resume", ok: hasResume, to: "/app/documents" },
    { label: "Target JD",     ok: hasJD,     to: "/app/documents" },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-foreground">AI Context</h3>
        <Link
          to="/app/documents"
          className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
        >
          Manage
        </Link>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="flex items-center gap-2 text-xs group"
          >
            <span className={cn(
              "w-5 h-5 rounded-md flex items-center justify-center shrink-0",
              item.ok
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400",
            )}>
              {item.ok ? "✓" : "!"}
            </span>
            <span className={cn(
              "flex-1",
              item.ok ? "text-foreground" : "text-amber-400",
            )}>
              {item.label}
            </span>
            {!item.ok && (
              <span className="text-[10px] text-amber-500 group-hover:text-amber-400 transition-colors">
                Add →
              </span>
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}
