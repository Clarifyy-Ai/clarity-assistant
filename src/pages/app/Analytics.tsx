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
  Flame, Mic,
  AlertTriangle, Target,
  Calendar, Volume2, Download, GitCompare,
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
import { formatAggregateScore, formatSessionScore } from "@/lib/analytics/scoreStatus";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import {
  canEnableCompare,
  formatSessionDateTime,
  resolveDisplayTimeZone,
  sessionPickerLabel,
} from "@/lib/analytics/sessionComparison";

// ─────────────────────────────────────────────────────────────────
// Analytics — progress trends, filler analysis, category scores
// ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const analytics  = useAnalytics();
  const navigate = useNavigate();

  if (analytics.isLoading) {
    return (
      <div data-testid="page-width-root" className={`${PAGE_SHELL} space-y-4`}>
        <PageHeader
          title={PRODUCT_NAMES.analytics}
          subtitle="Track your interview performance over time"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Analytics" },
          ]}
        />
        <div className="space-y-4">
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
      <div data-testid="page-width-root" className={`${PAGE_SHELL} space-y-4`}>
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
      <div data-testid="page-width-root" className={`${PAGE_SHELL} space-y-4`}>
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
            title="No completed sessions yet."
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
    <div data-testid="page-width-root" className={`${PAGE_SHELL} space-y-4`}>
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
      <div data-testid="analytics-kpi-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label={`Avg score (${analytics.filter.period})`}
          value={formatAggregateScore(analytics.avgScore30d)}
          delta={analytics.scoreDelta}
          icon={<BarChart2 className="w-4 h-4 text-primary" />}
        />
        <KPICard
          label={`Sessions (${analytics.filter.period})`}
          value={`${analytics.sessionsInSelectedPeriod ?? 0}`}
          icon={<Calendar className="w-4 h-4 text-blue-400" />}
        />
        <KPICard
          label="Avg WPM"
          value={formatAggregateScore(analytics.avgWpm)}
          delta={analytics.wpmDelta}
          icon={<Mic className="w-4 h-4 text-emerald-400" />}
        />
        <KPICard
          label="Avg fillers/session"
          value={typeof analytics.avgFillers === "number" ? String(analytics.avgFillers) : "—"}
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
            <PlanGate requiredPlan="pro" featureFlag="analytics">
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
          <PlanGate requiredPlan="pro" featureFlag="analytics">
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

function isFiniteScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreTrendSummary(
  points: { score: number | null | undefined }[],
): string {
  const scored = points.filter((p) => isFiniteScore(p.score));
  if (scored.length === 0) return "Not scored";

  const first = scored[0].score;
  const last = scored[scored.length - 1].score;
  const min = Math.min(...scored.map((p) => p.score));
  const max = Math.max(...scored.map((p) => p.score));
  const n = scored.length;
  const direction = last > first ? "rose" : last < first ? "fell" : "held";
  const fromTo =
    direction === "held"
      ? `held at ${formatSessionScore(first)}`
      : `${direction} from ${formatSessionScore(first)} to ${formatSessionScore(last)}`;

  return `Score ${fromTo} over ${n} session${n === 1 ? "" : "s"}. Lowest ${formatSessionScore(min)}, highest ${formatSessionScore(max)}.`;
}

function dimensionRadarSummary(
  dimensions?: Record<string, number | null | undefined>,
): string {
  const scored = Object.entries(dimensions ?? {}).filter(([, v]) =>
    isFiniteScore(v),
  ) as [string, number][];

  if (scored.length === 0) return "Not scored";

  const formatDim = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
  const list = scored
    .map(([key, val]) => `${formatDim(key)} ${formatAggregateScore(val)}`)
    .join(", ");
  const weakest = scored.reduce((min, cur) => (cur[1] < min[1] ? cur : min));

  return `${list}. Weakest: ${formatDim(weakest[0])}.`;
}

function ScoreTrendChart({ data }: { data: { date: string; score: number | null | undefined }[] }) {
  if (!data.length) {
    return (
      <Card className="text-center py-6">
        <BarChart2 className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No session data yet.</p>
      </Card>
    );
  }

  const visible = data.slice(-20);
  const chartData = visible.map((d) => ({
    label: format(new Date(d.date), "MMM d"),
    score: d.score,
  }));
  const summary = scoreTrendSummary(visible);

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-foreground">Score over time</h3>
        <Badge variant="primary" size="sm">Last 30 sessions</Badge>
      </div>

      <p className="sr-only">{summary}</p>
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
  dimensions?: Record<string, number | null | undefined>;
}) {
  const dims = dimensions ?? {
    content:       0,
    structure:     0,
    communication: 0,
    confidence:    0,
  };
  const summary = dimensionRadarSummary(dimensions);
  const scoredEntries = Object.entries(dims).filter(([, val]) => isFiniteScore(val)) as [
    string,
    number,
  ][];

  return (
    <div data-testid="analytics-dimension-card">
    <Card>
      <h3 className="text-sm font-semibold text-foreground mb-3">Average by dimension</h3>
      <p className="sr-only">{summary}</p>
      {scoredEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No dimension scores yet.</p>
      ) : (
      <div
        className="space-y-3"
        role="img"
        aria-label="Average scores by interview dimension"
      >
        {scoredEntries.map(([key, val]) => {
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
      )}
    </Card>
    </div>
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
  const navigate = useNavigate();
  if (!categories.length) {
    return (
      <Card className="text-center py-6">
        <Target className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No category data yet.</p>
      </Card>
    );
  }

  const sorted = [...categories].sort((a, b) => b.avg_score - a.avg_score);
  const weakest = sorted[sorted.length - 1];

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

      {/* Weakest category highlight — navigable to Prep Lab (TC-AN-003) */}
      {weakest && weakest.avg_score < 60 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-300">
                Focus area: {weakest.category}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Your weakest category. Drill {weakest.category} questions in Prep Lab.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  navigate(`/app/prep?focus=${encodeURIComponent(weakest.category)}`);
                }}
              >
                Practice in Prep Lab
              </Button>
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

function SpeechMetrics({ analytics }: { analytics: ReturnType<typeof useAnalytics> }) {
  const fillerBreakdown = analytics.fillerBreakdown ?? {};
  const avgWpm = analytics.avgWpm;
  const avgFillers = analytics.avgFillers;
  const avgConfidence = analytics.avgConfidence;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-2xl sm:text-3xl font-black text-foreground mb-1">
            {typeof avgWpm === "number" ? avgWpm : "—"}
          </div>
          <p className="text-xs text-muted-foreground">Avg WPM</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Ideal: 100 – 150 WPM
          </p>
          {typeof avgWpm === "number" && (
            <ProgressBar
              value={avgWpm}
              max={200}
              color={avgWpm >= 100 && avgWpm <= 150 ? "emerald" : "amber"}
              size="xs"
              className="mt-2"
            />
          )}
        </Card>

        <Card className="text-center">
          <div className="text-2xl sm:text-3xl font-black text-amber-400 mb-1">
            {typeof avgFillers === "number" ? avgFillers : "—"}
          </div>
          <p className="text-xs text-muted-foreground">Avg fillers per session</p>
          <p className="text-[10px] text-muted-foreground mt-1">Target: under 5</p>
        </Card>

        <Card className="text-center">
          <div className="text-2xl sm:text-3xl font-black text-primary mb-1">
            {typeof avgConfidence === "number" ? `${avgConfidence}%` : "—"}
          </div>
          <p className="text-xs text-muted-foreground">Avg confidence score</p>
          {typeof avgConfidence === "number" && (
            <ProgressBar
              value={avgConfidence}
              max={100}
              color={avgConfidence >= 65 ? "emerald" : "amber"}
              size="xs"
              className="mt-2"
            />
          )}
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
  const { profile } = useAuthStore();
  const timeZone = resolveDisplayTimeZone(profile?.timezone);
  const [sessionA, setSessionA] = useState("");
  const [sessionB, setSessionB] = useState("");
  const comparison = analytics.comparison;
  const comparable = sessions.filter((s) => s.comparable === true);

  useEffect(() => {
    if (comparable.length >= 2 && !sessionA && !sessionB) {
      setSessionA(comparable[comparable.length - 2].session_id);
      setSessionB(comparable[comparable.length - 1].session_id);
    }
  }, [comparable, sessionA, sessionB]);

  if (comparable.length < 2) {
    return (
      <Card className="text-center py-6">
        <GitCompare className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">
          Complete another interview to compare sessions.
        </p>
      </Card>
    );
  }

  const selectedA = sessions.find((s) => s.session_id === sessionA);
  const selectedB = sessions.find((s) => s.session_id === sessionB);
  const compareState = canEnableCompare({
    sessionAId: sessionA,
    sessionBId: sessionB,
    sessionAComparable: selectedA?.comparable === true,
    sessionBComparable: selectedB?.comparable === true,
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Compare sessions</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Baseline is the earlier session. Comparison is the later session.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <SessionPicker
            label="Baseline"
            value={sessionA}
            sessions={comparable}
            timeZone={timeZone}
            onChange={setSessionA}
          />
          <SessionPicker
            label="Comparison"
            value={sessionB}
            sessions={comparable}
            timeZone={timeZone}
            onChange={setSessionB}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!compareState.enabled || analytics.isComparing}
          onClick={() => void analytics.compareSessions(sessionA, sessionB)}
        >
          {analytics.isComparing ? "Comparing…" : "Compare"}
        </Button>
        {!compareState.enabled && compareState.reason && (
          <p className="text-xs text-muted-foreground mt-2">{compareState.reason}</p>
        )}
        {comparable.length < 2 && (
          <p className="text-xs text-muted-foreground mt-2">
            Compare needs two completed sessions that already have a scorecard.
            Unfinished or unscored sessions stay in the list but cannot be compared.
          </p>
        )}
      </Card>

      {analytics.isComparing && !comparison && (
        <Card className="text-center py-8">
          <p className="text-sm text-muted-foreground">Comparing sessions…</p>
        </Card>
      )}

      {analytics.compareError && (
        <InlineErrorRetry
          message={analytics.compareError}
          onRetry={() => void analytics.compareSessions(sessionA, sessionB)}
        />
      )}

      {comparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompareSessionCard
            session={comparison.baseline ?? comparison.session_a}
            label="Baseline"
            timeZone={comparison.timezone || timeZone}
          />
          <CompareSessionCard
            session={comparison.comparison ?? comparison.session_b}
            label="Comparison"
            timeZone={comparison.timezone || timeZone}
          />
        </div>
      )}

      {comparison && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Delta summary</h3>
          <p className="text-[10px] text-muted-foreground mb-3">
            Change = comparison − baseline. Unavailable metrics stay blank.
          </p>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <DeltaStat label="Score" value={comparison.score_delta} invert={false} />
            <DeltaStat label="Fillers/min" value={comparison.filler_delta} invert />
            <DeltaStat label="WPM" value={comparison.wpm_delta} invert={false} />
          </div>
          {comparison.deltas && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
              <DeltaStat label="Communication" value={comparison.deltas.communication} />
              <DeltaStat label="Technical" value={comparison.deltas.technical} />
              <DeltaStat label="Problem solving" value={comparison.deltas.problem_solving} />
              <DeltaStat label="Confidence" value={comparison.deltas.confidence} />
            </div>
          )}
          {comparison.improvement_areas.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-emerald-400 mb-1">Improvements</p>
              <ul className="text-xs text-foreground space-y-1">
                {comparison.improvement_areas.map((a) => (
                  <li key={a}>↑ {a}</li>
                ))}
              </ul>
            </div>
          )}
          {comparison.regression_areas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">Regressions</p>
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
  label, value, sessions, timeZone, onChange,
}: {
  label: string;
  value: string;
  timeZone: string;
  sessions: {
    session_id: string;
    date: string;
    started_at?: string | null;
    mode?: string | null;
    company?: string | null;
    overall_score: number | null;
    score_status?: string;
    completion_state?: string | null;
    comparable?: boolean;
    title?: string | null;
  }[];
  onChange: (id: string) => void;
}) {
  // Only list sessions eligible for comparison — disabled native options look
  // like a broken (unopenable) dropdown on many platforms.
  const eligible = sessions.filter((s) => s.comparable === true);

  if (eligible.length === 0) {
    return (
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">
          {label}
        </label>
        <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-2 py-2">
          No comparable sessions yet (need completed + scored).
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">
        {label}
      </label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          className="w-full h-9 text-xs"
          aria-label={label}
          data-testid={`compare-${label.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <SelectValue placeholder="Select session…" />
        </SelectTrigger>
        <SelectContent className="z-[80]">
          {eligible.map((s) => (
            <SelectItem key={s.session_id} value={s.session_id} className="text-xs">
              {sessionPickerLabel({
                dateIso: s.started_at ?? s.date,
                timeZone,
                sessionType: s.mode,
                company: s.company ?? s.title,
                score: s.overall_score,
                scoreStatus: s.score_status,
                completionState: s.completion_state,
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompareSessionCard({
  session, label, timeZone,
}: {
  session: {
    date: string;
    started_at?: string | null;
    mode: string;
    interview_type?: string | null;
    company: string | null;
    title?: string | null;
    overall_score: number | null;
    score_status?: string;
    filler_rate: number | null;
    wpm_avg: number | null;
    duration_minutes: number | null;
    question_count: number | null;
    answered_count?: number | null;
  };
  label: string;
  timeZone: string;
}) {
  return (
    <Card>
      <Badge variant="gray" size="sm" className="mb-3">{label}</Badge>
      <p className="text-xs text-muted-foreground mb-2">
        {formatSessionDateTime(session.started_at ?? session.date, timeZone)}
        {session.mode ? ` · ${session.mode}` : ""}
      </p>
      {(session.company || session.title) && (
        <p className="text-sm font-medium text-foreground mb-3">
          {session.company ?? session.title}
        </p>
      )}
      <div className="text-3xl font-black text-primary mb-3">
        {formatSessionScore(session.overall_score, session.score_status)}
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">WPM</span><span>{typeof session.wpm_avg === "number" ? session.wpm_avg : "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fillers/min</span><span>{typeof session.filler_rate === "number" ? session.filler_rate.toFixed(1) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{typeof session.duration_minutes === "number" ? `${session.duration_minutes}m` : "—"}</span></div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Questions</span>
          <span>
            {typeof session.question_count === "number"
              ? typeof session.answered_count === "number"
                ? `${session.answered_count} / ${session.question_count}`
                : session.question_count
              : "—"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function DeltaStat({
  label, value, invert,
}: {
  label: string;
  value: number | null | undefined;
  invert?: boolean;
}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return (
      <div className="rounded-lg bg-secondary p-3">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-lg font-black tabular-nums text-muted-foreground">—</p>
      </div>
    );
  }
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
