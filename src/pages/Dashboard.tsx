import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useGamification } from "@/hooks/useGamification";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { formatDistanceToNow } from "date-fns";
import {
  Mic2, Brain, BarChart3, Calendar, BookOpen,
  FileText, Users, ChevronRight, Flame, Zap,
  Trophy, Star, TrendingUp, Clock, Target,
  AlertCircle, Wifi, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Dashboard
// Primary landing page post-login. Shows: today's interviews,
// quick actions, progress overview, recent sessions, streak.
// ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate                  = useNavigate();
  const { profile }               = useAuth();
  const gamification              = useGamification();
  const { todayInterviews }       = useInterviewScheduler();
  const { summary, isLoading }    = useAnalytics();
  const { mode, qualityLabel }    = useNetworkMonitor();

  // ── Greet by time of day ──────────────────────────────────────

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  // ── Quick actions ─────────────────────────────────────────────

  const quickActions = [
    {
      label:       "Start Mock Session",
      description: "Practise with AI questions",
      icon:        Brain,
      href:        "/mock/setup",
      color:       "from-violet-500 to-purple-600",
      primary:     true,
    },
    {
      label:       "Live Co-pilot",
      description: "Real interview assistance",
      icon:        Mic2,
      href:        "/live/setup",
      color:       "from-emerald-500 to-teal-600",
      primary:     false,
    },
    {
      label:       "Prep Lab",
      description: "STAR builder & answer bank",
      icon:        BookOpen,
      href:        "/prep",
      color:       "from-blue-500 to-cyan-600",
      primary:     false,
    },
    {
      label:       "View Analytics",
      description: "Track your progress",
      icon:        BarChart3,
      href:        "/analytics",
      color:       "from-amber-500 to-orange-600",
      primary:     false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {greeting}, {firstName} 👋
            </h1>
            <p className="text-gray-400 mt-1">
              {todayInterviews.length > 0
                ? `You have ${todayInterviews.length} interview${todayInterviews.length > 1 ? "s" : ""} today`
                : "Ready to practise?"}
            </p>
          </div>

          {/* Network badge */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium",
            mode === "offline"   ? "bg-red-500/10 text-red-400" :
            mode === "degraded"  ? "bg-yellow-500/10 text-yellow-400" :
                                   "bg-green-500/10 text-green-400"
          )}>
            {mode === "offline" ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            {qualityLabel}
          </div>
        </div>

        {/* ── Today's interviews ──────────────────────────── */}
        {todayInterviews.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-violet-400" />
              Today's Interviews
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todayInterviews.map((interview) => (
                <TodayInterviewCard
                  key={interview.id}
                  interview={interview}
                  onLaunch={() => navigate(`/live/setup?interview=${interview.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── XP + Streak bar ─────────────────────────────── */}
        <XPProgressBar gamification={gamification} />

        {/* ── Quick actions ───────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <QuickActionCard key={action.href} {...action} />
            ))}
          </div>
        </section>

        {/* ── Stats overview ──────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Sessions"
            value={summary?.totalSessions ?? "—"}
            icon={Target}
            loading={isLoading}
          />
          <StatCard
            label="Practice Hours"
            value={summary ? `${summary.practiceHours.toFixed(1)}h` : "—"}
            icon={Clock}
            loading={isLoading}
          />
          <StatCard
            label="Avg Score"
            value={summary ? `${summary.avgScore}` : "—"}
            icon={TrendingUp}
            delta={summary?.scoreDelta}
            loading={isLoading}
          />
          <StatCard
            label="Filler Rate"
            value={summary ? `${summary.avgFillerRate.toFixed(1)}/min` : "—"}
            icon={AlertCircle}
            loading={isLoading}
            lowerIsBetter
          />
        </section>

        {/* ── Pending badge unlock ────────────────────────── */}
        {gamification.pendingBadge && (
          <BadgeUnlockToast
            badgeId={gamification.pendingBadge}
            onDismiss={gamification.clearPendingBadge}
          />
        )}

        {/* ── Bottom nav links ─────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Explore</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NavTile
              label="Document Vault"
              description="Manage resumes and JDs"
              icon={FileText}
              href="/documents"
            />
            <NavTile
              label="Practice Rooms"
              description="Collaborative mock interviews"
              icon={Users}
              href="/rooms"
            />
            <NavTile
              label="Interview Tracker"
              description="Pipeline and calendar"
              icon={Calendar}
              href="/scheduler"
            />
          </div>
        </section>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function TodayInterviewCard({
  interview,
  onLaunch,
}: {
  interview: any;
  onLaunch: () => void;
}) {
  const nextRound = interview.next_round;
  return (
    <div className="bg-gradient-to-r from-violet-600/20 to-purple-600/10 border border-violet-500/30 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="font-semibold text-white">{interview.company_name}</p>
        <p className="text-sm text-gray-400">{interview.role_title}</p>
        {nextRound?.scheduled_at && (
          <p className="text-xs text-violet-300 mt-1">
            {new Date(nextRound.scheduled_at).toLocaleTimeString([], {
              hour: "2-digit", minute: "2-digit",
            })}
            {" · "}
            {nextRound.round_label}
          </p>
        )}
      </div>
      <button
        onClick={onLaunch}
        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Launch Co-pilot
      </button>
    </div>
  );
}

function XPProgressBar({ gamification }: { gamification: any }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-white">
            Level {gamification.level} — {gamification.levelLabel}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300 font-medium">
              {gamification.streakCurrent}d streak
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {gamification.xpToNextLevel} XP to next level
          </span>
        </div>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full transition-all duration-700"
          style={{ width: `${gamification.xpProgressPercent}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-500">{gamification.xp} XP total</span>
        <span className="text-xs text-gray-500">
          {gamification.unlockedBadges.length} badges
        </span>
      </div>
    </div>
  );
}

function QuickActionCard({
  label, description, icon: Icon, href, color, primary,
}: {
  label: string; description: string; icon: any;
  href: string; color: string; primary: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "group relative rounded-xl p-5 border transition-all duration-200 hover:scale-[1.02]",
        primary
          ? "bg-gradient-to-br from-violet-600/30 to-purple-700/20 border-violet-500/40 hover:border-violet-400/60"
          : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/8"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3",
        color
      )}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="font-semibold text-white text-sm">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
    </Link>
  );
}

function StatCard({
  label, value, icon: Icon, loading, delta, lowerIsBetter,
}: {
  label: string; value: string | number; icon: any;
  loading: boolean; delta?: number; lowerIsBetter?: boolean;
}) {
  const isPositive = lowerIsBetter ? (delta ?? 0) < 0 : (delta ?? 0) > 0;
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-16 bg-white/10 rounded animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold text-white">{value}</span>
          {delta !== undefined && (
            <span className={cn(
              "text-xs font-medium mb-1",
              isPositive ? "text-green-400" : "text-red-400"
            )}>
              {delta > 0 ? "+" : ""}{delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function NavTile({
  label, description, icon: Icon, href,
}: {
  label: string; description: string; icon: any; href: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/8 hover:border-white/20 transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-gray-300" />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-white text-sm">{label}</p>
        <p className="text-xs text-gray-400 truncate">{description}</p>
      </div>
      <ChevronRight className="ml-auto w-4 h-4 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
    </Link>
  );
}

function BadgeUnlockToast({
  badgeId,
  onDismiss,
}: {
  badgeId: string;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gradient-to-r from-yellow-600/20 to-amber-600/10 border border-yellow-500/40 rounded-xl px-5 py-4 shadow-2xl animate-in slide-in-from-bottom-4">
      <Trophy className="w-8 h-8 text-yellow-400 shrink-0" />
      <div>
        <p className="font-semibold text-white text-sm">Badge Unlocked! 🎉</p>
        <p className="text-xs text-yellow-300 capitalize">
          {badgeId.replace(/_/g, " ")}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="ml-4 text-gray-500 hover:text-gray-300 text-xs"
      >
        ✕
      </button>
    </div>
  );
}
