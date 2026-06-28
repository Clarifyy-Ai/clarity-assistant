import { useEffect, useState } from "react";
import { adminAnalyticsDB } from "@/lib/supabase/database";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import {
  BarChart2, Activity, Cpu, FileText, MessageSquare, RefreshCw,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";

type Period = 1 | 7 | 30 | 90;

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<Period>(7);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" /> Platform Analytics
        </h1>
        <div className="flex gap-1 p-1 bg-secondary rounded-xl border border-border">
          {([1, 7, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                period === p ? "bg-primary/20 text-primary/80" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === 1 ? "24h" : `${p}d`}
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

  useEffect(() => { void load(); }, [period]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const since = new Date(Date.now() - period * 86400_000).toISOString();

      const [sessions, signups, dauSeries] = await Promise.all([
        adminAnalyticsDB.countSessionsSince(since),
        adminAnalyticsDB.countSignupsSince(since),
        adminAnalyticsDB.getDauMauSeries(period),
      ]);

      const latestDau = dauSeries.length > 0 ? Number(dauSeries[dauSeries.length - 1]?.dau ?? 0) : 0;
      const peakDau = dauSeries.reduce((max, r) => Math.max(max, Number(r.dau ?? 0)), 0);

      const days = Array.from({ length: Math.min(period, 30) }, (_, i) =>
        format(subDays(new Date(), Math.min(period, 30) - 1 - i), "yyyy-MM-dd"),
      );
      const signupData = await Promise.all(
        days.map(async (day) => ({
          day,
          count: await adminAnalyticsDB.countSignupsOnDay(day),
        })),
      );
      setSignupSeries(signupData);

      setStats({
        dau: latestDau,
        sessions,
        signups,
        activeUsers: peakDau,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load overview");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        {loadError && (
          <InlineErrorRetry message={loadError} onRetry={() => void load()} />
        )}
        <SkeletonGrid />
      </div>
    );
  }

  const max = Math.max(...signupSeries.map((d) => d.count), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="DAU (today)" value={stats.dau.toLocaleString()} />
        <Stat label="Active users" value={stats.activeUsers.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="Sessions" value={stats.sessions.toLocaleString()} sub={`last ${period}d`} />
        <Stat label="New signups" value={stats.signups.toLocaleString()} sub={`last ${period}d`} />
      </div>

      <Card><CardContent className="p-5">
        <h3 className="text-sm font-semibold mb-3">Daily signups</h3>
        <div className="flex items-end gap-1 h-24">
          {signupSeries.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className="w-full bg-primary/50 hover:bg-primary rounded-sm transition-all"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: "2px" }}
              />
            </div>
          ))}
        </div>
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

  useEffect(() => { void load(); }, [period]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await adminAnalyticsDB.getPerfStats(period));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load performance stats");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <SkeletonGrid />;

  const totalCalls = rows.reduce((s, r) => s + Number(r.call_count), 0);
  const totalErrors = rows.reduce((s, r) => s + Number(r.error_count), 0);
  const errorRate = totalCalls ? ((totalErrors / totalCalls) * 100).toFixed(2) : "0";
  const avgP95 = rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.p95_ms || 0), 0) / rows.length) : 0;

  return (
    <div className="space-y-4">
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void load()} />
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
          <Button size="xs" variant="secondary" onClick={load} leftIcon={<RefreshCw className="w-3 h-3" />}>Refresh</Button>
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
                {rows.map((r) => (
                  <tr key={r.function_name} className="hover:bg-muted/20">
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

  useEffect(() => { void load(); }, [period]);

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
      setRows(Object.values(map).sort((a, b) => b.cost - a.cost));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load AI usage");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <SkeletonGrid />;

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalCredits = rows.reduce((s, r) => s + r.credits, 0);

  return (
    <div className="space-y-4">
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void load()} />
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Total AI cost" value={`$${totalCost.toFixed(2)}`} sub={`last ${period}d`} />
        <Stat label="Credits charged" value={totalCredits.toFixed(0)} />
        <Stat label="Models in use" value={rows.length.toString()} />
      </div>
      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {["Model", "Calls", "Tokens in", "Tokens out", "Cost USD", "Credits"].map((h) => (
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
            ) : rows.map((r) => (
              <tr key={r.model} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                <td className="px-3 py-2 font-bold">{r.calls.toLocaleString()}</td>
                <td className="px-3 py-2">{r.tokens_in.toLocaleString()}</td>
                <td className="px-3 py-2">{r.tokens_out.toLocaleString()}</td>
                <td className="px-3 py-2">${r.cost.toFixed(3)}</td>
                <td className="px-3 py-2">{r.credits.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─────────────────────── MOCK TESTS ───────────────────────
function MockTab({ period }: { period: Period }) {
  const [stats, setStats] = useState<{ created: number; submitted: number; byExam: { exam: string; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, [period]);

  async function load() {
    setLoading(true);
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
    setStats({ created, submitted, byExam });
    setLoading(false);
  }

  if (loading || !stats) return <SkeletonGrid />;

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
          <p className="text-xs text-muted-foreground italic">No new questions in this period</p>
        ) : (
          <div className="space-y-2">
            {stats.byExam.map((e) => (
              <div key={e.exam} className="flex items-center gap-3">
                <span className="text-xs text-foreground w-32 truncate">{e.exam.replace(/_/g, " ")}</span>
                <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(e.count / stats.byExam[0].count) * 100}%` }} />
                </div>
                <span className="text-xs font-bold w-10 text-right">{e.count}</span>
              </div>
            ))}
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

  useEffect(() => { void load(); }, [period]);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - period * 86400_000).toISOString();
    const threadStats = await adminAnalyticsDB.getSupportThreadStats(since);
    setStats({
      open: threadStats.open,
      resolved: threadStats.resolved,
      avgResolution: threadStats.avgResolutionHours,
    });
    setLoading(false);
  }

  if (loading || !stats) return <SkeletonGrid />;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat label="Open threads" value={stats.open.toLocaleString()} />
      <Stat label="Resolved" value={stats.resolved.toLocaleString()} sub={`last ${period}d`} />
      <Stat label="Avg resolution" value={`${stats.avgResolution.toFixed(1)} h`} />
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
