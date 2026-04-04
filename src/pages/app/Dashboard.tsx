// @ts-nocheck -- retained: gamification hook, interviewScheduler hook, and documentStore all return
// inferred any[] types; Supabase generated types also predate manual schema additions
// (sessions.overall_score, target_company) causing implicit-any cascades on data access.
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
  Building2, AlertTriangle,
  ListTodo, PenTool, FolderOpen, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getStealthLabel } from "@/lib/stealth/stealthConfig";

// ─────────────────────────────────────────────────────────────────
// Dashboard
// Hub: credits, streaks, sessions, interview-day banner
// ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, isLoading } = useAuthStore();
  const stealth    = useUIStore((s) => s.stealth_mode);
  const docStore     = useDocumentStore();
  const scheduler    = useInterviewSchedulerStore();
  const gamification = useGamification();
  const navigate     = useNavigate();

  useInterviewScheduler();

  const [sessionCount, setSessionCount] = useState(0);
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .then(({ count }) => setSessionCount(count ?? 0));
  }, [profile?.id]);

  const todayInterview = scheduler.interviews.find((i) => {
    const d = new Date(i.scheduled_at);
    const now = new Date();
    return (
      d.getFullYear()  === now.getFullYear() &&
      d.getMonth()     === now.getMonth()    &&
      d.getDate()      === now.getDate()
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
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

      {/* ── Header ───────────────────────────────────── */}
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
          <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-xl">
            <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
            <span className="text-[10px] sm:text-xs font-bold text-primary">
              {profile?.credits ?? 0} credits
            </span>
          </div>
        </div>
      </div>

      {/* ── Interview Day Banner ──────────────────────── */}
      {todayInterview && (
        <div
          onClick={() => navigate("/app/interview-day")}
          className="flex items-center gap-4 p-4 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-500/30 rounded-2xl cursor-pointer hover:border-violet-500/50 transition-all"
        >
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-foreground font-semibold text-sm">
              {stealth ? "📅 Meeting today" : `🎯 Interview today — ${todayInterview.company_name}`}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {format(new Date(todayInterview.scheduled_at), "h:mm a")} ·{" "}
              {stealth ? "Tap to enter focus mode" : `${todayInterview.role_title} · Tap to enter focus mode`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = stealth ? (action.stealthIcon ?? action.icon) : action.icon;
          const label = getStealthLabel(action.label, stealth);
          const sub = stealth ? (action.stealthSub ?? action.sub) : action.sub;
          return (
            <Link
              key={action.to}
              to={action.to}
              className={cn(
                "flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border transition-all group",
                action.highlight
                  ? "bg-primary/10 border-primary/30 hover:bg-primary/15 hover:border-primary/40"
                  : "bg-card border-border hover:bg-secondary/60 hover:border-border"
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                action.highlight
                  ? "bg-primary/20"
                  : "bg-secondary"
              )}>
                <Icon className={cn(
                  "w-4 h-4",
                  action.highlight ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className={cn(
                  "text-sm font-semibold",
                  action.highlight ? "text-primary" : "text-foreground"
                )}>
                  {label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-colors mt-auto" />
            </Link>
          );
        })}
      </div>

      {/* ── Stats row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total sessions"
          value={sessionCount}
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

      {/* ── Main content: 2-col layout ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left col (2/3) ─────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Recent sessions */}
          <RecentSessions />

          {/* Upcoming interviews */}
          <UpcomingInterviews interviews={scheduler.interviews.slice(0, 3)} />
        </div>

        {/* ── Right col (1/3) ────────────────────────── */}
        <div className="space-y-5">

          {/* Setup checklist */}
          <SetupChecklist />

          {/* XP + level progress */}
          <XPLevelCard gamification={gamification} />

          {/* Documents status */}
          <DocumentsStatusCard />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Quick actions config
// ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    to:        "/app/live",
    icon:      Mic,
    stealthIcon: ListTodo,
    label:     "Live Co-Pilot",
    sub:       "Real interview mode",
    stealthSub: "Join your standup",
    highlight: true,
  },
  {
    to:        "/app/mock",
    icon:      ClipboardList,
    stealthIcon: PenTool,
    label:     "Mock Interview",
    sub:       "Practice session",
    stealthSub: "Review session",
    highlight: false,
  },
  {
    to:        "/app/prep",
    icon:      FlaskConical,
    stealthIcon: FolderOpen,
    label:     "Prep Lab",
    sub:       "STAR builder + tools",
    stealthSub: "Document templates",
    highlight: false,
  },
  {
    to:        "/app/analytics",
    icon:      BarChart2,
    stealthIcon: BarChart3,
    label:     "Analytics",
    sub:       "Progress trends",
    stealthSub: "Team reports",
    highlight: false,
  },
];

// ─────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, trend,
}: {
  label:  string;
  value:  string | number;
  icon:   React.ReactNode;
  color:  string;
  trend?: "up" | "down" | "neutral";
}) {
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

// ─────────────────────────────────────────────────────────────────
// RecentSessions
// ─────────────────────────────────────────────────────────────────

function RecentSessions() {
  const stealth = useUIStore((s) => s.stealth_mode);
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    supabase
      .from("sessions")
      .select("id, type, status, overall_score, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load recent sessions");
        setSessions(data ?? []);
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
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No sessions yet"
          description="Start a mock interview to see your recent activity here."
          actionLabel="Start mock interview"
          onAction={() => window.location.href = "/app/mock"}
          compact
        />
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isMock = s.type === "mock";
            const score = s.overall_score;
            return (
              <Link
                key={s.id}
                to={`/app/sessions/${s.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/5 transition-all group"
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold",
                  isMock
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-violet-500/10 text-violet-400"
                )}>
                  {isMock ? <ClipboardList className="w-3.5 h-3.5" /> : <FlaskConical className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium capitalize">
                    {s.type ?? "Session"}{s.title ? ` — ${s.title}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(s.created_at), "MMM d, h:mm a")}
                  </p>
                </div>
                {score !== null && score !== undefined && (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-lg",
                    score >= 75
                      ? "bg-emerald-500/10 text-emerald-400"
                      : score >= 50
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-red-500/10 text-red-400"
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

// ─────────────────────────────────────────────────────────────────
// UpcomingInterviews
// ─────────────────────────────────────────────────────────────────

function UpcomingInterviews({ interviews }: { interviews: any[] }) {
  const stealth = useUIStore((s) => s.stealth_mode);
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
          description={stealth ? "Add a meeting to track it here." : "Schedule an interview to see it here."}
          actionLabel={stealth ? "+ Add meeting" : "+ Add interview"}
          onAction={() => window.location.href = "/app/interviews/new"}
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
                <p className="text-sm text-foreground font-medium truncate">{iv.company_name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(iv.scheduled_at), "EEE, MMM d · h:mm a")}
                </p>
              </div>
              <Badge variant="violet" size="sm">{iv.interview_type}</Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// XPLevelCard
// ─────────────────────────────────────────────────────────────────

function XPLevelCard({ gamification }: { gamification: any }) {
  const xpForNext = (gamification.level) * 200;
  const xpInLevel = gamification.xp % 200;
  const pct       = Math.round((xpInLevel / xpForNext) * 100);

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
        value={xpInLevel}
        max={xpForNext}
        color="violet"
        size="sm"
        showLabel
        label={`${xpForNext - xpInLevel} XP to next level`}
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// DocumentsStatusCard
// ─────────────────────────────────────────────────────────────────

function DocumentsStatusCard() {
  const docStore   = useDocumentStore();
  const hasResume  = !!docStore.active_resume_id;
  const hasJD      = !!docStore.active_jd_id;

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
        {[
          { label: "Active resume",  ok: hasResume, to: "/app/documents" },
          { label: "Target JD",      ok: hasJD,     to: "/app/documents" },
        ].map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="flex items-center gap-2 text-xs group"
          >
            <span className={cn(
              "w-5 h-5 rounded-md flex items-center justify-center shrink-0",
              item.ok
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            )}>
              {item.ok ? "✓" : "!"}
            </span>
            <span className={cn(
              "flex-1",
              item.ok ? "text-foreground" : "text-amber-400"
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
