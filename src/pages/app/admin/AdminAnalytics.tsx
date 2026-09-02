import { useEffect, useState } from "react";
import { adminAnalyticsDB } from "@/lib/supabase/database";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import {
  BarChart2, Activity, Cpu, FileText, MessageSquare, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { formatUsdAmountAsInr } from "@/lib/utils/formatters";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Period = 1 | 7 | 30 | 90;

export function adminAnalyticsPeriodLabel(period: Period): string {
  return period === 1 ? "DAY" : `${period}d`;
}

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<Period>(7);

  return (
    <div data-testid="dd-layout-root" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" /> Platform Analytics
        </h1>
        <div className="flex gap-1 p-1 bg-secondary rounded-xl border border-border">
          {([1, 7, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                period === p ? "bg-primary/20 text-primary/80" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {adminAnalyticsPeriodLabel(p)}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><Activity className="w-3.5 h-3.5 mr-1.5" /> Overview</TabsTrigger>
          <TabsTrigger value="perf"><Cpu className="w-3.5 h-3.5 mr-1.5" /> Response times</TabsTrigger>
          <TabsTrigger value="ai"><Cpu className="w-3.5 h-3.5 mr-1.5" /> AI usage</TabsTrigger>
          <TabsTrigger value="mock"><FileText className="w-3.5 h-3.5 mr-1.5" /> Mock tests</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Support</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab period={period} /></TabsContent>
        <TabsContent value="perf" className="mt-4"><PerfTab period={period} /></TabsContent>
        <TabsContent value="ai" className="mt-4"><AITab period={period} /></TabsContent>
        <TabsContent value="mock" className="mt-4"><MockTab period={period} /></TabsContent>
        <TabsContent value="chat" className="mt-4"><ChatTab period={period} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────── OVERVIEW ───────────────────────
function OverviewTab({ period }: { period: Period }) {
  const [stats, setStats] = useState<{ dau: number; sessions: number; signups: number; activeUsers: number } | null>(null);
  const [signupSeries, setSignupSeries] = useState<{ day: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const since = new Date(Date.now() - period * 86400_000).toISOString();
        const seriesDays = Math.min(period, 30);

        const [sessions, signups, dauSeries, signupData] = await Promise.all([
          adminAnalyticsDB.countSessionsSince(since),
          adminAnalyticsDB.countSignupsSince(since),
          adminAnalyticsDB.getDauMauSeries(period),
          adminAnalyticsDB.countCreatedAtByDay("profiles", seriesDays),
        ]);
        if (cancelled) return;

        const latestDau = dauSeries.length > 0 ? Number(dauSeries[dauSeries.length - 1]?.dau ?? 0) : 0;
        const peakDau = dauSeries.reduce((max, r) => Math.max(max, Number(r.dau ?? 0)), 0);

        setSignupSeries(signupData);
        setStats({
          dau: latestDau,
          sessions,
          signups,
          activeUsers: peakDau,
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(toAdminUserMessage(err, undefined, "AdminAnalytics.overview"));
        setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, reloadTick]);

  if (loading) return <SkeletonGrid />;

  if (loadError && !stats) {
    return (
      <div className="space-y-4">
        <InlineErrorRetry message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
        <EmptyState
          icon={BarChart2}
          title="Overview stats unavailable"
          description="Retry to load platform overview metrics for this period."
          compact
          actionLabel="Retry"
          onAction={() => setReloadTick((n) => n + 1)}
        />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Daily active users" value={stats.dau.toLocaleString()} />
        <Stat label="Active users" value={stats.activeUsers.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="Sessions" value={stats.sessions.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="New signups" value={stats.signups.toLocaleString()} sub={`last ${period}d`} />
      </div>

      <Card><CardContent className="p-5">
        <h3 className="text-sm font-semibold mb-3">Daily signups</h3>
        {signupSeries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signups in this period.</p>
        ) : (
        <div className="h-40 min-h-[160px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
            <BarChart data={signupSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => {
                  const parsed = new Date(`${String(d)}T00:00:00`);
                  return Number.isNaN(parsed.getTime())
                    ? String(d)
                    : format(parsed, "MMM d");
                }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                labelFormatter={(d) => String(d)}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Signups" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </CardContent></Card>
    </div>
  );
}

// ─────────────────────── PERF ───────────────────────
type PerfRow = Awaited<ReturnType<typeof adminAnalyticsDB.getPerfStats>>[number];

function PerfTab({ period }: { period: Period }) {
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const next = await adminAnalyticsDB.getPerfStats(period);
        if (cancelled) return;
        setRows(next);
      } catch (err) {
        if (cancelled) return;
        setLoadError(toAdminUserMessage(err, undefined, "AdminAnalytics.perf"));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, reloadTick]);

  if (loading) return <SkeletonGrid />;

  const totalCalls = rows.reduce((s, r) => s + Number(r.call_count), 0);
  const totalErrors = rows.reduce((s, r) => s + Number(r.error_count), 0);
  const errorRate = totalCalls ? ((totalErrors / totalCalls) * 100).toFixed(2) : "0";
  const avgP95 = rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.p95_ms || 0), 0) / rows.length) : 0;

  return (
    <div className="space-y-4">
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total calls" value={totalCalls.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="Avg p95 latency" value={`${avgP95} ms`} />
        <Stat label="Errors" value={totalErrors.toLocaleString()} />
        <Stat label="Error rate" value={`${errorRate}%`} />
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edge function performance</h3>
          <Button size="xs" variant="secondary" onClick={() => setReloadTick((n) => n + 1)} leftIcon={<RefreshCw className="w-3 h-3" />}>Refresh</Button>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="No request metrics yet"
            description="Edge-function performance data will appear here once calls are logged."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {["Function", "Calls", "Avg ms", "p50", "p95", "p99", "Errors", "Err %"].map((h) => (
                    <th key={h} className="text-left text-[10px] uppercase tracking-widest text-muted-foreground px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r, i) => (
                  <tr key={`${r.function_name}-${i}`} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{r.function_name}</td>
                    <td className="px-3 py-2 font-bold">{Number(r.call_count).toLocaleString()}</td>
                    <td className="px-3 py-2">{Number(r.avg_ms).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(r.p50_ms).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(r.p95_ms).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(r.p99_ms).toFixed(0)}</td>
                    <td className="px-3 py-2 text-red-400">{r.error_count}</td>
                    <td className="px-3 py-2">
                      <Badge size="sm" variant={Number(r.error_rate) > 5 ? "red" : "default"}>
                        {Number(r.error_rate).toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────── AI USAGE ───────────────────────
type AIModelRow = {
  model: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  credits: number;
};

function AITab({ period }: { period: Period }) {
  const [rows, setRows] = useState<AIModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const since = new Date(Date.now() - period * 86400_000).toISOString();
        const data = await adminAnalyticsDB.getModelCostLogsSince(since);
        const map: Record<string, AIModelRow> = {};
        data.forEach((r) => {
          const model = r.model ?? "unknown";
          if (!map[model]) {
            map[model] = { model, calls: 0, tokens_in: 0, tokens_out: 0, cost: 0, credits: 0 };
          }
          map[model].calls++;
          map[model].tokens_in += Number(r.tokens_in ?? 0);
          map[model].tokens_out += Number(r.tokens_out ?? 0);
          map[model].cost += Number(r.cost_usd ?? 0);
          map[model].credits += Number(r.credits_charged ?? 0);
        });
        if (cancelled) return;
        setRows(Object.values(map).sort((a, b) => b.cost - a.cost));
      } catch (err) {
        if (cancelled) return;
        setLoadError(toAdminUserMessage(err, undefined, "AdminAnalytics.ai"));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, reloadTick]);

  if (loading) return <SkeletonGrid />;

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalCredits = rows.reduce((s, r) => s + r.credits, 0);

  return (
    <div className="space-y-4">
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Total AI cost" value={formatUsdAmountAsInr(totalCost)} sub={`last ${period}d`} />
        <Stat label="Credits charged" value={totalCredits.toFixed(0)} />
        <Stat label="Models in use" value={rows.length.toString()} />
      </div>
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {["Model", "Calls", "Tokens in", "Tokens out", "Cost (INR)", "Credits"].map((h) => (
                <th key={h} className="text-left text-[10px] uppercase tracking-widest text-muted-foreground px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState
                  icon={Cpu}
                  title="No AI activity in this period"
                  description="Model usage will show up here after users run AI features."
                  compact
                />
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={`${r.model}-${i}`} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                <td className="px-3 py-2 font-bold">{r.calls.toLocaleString()}</td>
                <td className="px-3 py-2">{r.tokens_in.toLocaleString()}</td>
                <td className="px-3 py-2">{r.tokens_out.toLocaleString()}</td>
                <td className="px-3 py-2">{formatUsdAmountAsInr(r.cost, 3)}</td>
                <td className="px-3 py-2">{r.credits.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────── MOCK TESTS ───────────────────────
function MockTab({ period }: { period: Period }) {
  const [stats, setStats] = useState<{ created: number; submitted: number; byExam: { exam: string; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const since = new Date(Date.now() - period * 86400_000).toISOString();
        const [created, submitted, examTypes] = await Promise.all([
          adminAnalyticsDB.countMockTestsCreatedSince(since),
          adminAnalyticsDB.countMockTestsSubmittedSince(since),
          adminAnalyticsDB.getQuestionExamTypesSince(since),
        ]);
        const map: Record<string, number> = {};
        examTypes.forEach((examType) => {
          const k = examType ?? "Other";
          map[k] = (map[k] ?? 0) + 1;
        });
        const byExam = Object.entries(map)
          .map(([exam, count]) => ({ exam, count }))
          .sort((a, b) => b.count - a.count);
        if (cancelled) return;
        setStats({ created, submitted, byExam });
      } catch (err) {
        if (cancelled) return;
        setLoadError(toAdminUserMessage(err, undefined, "AdminAnalytics.mock"));
        setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, reloadTick]);

  if (loading) return <SkeletonGrid />;

  if (loadError && !stats) {
    return (
      <div className="space-y-4">
        <InlineErrorRetry message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
        <EmptyState
          icon={FileText}
          title="Mock test stats unavailable"
          description="Retry to load mock test activity for this period."
          compact
          actionLabel="Retry"
          onAction={() => setReloadTick((n) => n + 1)}
        />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Tests created" value={stats.created.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="Tests submitted" value={stats.submitted.toLocaleString()} />
        <Stat label="Completion rate" value={`${stats.created ? Math.round((stats.submitted / stats.created) * 100) : 0}%`} />
      </div>
      <Card><CardContent className="p-5">
        <h3 className="text-sm font-semibold mb-3">New questions added by exam</h3>
        {stats.byExam.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No new questions in this period"
            description="Question imports and exam uploads will appear here once added."
            compact
          />
        ) : (
          <div className="h-48 min-h-[192px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={192}>
              <BarChart
                layout="vertical"
                data={stats.byExam.map((e) => ({
                  exam: e.exam.replace(/_/g, " "),
                  count: e.count,
                }))}
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="exam" width={100} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Questions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}

// ─────────────────────── SUPPORT/CHAT ───────────────────────
function ChatTab({ period }: { period: Period }) {
  const [stats, setStats] = useState<{ open: number; resolved: number; avgResolution: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const since = new Date(Date.now() - period * 86400_000).toISOString();
        const threadStats = await adminAnalyticsDB.getSupportThreadStats(since);
        if (cancelled) return;
        setStats({
          open: threadStats.open,
          resolved: threadStats.resolved,
          avgResolution: threadStats.avgResolutionHours,
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(toAdminUserMessage(err, undefined, "AdminAnalytics.chat"));
        setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, reloadTick]);

  if (loading) return <SkeletonGrid />;

  if (loadError && !stats) {
    return (
      <div className="space-y-4">
        <InlineErrorRetry message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
        <EmptyState
          icon={MessageSquare}
          title="Support stats unavailable"
          description="Retry to load support thread metrics for this period."
          compact
          actionLabel="Retry"
          onAction={() => setReloadTick((n) => n + 1)}
        />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Open threads" value={stats.open.toLocaleString()} />
        <Stat label="Resolved" value={stats.resolved.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="Avg resolution" value={`${stats.avgResolution.toFixed(1)} h`} />
      </div>
      {stats.open === 0 && stats.resolved === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No support threads in this period"
          description="Open and resolved thread counts will appear here once users contact support."
          compact
        />
      )}
    </div>
  );
}

// ─────────────────────── HELPERS ───────────────────────
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-2xl font-black text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
    </CardContent></Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
