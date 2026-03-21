// @ts-nocheck
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/userStore";
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
  Calendar, Clock, Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// Analytics — progress trends, filler analysis, category scores
// ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const analytics  = useAnalytics();
  const { profile } = useAuthStore();

  if (analytics.isLoading) {
    return (
      <div className="space-y-5">
        <SkeletonCard />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Analytics"
        subtitle="Track your interview performance over time"
      />

      {/* ── KPI row ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard
          label="Avg score (30d)"
          value={`${analytics.avgScore30d ?? 0}`}
          delta={analytics.scoreDelta}
          icon={<BarChart2 className="w-4 h-4 text-violet-400" />}
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
          <TabsTrigger value="scores">📈 Score trends</TabsTrigger>
          <TabsTrigger value="categories">🗂️ Categories</TabsTrigger>
          <TabsTrigger value="speech">🎙️ Speech metrics</TabsTrigger>
          <TabsTrigger value="heatmap">🔥 Activity</TabsTrigger>
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
        <BarChart2 className="w-8 h-8 text-gray-700 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No session data yet.</p>
      </Card>
    );
  }

  const max = Math.max(...data.map((d) => d.score), 100);

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-foreground">Score over time</h3>
        <Badge variant="violet" size="sm">Last 30 sessions</Badge>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-36">
        {data.slice(-20).map((d, i) => {
          const pct = (d.score / max) * 100;
          const c   =
            d.score >= 75 ? "bg-emerald-500" :
            d.score >= 55 ? "bg-amber-500"   : "bg-red-500";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className={cn("w-full rounded-sm transition-all", c)}
                style={{ height: `${pct}%` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] border border-white/15 rounded-lg px-2 py-1 text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {d.score} · {format(new Date(d.date), "MMM d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
        <span>{data.length >= 20 ? format(new Date(data[data.length - 20]?.date ?? new Date()), "MMM d") : "Start"}</span>
        <span>Today</span>
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
      <div className="space-y-3">
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
        <Target className="w-8 h-8 text-gray-700 mx-auto mb-2" />
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
          <div className="text-2xl sm:text-3xl font-black text-violet-400 mb-1">
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
      <div className="flex gap-1 overflow-x-auto pb-2">
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
