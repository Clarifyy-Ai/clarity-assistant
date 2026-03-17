import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useGamification } from "@/hooks/useGamification";
import { SetupChecklist } from "@/components/layout/SetupChecklist";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton, SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Mic, ClipboardList, FlaskConical, BarChart2,
  CalendarDays, Flame, Zap, ChevronRight,
  Star, TrendingUp, Trophy, Clock,
  Building2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// Dashboard
// Hub: credits, streaks, sessions, interview-day banner
// ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, isLoading } = useAuthStore();
  const docStore     = useDocumentStore();
  const scheduler    = useInterviewSchedulerStore();
  const gamification = useGamification();
  const navigate     = useNavigate();

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400">
              {gamification.streakCurrent} day streak
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-bold text-violet-400">
              {profile?.credits_remaining ?? 0} credits
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
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">
              🎯 Interview today — {todayInterview.company_name}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {format(new Date(todayInterview.scheduled_at), "h:mm a")} ·{" "}
              {todayInterview.role_title} · Tap to enter focus mode
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className={cn(
              "flex flex-col gap-3 p-4 rounded-2xl border transition-all group",
              "hover:border-white/20",
              action.highlight
                ? "bg-violet-600/10 border-violet-500/30 hover:bg-violet-600/15"
                : "bg-white/5 border-white/10 hover:bg-white/8"
            )}
          >
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center",
              action.highlight
                ? "bg-violet-600/30"
                : "bg-white/8"
            )}>
              <action.icon className={cn(
                "w-4 h-4",
                action.highlight ? "text-violet-300" : "text-gray-400"
              )} />
            </div>
            <div>
              <p className={cn(
                "text-sm font-semibold",
                action.highlight ? "text-violet-200" : "text-white"
              )}>
                {action.label}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{action.sub}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors mt-auto" />
          </Link>
        ))}
      </div>

      {/* ── Stats row ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total sessions"
          value={profile?.total_sessions ?? 0}
          icon={<ClipboardList className="w-4 h-4 text-blue-400" />}
          color="blue"
        />
        <StatCard
          label="Avg confidence"
          value={`${profile?.avg_confidence_score ?? 0}%`}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          color="emerald"
          trend={
            (profile?.avg_confidence_score ?? 0) >= 70
              ? "up"
              : "neutral"
          }
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
    label:     "Live Co-Pilot",
    sub:       "Real interview mode",
    highlight: true,
  },
  {
    to:        "/app/mock",
    icon:      ClipboardList,
    label:     "Mock Interview",
    sub:       "Practice session",
    highlight: false,
  },
  {
    to:        "/app/prep",
    icon:      FlaskConical,
    label:     "Prep Lab",
    sub:       "STAR builder + tools",
    highlight: false,
  },
  {
    to:        "/app/analytics",
    icon:      BarChart2,
    label:     "Analytics",
    sub:       "Progress trends",
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
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// RecentSessions
// ─────────────────────────────────────────────────────────────────

function RecentSessions() {
  // In production this would read from sessionStore or a hook
  const placeholder = [
    { id: "1", type: "Mock",    score: 74, date: "Today, 9:41 AM",    company: "Google"  },
    { id: "2", type: "Mock",    score: 68, date: "Yesterday, 3:12 PM", company: "Stripe"  },
    { id: "3", type: "Prep Lab",score: null,date: "2 days ago",        company: null      },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Recent Sessions</h3>
        <Link
          to="/app/sessions"
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {placeholder.map((s) => (
          <Link
            key={s.id}
            to={`/app/sessions/${s.id}`}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold",
              s.type === "Mock"
                ? "bg-blue-500/10 text-blue-400"
                : "bg-violet-500/10 text-violet-400"
            )}>
              {s.type === "Mock" ? <ClipboardList className="w-3.5 h-3.5" /> : <FlaskConical className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">
                {s.type}{s.company ? ` — ${s.company}` : ""}
              </p>
              <p className="text-xs text-gray-500">{s.date}</p>
            </div>
            {s.score !== null && (
              <span className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-lg",
                s.score >= 75
                  ? "bg-emerald-500/10 text-emerald-400"
                  : s.score >= 50
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-red-500/10 text-red-400"
              )}>
                {s.score}
              </span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-500 transition-colors" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// UpcomingInterviews
// ─────────────────────────────────────────────────────────────────

function UpcomingInterviews({ interviews }: { interviews: any[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-violet-400" />
          Upcoming Interviews
        </h3>
        <Link
          to="/app/interviews"
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
        >
          Manage <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {interviews.length === 0 ? (
        <div className="text-center py-6">
          <CalendarDays className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 text-xs">No upcoming interviews scheduled.</p>
          <Link
            to="/app/interviews/new"
            className="text-xs text-violet-400 hover:text-violet-300 mt-1 inline-block transition-colors"
          >
            + Add interview
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {interviews.map((iv) => (
            <Link
              key={iv.id}
              to={`/app/interviews/${iv.id}`}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{iv.company_name}</p>
                <p className="text-xs text-gray-500">
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
            <p className="text-xs font-semibold text-white">
              {gamification.levelLabel ?? `Level ${gamification.level}`}
            </p>
            <p className="text-[10px] text-gray-500">
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
  const hasResume  = !!docStore.activeResume;
  const hasJD      = !!docStore.activeJD;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white">AI Context</h3>
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
              item.ok ? "text-gray-300" : "text-amber-400"
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
