import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAnalytics } from "@/hooks/useAnalytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { PlanGate } from "@/components/layout/PlanGate";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  BarChart2, TrendingUp, TrendingDown,
  Flame, Zap, Brain, Mic,
  AlertTriangle, CheckCircle, Target,
  Calendar, Clock, Volume2, Download, GitCompare,
} from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsPeriod } from "@/types/analytics.types";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { formatSessionScore } from "@/lib/analytics/scoreStatus";

// ─────────────────────────────────────────────────────────────────
// Analytics — progress trends, filler analysis, category scores
// ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const analytics  = useAnalytics();
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  if (analytics.isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title={PRODUCT_NAMES.analytics}
          subtitle="Track your interview performance over time"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Analytics" },
          ]}
        />
        <div className="space-y-5">
          <SkeletonCard />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (analytics.error && !analytics.data) {
    return (
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title={PRODUCT_NAMES.analytics}
          subtitle="Track your interview performance over time"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Analytics" },
          ]}
        />
        <InlineErrorRetry
          message={analytics.error}
          onRetry={() => void analytics.reload()}
        />
      </div>
    );
  }

  const hasSessions =
    (analytics.data?.total_sessions ?? 0) > 0 ||
    (analytics.data?.recent_sessions?.length ?? 0) > 0;

  if (!hasSessions) {
    return (
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title={PRODUCT_NAMES.analytics}
          subtitle="Track your interview performance over time"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Analytics" },
          ]}
        />
        <Card>
          <EmptyState
            icon={BarChart2}
            title="No sessions yet"
            description="Complete a mock interview or practice session to unlock performance trends, speech metrics, and activity insights."
            actionLabel="Start mock interview"
            onAction={() => navigate("/app/mock")}
            secondaryActionLabel="Practice Coach"
            onSecondaryAction={() => navigate("/app/live")}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={PRODUCT_NAMES.analytics}
        subtitle="Track your interview performance over time"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Analytics" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={analytics.filter.period}
              onValueChange={(v) => analytics.setPeriod(v as AnalyticsPeriod)}
            >
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void analytics.downloadCSV()}
              disabled={!analytics.data?.recent_sessions?.length}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        }
      />

      {analytics.error && analytics.data && (
        <div className="space-y-2">
          {analytics.isStale && (
            <Badge variant="amber" size="sm">Showing last known data</Badge>
          )}
          <InlineErrorRetry
            message={analytics.error}
            onRetry={() => void analytics.reload()}
          />
        </div>
      )}

      {/* ── KPI row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label={`Avg score (${analytics.filter.period})`}
          value={`${analytics.avgScore30d ?? 0}`}
          delta={analytics.scoreDelta}
          icon={<BarChart2 className="w-4 h-4 text-primary" />}
        />
        <KPICard
          label="Sessions this week"
          value={`${analytics.sessionsThisWeek ?? 0}`}
          icon={<Calendar className="w-4 h-4 text-blue-400" />}
        />
        <KPICard
          label="Avg WPM"
          value={`${analytics.avgWpm ?? 0}`}
          delta={analytics.wpmDelta}
          icon={<Mic className="w-4 h-4 text-emerald-400" />}
        />
        <KPICard
          label="Avg fillers/session"
          value={`${analytics.avgFillers ?? 0}`}
          delta={analytics.fillerDelta}
          invertDelta
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        />
      </div>

      <Tabs defaultValue="scores">
        <TabsList>
          <TabsTrigger value="scores">Score trends</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="speech">Speech metrics</TabsTrigger>
          <TabsTrigger value="heatmap">Activity</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        {/* ── Score trends ────────────────────────────── */}
        <TabsContent value="scores">
          <div className="space-y-4">
            <PlanGate requiredPlan="pro">
              <ScoreTrendChart data={analytics.scoreTrend ?? []} />
            </PlanGate>
            <DimensionRadar dimensions={analytics.dimensionAverages} />
          </div>
        </TabsContent>

        {/* ── Categories ──────────────────────────────── */}
        <TabsContent value="categories">
          <CategoryBreakdown categories={analytics.categoryScores ?? []} />
        </TabsContent>

        {/* ── Speech metrics ──────────────────────────── */}
        <TabsContent value="speech">
          <SpeechMetrics analytics={analytics} />
        </TabsContent>

        {/* ── Activity heatmap ────────────────────────── */}
        <TabsContent value="heatmap">
          <PlanGate requiredPlan="pro">
            <ActivityHeatmap data={analytics.activityByDay ?? {}} />
          </PlanGate>
        </TabsContent>

        {/* ── Session comparison ──────────────────────── */}
        <TabsContent value="compare">
          <SessionComparePanel analytics={analytics} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// KPICard
// ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, delta, icon, invertDelta,
}: {
  label:        string;
  value:        string;
  delta?:       number | null;
  icon:         React.ReactNode;
  invertDelta?: boolean;
}) {
  const isPositive = invertDelta
    ? (delta ?? 0) < 0
    : (delta ?? 0) > 0;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {icon}
        {delta !== null && delta !== undefined && delta !== 0 && (
          <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-semibold",
            isPositive ? "text-emerald-400" : "text-red-400"
          )}>
            {isPositive
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
            }
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-black text-foreground">{value}</p>
      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// ScoreTrendChart — simple CSS bar chart
// ─────────────────────────────────────────────────────────────────

function ScoreTrendChart({ data }: { data: { date: string; score: number }[] }) {
  if (!data.length) {
    return (
      <Card className="text-center py-10">
        <BarChart2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No session data yet.</p>
      </Card>
    );
  }

  const chartData = data.slice(-20).map((d) => ({
    label: format(new Date(d.date), "MMM d"),
    score: d.score,
  }));

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-foreground">Score over time</h3>
        <Badge variant="primary" size="sm">Last 30 sessions</Badge>
      </div>

      <div className="h-44 w-full" role="img" aria-label="Score trend chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// DimensionRadar — horizontal bar breakdown
// ─────────────────────────────────────────────────────────────────

function DimensionRadar({
  dimensions,
}: {
  dimensions?: Record<string, number>;
}) {
  const dims = dimensions ?? {
    content:       0,
    structure:     0,
    communication: 0,
    confidence:    0,
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-foreground mb-4">Average by dimension</h3>
      <div
        className="space-y-3"
        role="img"
        aria-label="Average scores by interview dimension"
      >
        {Object.entries(dims).map(([key, val]) => {
          const c =
            val >= 75 ? "emerald" :
            val >= 55 ? "amber"   : "red";
          return (
            <ProgressBar
              key={key}
              value={val}
              max={100}
              color={c}
              size="md"
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              showLabel
            />
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// CategoryBreakdown
// ─────────────────────────────────────────────────────────────────

function CategoryBreakdown({
  categories,
}: {
  categories: { category: string; avg_score: number; count: number }[];
}) {
  if (!categories.length) {
    return (
      <Card className="text-center py-10">
        <Target className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No category data yet.</p>
      </Card>
    );
  }

  const sorted = [...categories].sort((a, b) => b.avg_score - a.avg_score);

  return (
    <div className="space-y-3">
      {sorted.map((cat) => {
        const c =
          cat.avg_score >= 75 ? "emerald" :
          cat.avg_score >= 55 ? "amber"   : "red";
        return (
          <Card key={cat.category} padding="sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground capitalize">
                  {cat.category}
                </span>
                <Badge variant="gray" size="sm">{cat.count} sessions</Badge>
              </div>
              <span className={cn(
                "text-sm font-black",
                c === "emerald" ? "text-emerald-400" :
                c === "amber"   ? "text-amber-400"   : "text-red-400"
              )}>
                {cat.avg_score}
              </span>
            </div>
            <ProgressBar value={cat.avg_score} max={100} color={c} size="sm" />
          </Card>
        );
      })}

      {/* Weakest category highlight */}
      {sorted.length > 0 && sorted[sorted.length - 1].avg_score < 60 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">
                Focus area: {sorted[sorted.length - 1].category}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Your weakest category. Consider drilling{" "}
                {sorted[sorted.length - 1].category} questions in Prep Lab.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SpeechMetrics
// ─────────────────────────────────────────────────────────────────

function SpeechMetrics({ analytics }: { analytics: any }) {
  const fillerBreakdown = analytics.fillerBreakdown ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-2xl sm:text-3xl font-black text-foreground mb-1">
            {analytics.avgWpm ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground">Avg WPM</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Ideal: 100 – 150 WPM
          </p>
          <ProgressBar
            value={analytics.avgWpm ?? 0}
            max={200}
            color={
              (analytics.avgWpm ?? 0) >= 100 && (analytics.avgWpm ?? 0) <= 150
                ? "emerald" : "amber"
            }
            size="xs"
            className="mt-2"
          />
        </Card>

        <Card className="text-center">
          <div className="text-2xl sm:text-3xl font-black text-amber-400 mb-1">
            {analytics.avgFillers ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground">Avg fillers per session</p>
          <p className="text-[10px] text-muted-foreground mt-1">Target: under 5</p>
        </Card>

        <Card className="text-center">
          <div className="text-2xl sm:text-3xl font-black text-primary mb-1">
            {analytics.avgConfidence ?? "—"}%
          </div>
          <p className="text-xs text-muted-foreground">Avg confidence score</p>
          <ProgressBar
            value={analytics.avgConfidence ?? 0}
            max={100}
            color={analytics.avgConfidence >= 65 ? "emerald" : "amber"}
            size="xs"
            className="mt-2"
          />
        </Card>
      </div>

      {/* Filler word breakdown */}
      {Object.keys(fillerBreakdown).length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-amber-400" />
            Filler word breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(fillerBreakdown)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([word, count]) => (
                <div key={word} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-amber-400 w-16 shrink-0">
                    "{word}"
                  </span>
                  <ProgressBar
                    value={count as number}
                    max={Math.max(...Object.values(fillerBreakdown) as number[])}
                    color="amber"
                    size="sm"
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {count as number}×
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ActivityHeatmap — GitHub-style grid
// ─────────────────────────────────────────────────────────────────

function ActivityHeatmap({ data }: { data: Record<string, number> }) {
  // Build last 12 weeks
  const weeks: string[][] = [];
  let week: string[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week);

  const maxVal = Math.max(...Object.values(data), 1);

  return (
    <Card>
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Flame className="w-4 h-4 text-amber-400" />
        Practice activity — last 12 weeks
      </h3>
      <div
        className="flex gap-1 overflow-x-auto pb-2"
        role="img"
        aria-label="Practice activity heatmap for the last 12 weeks"
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => {
              const val   = data[day] ?? 0;
              const alpha = val === 0 ? 0 : Math.max(0.15, val / maxVal);
              return (
                <div
                  key={day}
                  title={`${day}: ${val} session${val !== 1 ? "s" : ""}`}
                  className="w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: val === 0
                      ? "rgba(255,255,255,0.04)"
                      : `rgba(139,92,246,${alpha})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0.1, 0.3, 0.5, 0.75, 1].map((a) => (
          <div
            key={a}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: `rgba(139,92,246,${a})` }}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// SessionComparePanel — side-by-side session comparison
// ─────────────────────────────────────────────────────────────────

function SessionComparePanel({ analytics }: { analytics: ReturnType<typeof useAnalytics> }) {
  const sessions = analytics.data?.recent_sessions ?? [];
  const [sessionA, setSessionA] = useState("");
  const [sessionB, setSessionB] = useState("");
  const comparison = analytics.comparison;

  useEffect(() => {
    if (sessions.length >= 2 && !sessionA && !sessionB) {
      setSessionA(sessions[sessions.length - 2].session_id);
      setSessionB(sessions[sessions.length - 1].session_id);
    }
  }, [sessions, sessionA, sessionB]);

  if (sessions.length < 2) {
    return (
      <Card className="text-center py-10">
        <GitCompare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Complete at least two sessions to compare.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Compare sessions</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <SessionPicker
            label="Session A (baseline)"
            value={sessionA}
            sessions={sessions}
            onChange={setSessionA}
          />
          <SessionPicker
            label="Session B (compare)"
            value={sessionB}
            sessions={sessions}
            onChange={setSessionB}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!sessionA || !sessionB || sessionA === sessionB}
          onClick={() => void analytics.compareSessions(sessionA, sessionB)}
        >
          Compare
        </Button>
      </Card>

      {comparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompareSessionCard session={comparison.session_a} label="Session A" />
          <CompareSessionCard session={comparison.session_b} label="Session B" />
        </div>
      )}

      {comparison && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Delta summary</h3>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <DeltaStat label="Score" value={comparison.score_delta} invert={false} />
            <DeltaStat label="Fillers/min" value={comparison.filler_delta} invert />
            <DeltaStat label="WPM" value={comparison.wpm_delta} invert={false} />
          </div>
          {comparison.improvement_areas.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-emerald-400 mb-1">Improvements in B</p>
              <ul className="text-xs text-foreground space-y-1">
                {comparison.improvement_areas.map((a) => (
                  <li key={a}>↑ {a}</li>
                ))}
              </ul>
            </div>
          )}
          {comparison.regression_areas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">Regressions in B</p>
              <ul className="text-xs text-foreground space-y-1">
                {comparison.regression_areas.map((a) => (
                  <li key={a}>↓ {a}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function SessionPicker({
  label, value, sessions, onChange,
}: {
  label: string;
  value: string;
  sessions: {
    session_id: string;
    date: string;
    company?: string | null;
    overall_score: number | null;
    score_status?: string;
  }[];
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs"
      >
        <option value="">Select session…</option>
        {sessions.map((s) => (
          <option key={s.session_id} value={s.session_id}>
            {format(new Date(s.date), "MMM d")} · {formatSessionScore(s.overall_score, s.score_status)} · {s.company ?? s.session_id.slice(0, 8)}
          </option>
        ))}
      </select>
    </div>
  );
}

function CompareSessionCard({
  session, label,
}: {
  session: {
    date: string;
    mode: string;
    interview_type: string;
    company: string | null;
    overall_score: number | null;
    score_status?: string;
    filler_rate: number | null;
    wpm_avg: number | null;
    duration_minutes: number;
    question_count: number;
  };
  label: string;
}) {
  return (
    <Card>
      <Badge variant="gray" size="sm" className="mb-3">{label}</Badge>
      <p className="text-xs text-muted-foreground mb-2">
        {format(new Date(session.date), "MMM d, yyyy")} · {session.mode} · {session.interview_type}
      </p>
      {session.company && (
        <p className="text-sm font-medium text-foreground mb-3">{session.company}</p>
      )}
      <div className="text-3xl font-black text-primary mb-3">
        {formatSessionScore(session.overall_score, session.score_status)}
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">WPM</span><span>{session.wpm_avg ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fillers/min</span><span>{typeof session.filler_rate === "number" ? session.filler_rate.toFixed(1) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{session.duration_minutes}m</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Questions</span><span>{session.question_count}</span></div>
      </div>
    </Card>
  );
}

function DeltaStat({
  label, value, invert,
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  const positive = invert ? value < 0 : value > 0;
  const formatted = label.includes("Fillers") ? value.toFixed(1) : value;
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn(
        "text-lg font-black tabular-nums",
        value === 0 ? "text-muted-foreground" :
        positive ? "text-emerald-400" : "text-red-400",
      )}>
        {value > 0 ? "+" : ""}{formatted}
      </p>
    </div>
  );
}
