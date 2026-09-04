// src/pages/app/Dashboard.tsx
// FIX: session count flicker (null→skeleton), XP div-by-zero,
// window.location.href→navigate, error handling on queries.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useDocumentStore } from "@/store/documentStore";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useGamification } from "@/hooks/useGamification";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useDocuments } from "@/hooks/useDocuments";
import { useDashboardData, type DashboardSessionRow } from "@/hooks/useDashboardData";
import { SetupChecklist } from "@/components/layout/SetupChecklist";
import { LowCreditBanner, useLowCreditState } from "@/components/billing/LowCreditBanner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { XPProgressRing } from "@/components/gamification/XPProgressRing";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton, SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  Mic, ClipboardList, FlaskConical, BarChart2, Landmark,
  CalendarDays, Flame, Zap, Coins, ChevronRight, ChevronDown,
  TrendingUp, Trophy, Clock,
  Building2, AlertTriangle, Info,
  ListTodo, PenTool, FolderOpen, BarChart3, FileSpreadsheet,
  Sparkles, Upload, CheckCircle, Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getStealthLabel } from "@/lib/stealth/stealthConfig";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import { isElectronApp } from "@/lib/platform/isElectron";
import { PlanGate } from "@/components/layout/PlanGate";
import { upcomingInterviewsForDashboard } from "@/lib/interviews/upcomingInterviews";
import { normalizePlanId } from "@/lib/billing/planIds";

const IS_ELECTRON = isElectronApp();

/* ─── LOCAL TYPES ────────────────────────────────────────────────────────── */

type SessionRow = DashboardSessionRow;

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

function computeReadinessScore(params: {
  sessionCount: number | null;
  streakCurrent: number;
  hasResume: boolean;
  hasJD: boolean;
  hasSession: boolean;
  onboardingCompleted: boolean;
}): number {
  const sessions = params.sessionCount ?? 0;
  const sessionScore = Math.min(40, (sessions / 10) * 40);
  const streakScore = Math.min(30, (params.streakCurrent / 7) * 30);
  const prepSteps = [
    params.hasResume,
    params.hasJD,
    params.hasSession,
    params.onboardingCompleted,
  ];
  const prepScore = (prepSteps.filter(Boolean).length / prepSteps.length) * 30;
  return Math.round(Math.min(100, sessionScore + streakScore + prepScore));
}

const READINESS_TOOLTIP =
  "Activity readiness (not an interview score). Combines practice sessions (up to 40 pts), " +
  "your current streak (up to 30 pts), and setup completion — resume, job description, " +
  "first session, and audio test (up to 30 pts). Interview scores come only from scored scorecards.";

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

const QUICK_LAUNCH: { to: string; icon: React.ElementType; label: string }[] = [
  { to: "/app/mock",      icon: ClipboardList, label: "Mock Interview" },
  { to: "/app/live", icon: Mic, label: PRODUCT_NAMES.practiceCoach },
  { to: "/app/documents", icon: Upload,         label: "Upload" },
  { to: "/app/analytics", icon: BarChart2,      label: PRODUCT_NAMES.analytics },
];

const QUICK_ACTIONS: QuickAction[] = [
  {
    to:          "/app/live",
    icon:        Mic,
    stealthIcon: ListTodo,
    label:       PRODUCT_NAMES.practiceCoach,
    sub:         "Practice session",
    stealthSub:  "Join your standup",
    highlight:   true,
  },
  {
    to:          "/app/mock",
    icon:        ClipboardList,
    stealthIcon: PenTool,
    label:       PRODUCT_NAMES.mockInterview,
    sub:         "Practice session",
    stealthSub:  "Review session",
    highlight:   false,
  },
  {
    to:          "/app/mock-test",
    icon:        Landmark,
    stealthIcon: FileSpreadsheet,
    label:       PRODUCT_NAMES.govExams,
    sub:         "UPSC · SSC · IBPS MCQ",
    stealthSub:  "Assessment module",
    highlight:   false,
  },
  {
    to:          "/app/prep",
    icon:        FlaskConical,
    stealthIcon: FolderOpen,
    label:       PRODUCT_NAMES.prepLab,
    sub:         "STAR builder + tools",
    stealthSub:  "Document templates",
    highlight:   false,
  },
  {
    to:          "/app/analytics",
    icon:        BarChart2,
    stealthIcon: BarChart3,
    label:       PRODUCT_NAMES.analytics,
    sub:         "Progress trends",
    stealthSub:  "Team reports",
    highlight:   false,
  },
];

/* ─── DASHBOARD ──────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { profile, user, isProfileLoaded } = useAuthStore();
  const stealth    = useUIStore((s) => s.stealth_mode);
  const scheduler  = useInterviewSchedulerStore();
  const docStore   = useDocumentStore();
  const gamification = useGamification();
  const navigate     = useNavigate();

  useDocuments();
  const { reload: reloadInterviews } = useInterviewScheduler();

  const [showMore, setShowMore] = useState(false);

  const userId = profile?.id ?? user?.id;
  const dashboardData = useDashboardData(userId);
  const {
    sessionCount,
    sessionCountError,
    sessionCountRefreshing,
    recentSessions,
    recentError,
    recentInitialLoading,
    recentRefreshing,
    backgroundRefreshing,
    retrySessionCount,
    retryRecent,
  } = dashboardData;


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

  const profileLoading = Boolean(userId) && !isProfileLoaded;
  const gamificationLoading = gamification.isLoading && !gamification.xp && gamification.streakCurrent === 0;
  const { isLow: isLowCredit, balance: creditBalance } = useLowCreditState();

  const readinessScore = computeReadinessScore({
    sessionCount,
    streakCurrent: gamification.streakCurrent,
    hasResume: !!docStore.active_resume_id,
    hasJD: !!docStore.active_jd_id,
    hasSession: (profile?.xp ?? 0) > 0,
    onboardingCompleted: profile?.onboarding_completed ?? false,
  });
  const readinessLoading =
    gamificationLoading || sessionCount === null || profileLoading;
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const hour      = new Date().getHours();
  const greeting  =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" : "Good evening";

  const sessionCountLoaded = sessionCount !== null;
  const isNewUser = sessionCountLoaded && sessionCount === 0;
  const isReturningUser = sessionCountLoaded && sessionCount > 0;
  // More is available to all returning users. Free-tier users see secondary
  // widgets behind a PlanGate upsell; Pro+ get full unlocked expansion.
  // Legacy starter plan_id is treated as Free via normalizePlanId.
  const planId = normalizePlanId(profile?.plan_id);
  const isFreeOrStarter = planId === "free";
  const showSecondary = isNewUser
    ? false
    : isReturningUser
      ? showMore
      : sessionCountLoaded;

  return (
    <div className="space-y-6">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {backgroundRefreshing
          ? "Refreshing dashboard data"
          : sessionCountError || recentError
            ? "Some dashboard sections failed to update"
            : "Dashboard ready"}
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {greeting}, {firstName}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
            {backgroundRefreshing && (
              <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                  aria-hidden="true"
                />
                Updating
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {profile?.onboarding_completed && (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span className="text-[10px] sm:text-xs font-bold text-emerald-400">
                Setup Complete
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Flame
              className={cn(
                "w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 dark:text-amber-400",
                !gamificationLoading && gamification.streakCurrent > 0 && "animate-streak-flame",
              )}
            />
            <span className="text-[10px] sm:text-xs font-bold text-amber-600 dark:text-amber-400">
              {gamificationLoading ? "…" : `${gamification.streakCurrent} day streak`}
            </span>
          </div>

          {isLowCredit && !profileLoading ? (
            <Link
              to="/app/usage"
              className={cn(
                "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-xl",
                "bg-red-500/10 border-red-500/30 hover:bg-red-500/15 transition-colors",
              )}
            >
              <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400" />
              <span className="text-[10px] sm:text-xs font-bold text-red-400">
                {creditBalance} credits — low
              </span>
            </Link>
          ) : (
            <Link
              to="/app/usage"
              aria-label="Credits remaining — open usage"
              title="Credits remaining"
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-xl bg-primary/10 border-primary/20 hover:bg-primary/15 transition-colors"
            >
              <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" aria-hidden />
              <span className="text-[10px] sm:text-xs font-bold text-primary">
                {profileLoading ? "…" : creditBalance} credits
              </span>
            </Link>
          )}
        </div>
      </div>

      {!profileLoading && (creditBalance <= 0 || isLowCredit) && <LowCreditBanner />}

      {!profileLoading && !profile?.onboarding_completed && (
        <SetupChecklist prominent dismissible />
      )}

      {/* ── Interview Day Banner ────────────────────────────────────── */}
      {todayInterview && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate("/app/interview-day")}
          onKeyDown={(e) => e.key === "Enter" && navigate("/app/interview-day")}
          className="flex items-center gap-4 p-4 bg-gradient-to-r from-primary/20 to-blue-600/20 border border-primary/30 rounded-2xl cursor-pointer hover:border-primary/50 transition-all"
        >
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-foreground font-semibold text-sm">
              {stealth
                ? "Meeting today"
                : `Interview today — ${todayInterview.company_name}`}
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

      {/* ── Primary CTA: returning users ───────────────────────────── */}
      {isReturningUser && (
        <Link
          to="/app/live"
          className="flex items-center gap-4 p-5 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 to-blue-600/10 hover:border-primary/50 hover:from-primary/20 transition-all group"
        >
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center shrink-0">
            <Mic className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-foreground">Start Practice</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {getStealthLabel(PRODUCT_NAMES.practiceCoach, stealth)} — jump into a live coaching session
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* ── First-run CTA for brand-new users ─────────────────────── */}
      {isNewUser && (
        <Card className="bg-gradient-to-br from-primary/10 via-indigo-600/10 to-blue-600/10 border-primary/20">
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-lg font-bold text-foreground">Welcome to Career Pilot!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Career Pilot helps you prepare for interviews, exams, and career growth. Start your first {getStealthLabel(PRODUCT_NAMES.practiceCoach, stealth).toLowerCase()} session to get real-time coaching.
              </p>
            </div>
            <Link
              to="/app/live"
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:opacity-90 transition-opacity"
            >
              <Mic className="w-4 h-4" />
              Start {PRODUCT_NAMES.practiceCoach}
            </Link>
          </div>
        </Card>
      )}

      {isReturningUser && (
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={showMore}
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", showMore && "rotate-180")} />
          {showMore ? "Less" : "More"}
        </button>
      )}

      {showSecondary && (
        <>
      {!IS_ELECTRON && (
        <div
          data-testid="desktop-installer-card"
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 p-4 rounded-2xl border border-border bg-card min-w-0"
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div data-testid="desktop-installer-copy" className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Desktop app</p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                Install Career Pilot for system-wide hotkeys and the floating Practice Coach overlay.
              </p>
            </div>
          </div>
          <div
            data-testid="desktop-installer-controls"
            className="w-full sm:w-auto sm:max-w-xs shrink-0 min-w-0"
          >
            <DesktopDownloadButton
              size="sm"
              variant="outline"
              showGuideLink={false}
              fullWidth
              compact
            />
          </div>
        </div>
      )}

      {isFreeOrStarter ? (
        <PlanGate requiredPlan="pro">
          <DashboardSecondaryWidgets
            stealth={stealth}
            sessionCount={sessionCount}
            sessionCountError={sessionCountError}
            sessionCountRefreshing={sessionCountRefreshing}
            onRetrySessionCount={retrySessionCount}
            recentSessions={recentSessions}
            recentError={recentError}
            recentInitialLoading={recentInitialLoading}
            recentRefreshing={recentRefreshing}
            onRetryRecent={retryRecent}
            profileLoading={profileLoading}
            profile={profile}
            gamification={gamification}
            gamificationLoading={gamificationLoading}
            readinessScore={readinessScore}
            readinessLoading={readinessLoading}
            scheduler={scheduler}
            reloadInterviews={reloadInterviews}
          />
        </PlanGate>
      ) : (
        <DashboardSecondaryWidgets
          stealth={stealth}
          sessionCount={sessionCount}
          sessionCountError={sessionCountError}
          sessionCountRefreshing={sessionCountRefreshing}
          onRetrySessionCount={retrySessionCount}
          recentSessions={recentSessions}
          recentError={recentError}
          recentInitialLoading={recentInitialLoading}
          recentRefreshing={recentRefreshing}
          onRetryRecent={retryRecent}
          profileLoading={profileLoading}
          profile={profile}
          gamification={gamification}
          gamificationLoading={gamificationLoading}
          readinessScore={readinessScore}
          readinessLoading={readinessLoading}
          scheduler={scheduler}
          reloadInterviews={reloadInterviews}
        />
      )}
        </>
      )}
    </div>
  );
}

/* ─── SECONDARY WIDGETS (More section) ───────────────────────────────────── */

function DashboardSecondaryWidgets({
  stealth,
  sessionCount,
  sessionCountError,
  sessionCountRefreshing,
  onRetrySessionCount,
  recentSessions,
  recentError,
  recentInitialLoading,
  recentRefreshing,
  onRetryRecent,
  profileLoading,
  profile,
  gamification,
  gamificationLoading,
  readinessScore,
  readinessLoading,
  scheduler,
  reloadInterviews,
}: {
  stealth: boolean;
  sessionCount: number | null;
  sessionCountError: string | null;
  sessionCountRefreshing: boolean;
  onRetrySessionCount: () => void;
  recentSessions: SessionRow[];
  recentError: string | null;
  recentInitialLoading: boolean;
  recentRefreshing: boolean;
  onRetryRecent: () => void;
  profileLoading: boolean;
  profile: { credits?: number | null; onboarding_completed?: boolean | null } | null;
  gamification: GamificationData;
  gamificationLoading: boolean;
  readinessScore: number;
  readinessLoading: boolean;
  scheduler: {
    interviews: ScheduledInterview[];
    is_loading: boolean;
    load_error: string | null;
  };
  reloadInterviews: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* ── Quick Launch Bar (Mock · Overlay · Upload · Analytics) ─── */}
      <div className="flex flex-wrap gap-2">
        {QUICK_LAUNCH.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary/60 hover:border-primary/30 transition-all text-sm font-medium text-foreground"
            >
              <Icon className="w-4 h-4 text-primary" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
          onRetry={onRetrySessionCount}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total sessions"
          value={sessionCountError ? "—" : sessionCount ?? 0}
          icon={<ClipboardList className="w-4 h-4 text-blue-400" />}
          color="blue"
          loading={sessionCount === null && !sessionCountError}
          refreshing={sessionCountRefreshing && sessionCount !== null}
        />

        <StatCard
          label="Credits"
          value={profileLoading ? "—" : (profile?.credits ?? 0)}
          icon={<Zap className="w-4 h-4 text-emerald-400" />}
          color="emerald"
          loading={profileLoading}
          href="/app/usage"
        />
        <StatCard
          label="Best streak"
          value={gamificationLoading ? "—" : `${gamification.streakLongest}d`}
          icon={<Trophy className="w-4 h-4 text-amber-400" />}
          color="amber"
          loading={gamificationLoading}
        />
        <StatCard
          label="XP total"
          value={gamificationLoading ? "—" : gamification.xp.toLocaleString()}
          icon={<Zap className="w-4 h-4 text-primary" />}
          color="violet"
          loading={gamificationLoading}
        />
      </div>

      {/* ── Main content: 2-col layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <RecentActivityFeed
            sessions={recentSessions}
            loading={recentInitialLoading && recentSessions.length === 0}
            refreshing={recentRefreshing}
            error={recentError}
            onRetry={onRetryRecent}
          />
          <UpcomingInterviews
            interviews={upcomingInterviewsForDashboard(scheduler.interviews as never, 3) as unknown as ScheduledInterview[]}
            loading={scheduler.is_loading}
            error={scheduler.load_error}
            onRetry={() => void reloadInterviews()}
          />
        </div>
        <div className="space-y-5">
          <ReadinessScoreCard score={readinessScore} loading={readinessLoading} />
          {profile?.onboarding_completed && <SetupChecklist />}
          <XPLevelCard
            gamification={gamification}
            loading={gamificationLoading}
          />
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
  loading?: boolean;
  refreshing?: boolean;
  href?: string;
}

function StatCard({ label, value, icon, trend, loading, refreshing, href }: StatCardProps) {
  const body = (
    <Card className={cn("flex flex-col gap-2", href && "transition-colors hover:border-primary/40")}>
      <div className="flex items-center justify-between">
        {icon}
        {trend === "up" && (
          <span className="text-[10px] text-emerald-400">↑ improving</span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-xl sm:text-2xl font-black text-foreground">
          {value}
          {refreshing ? (
            <span className="ml-2 align-middle text-[10px] font-semibold text-muted-foreground">
              updating
            </span>
          ) : null}
        </p>
      )}
      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    );
  }
  return body;
}

/* ─── RECENT ACTIVITY FEED ───────────────────────────────────────────────── */

function RecentActivityFeed({
  sessions,
  loading,
  refreshing,
  error,
  onRetry,
}: {
  sessions: SessionRow[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Recent Sessions
          {refreshing && (
            <span className="text-[10px] font-medium text-muted-foreground">updating</span>
          )}
        </h3>
        <Link
          to="/app/sessions"
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {error ? (
        <InlineErrorRetry
          message={error}
          onRetry={onRetry}
        />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>

      ) : sessions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No sessions yet"
          description="Start a mock interview or Practice Coach session to see them here."
          actionLabel="Start mock interview"
          // FIX Issue 33: use navigate instead of window.location.href
          onAction={() => navigate("/app/mock")}
          compact
        />
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isMock = /mock/i.test(String(s.type ?? ""));
            const score  = s.overall_score;
            return (
              <Link
                key={s.id}
                to={s.detailRoute || `/app/sessions/${s.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/5 transition-all group"
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  isMock
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-primary/10 text-primary",
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
                    {s.contextLine ? `${s.contextLine} · ` : ""}
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

function UpcomingInterviews({
  interviews,
  loading,
  error,
  onRetry,
}: {
  interviews: ScheduledInterview[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const stealth  = useUIStore((s) => s.stealth_mode);
  const navigate = useNavigate();

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          {stealth ? "Upcoming Meetings" : "Upcoming Interviews"}
        </h3>
        <Link
          to="/app/interviews"
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          Manage <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {error ? (
        <InlineErrorRetry
          message={error}
          onRetry={() => onRetry?.()}
        />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : interviews.length === 0 ? (
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
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5 text-primary" />
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
                <Badge variant="primary" size="sm">{iv.interview_type}</Badge>
              )}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─── READINESS SCORE ────────────────────────────────────────────────────── */

function ReadinessScoreCard({
  score,
  loading,
}: {
  score: number;
  loading?: boolean;
}) {
  const color =
    score >= 75 ? "emerald" :
    score >= 50 ? "amber" :
    "red";

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-20 w-full rounded-xl" />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-semibold text-foreground">Activity readiness</h3>
          <Tooltip
            content={READINESS_TOOLTIP}
            side="bottom"
            className="whitespace-normal max-w-[240px] text-left"
          >
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="How activity readiness is calculated"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
        <span className={cn(
          "text-2xl font-black tabular-nums",
          color === "emerald" && "text-emerald-400",
          color === "amber" && "text-amber-400",
          color === "red" && "text-red-400",
        )}>
          {score}
        </span>
      </div>
      <ProgressBar
        value={score}
        max={100}
        color={color}
        size="sm"
        showLabel
        label={`${score}/100 activity readiness`}
      />
    </Card>
  );
}

/* ─── XP LEVEL CARD ──────────────────────────────────────────────────────── */

function XPLevelCard({
  gamification,
  loading,
}: {
  gamification: GamificationData;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <Skeleton className="h-20 w-full rounded-xl" />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-4 mb-3">
        <XPProgressRing
          percent={gamification.xpProgressPercent}
          level={gamification.level}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {gamification.levelLabel ?? `Level ${gamification.level}`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {gamification.xp.toLocaleString()} XP total
          </p>
          <p className="text-[10px] text-primary mt-0.5">
            {gamification.xpToNextLevel.toLocaleString()} XP to next level
          </p>
        </div>
        <Zap className="w-4 h-4 text-primary shrink-0" />
      </div>
      <ProgressBar
        value={gamification.xpProgressPercent}
        max={100}
        color="violet"
        size="sm"
        showLabel
        label={`${gamification.xpProgressPercent}% to level ${gamification.level + 1}`}
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
          className="text-[10px] text-primary hover:text-primary/80 transition-colors"
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
