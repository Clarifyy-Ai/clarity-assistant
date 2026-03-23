// @ts-nocheck
import { useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  BarChart3, TrendingUp, TrendingDown, Minus,
  Clock, Target, Mic, Download, RefreshCw,
  Flame, Trophy, Filter, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod } from "@/types/analytics.types";

// ─────────────────────────────────────────────────────────────────
// Analytics
// Full analytics dashboard: score trend, filler trend, WPM,
// session history table, leaderboard, comparison tool.
// ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const {
    data, isLoading, summary, filter,
    setPeriod, setSessionFilter, downloadCSV, reload,
  } = useAnalytics();

  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Track your interview performance over time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground text-sm rounded-xl transition-all"
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showFilters && "rotate-180")} />
            </button>
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground text-sm rounded-xl transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={reload}
              className="p-2 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground rounded-xl transition-all"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────── */}
        {showFilters && (
          <div className="bg-secondary border border-border rounded-2xl p-4 flex flex-wrap gap-4">
            {/* Period */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Period</label>
              <div className="flex gap-1">
                {(["7d", "30d", "90d", "all"] as AnalyticsPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                      filter.period === p
                        ? "bg-violet-600 text-white"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p === "all" ? "All Time" : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Mode</label>
              <div className="flex gap-1">
                {(["all", "mock", "live"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSessionFilter(m)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all",
                      filter.session_filter === m
                        ? "bg-violet-600 text-white"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Summary cards ──────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Sessions"
            value={summary?.totalSessions ?? 0}
            icon={Target}
            loading={isLoading}
          />
          <SummaryCard
            label="Practice Hours"
            value={summary ? `${summary.practiceHours.toFixed(1)}h` : "—"}
            icon={Clock}
            loading={isLoading}
          />
          <SummaryCard
            label="Avg Score"
            value={summary?.avgScore ?? "—"}
            icon={TrendingUp}
            delta={summary?.scoreDelta}
            loading={isLoading}
          />
          <SummaryCard
            label="Current Streak"
            value={summary?.currentStreak ?? 0}
            icon={Flame}
            sub="days"
            loading={isLoading}
          />
        </div>

        {/* ── Chart placeholders (recharts / chart components hook here) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Score Trend" icon={TrendingUp}>
            {isLoading ? (
              <ChartSkeleton />
            ) : data?.score_trend.length ? (
              <ScoreChart dataPoints={data.score_trend} />
            ) : (
              <EmptyChart message="Complete more sessions to see trends" />
            )}
          </ChartCard>

          <ChartCard title="WPM Over Time" icon={Mic}>
            {isLoading ? (
              <ChartSkeleton />
            ) : data?.wpm_trend.length ? (
              <WPMChart dataPoints={data.wpm_trend} />
            ) : (
              <EmptyChart message="No WPM data yet" />
            )}
          </ChartCard>

          <ChartCard title="Filler Word Rate" icon={BarChart3}>
            {isLoading ? (
              <ChartSkeleton />
            ) : data?.filler_trend.length ? (
              <FillerChart dataPoints={data.filler_trend} />
            ) : (
              <EmptyChart message="No filler data yet" />
            )}
          </ChartCard>

          <ChartCard title="Interview Type Breakdown" icon={Target}>
            {isLoading ? (
              <ChartSkeleton />
            ) : data?.type_breakdown.length ? (
              <TypeBreakdownChart data={data.type_breakdown} />
            ) : (
              <EmptyChart message="Complete different interview types" />
            )}
          </ChartCard>
        </div>

        {/* ── Recent sessions table ───────────────────── */}
        {data?.recent_sessions && data.recent_sessions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Sessions</h2>
            <div className="bg-secondary border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-left px-4 py-3">Company</th>
                      <th className="text-right px-4 py-3">Score</th>
                      <th className="text-right px-4 py-3">WPM</th>
                      <th className="text-right px-4 py-3">Fillers/min</th>
                      <th className="text-right px-4 py-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_sessions.map((s) => (
                      <tr
                        key={s.session_id}
                        className="border-b border-border hover:bg-secondary transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(s.date).toLocaleDateString("en-GB", {
                            day: "2-digit", month: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-violet-600/20 text-violet-300 rounded text-xs capitalize">
                            {s.interview_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.company ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "font-semibold",
                            s.overall_score >= 70 ? "text-green-400" :
                            s.overall_score >= 50 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {s.overall_score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{s.wpm_avg}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {s.filler_rate.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {s.duration_minutes}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Leaderboard ────────────────────────────── */}
        {data?.leaderboard && data.leaderboard.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Community Leaderboard
            </h2>
            <div className="bg-secondary border border-border rounded-2xl overflow-hidden">
              {data.leaderboard.map((entry: any, i: number) => (
                <div
                  key={entry.user_id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3 border-b border-border",
                    entry.is_you && "bg-violet-600/10"
                  )}
                >
                  <span className={cn(
                    "w-6 text-center font-bold text-sm",
                    i === 0 ? "text-yellow-400" :
                    i === 1 ? "text-muted-foreground" :
                    i === 2 ? "text-amber-600" : "text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">
                      {entry.display_name}
                    </span>
                    {entry.is_you && (
                      <span className="ml-2 text-xs text-violet-400">(you)</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-foreground">
                    {entry.avg_score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Chart placeholder components
// (Real charts use Recharts / Plotly — wired in separately)
// ─────────────────────────────────────────────────────────────────

function ChartCard({ title, icon: Icon, children }: {
  title: string; icon: any; children: React.ReactNode;
}) {
  return (
    <div className="bg-secondary border border-border rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4 text-violet-400" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function ScoreChart({ dataPoints }: { dataPoints: any[] }) {
  const max = Math.max(...dataPoints.map((d) => d.score), 100);
  return (
    <div className="flex items-end gap-1 h-32">
      {dataPoints.slice(-20).map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={cn(
              "w-full rounded-sm min-h-[2px] transition-all",
              d.score >= 70 ? "bg-green-500" : d.score >= 50 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ height: `${(d.score / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function WPMChart({ dataPoints }: { dataPoints: any[] }) {
  return (
    <div className="flex items-end gap-1 h-32">
      {dataPoints.slice(-20).map((d, i) => {
        const ideal = d.wpm >= 110 && d.wpm <= 160;
        const height = Math.min(100, (d.wpm / 200) * 100);
        return (
          <div key={i} className="flex-1">
            <div
              className={cn("w-full rounded-sm min-h-[2px]", ideal ? "bg-emerald-500" : "bg-orange-400")}
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function FillerChart({ dataPoints }: { dataPoints: any[] }) {
  const max = Math.max(...dataPoints.map((d) => d.rate), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {dataPoints.slice(-20).map((d, i) => (
        <div key={i} className="flex-1">
          <div
            className={cn("w-full rounded-sm min-h-[2px]",
              d.rate < 2 ? "bg-green-500" : d.rate < 5 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ height: `${(d.rate / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function TypeBreakdownChart({ data }: { data: any[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.type} className="flex items-center gap-2 text-sm">
          <span className="w-28 text-muted-foreground truncate capitalize text-xs">{d.type}</span>
          <div className="flex-1 h-2 bg-secondary/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full"
              style={{ width: `${(d.count / total) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-6 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-32 flex items-end gap-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-secondary/80 rounded-sm animate-pulse"
          style={{ height: `${30 + Math.random() * 70}%` }}
        />
      ))}
    </div>
  );
}

function SummaryCard({
  label, value, icon: Icon, loading, delta, sub,
}: {
  label: string; value: string | number; icon: any;
  loading: boolean; delta?: number; sub?: string;
}) {
  return (
    <div className="bg-secondary border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-16 bg-secondary/80 rounded animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold text-foreground">{value}</span>
          {sub && <span className="text-xs text-muted-foreground mb-1">{sub}</span>}
          {delta !== undefined && delta !== 0 && (
            <span className={cn(
              "text-xs font-medium mb-1 flex items-center gap-0.5",
              delta > 0 ? "text-green-400" : "text-red-400"
            )}>
              {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(delta)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
