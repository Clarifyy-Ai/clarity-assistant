import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { adminAnalyticsDB } from "@/lib/supabase/database";
import { supabase } from "@/integrations/supabase/client";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Users,
  TrendingUp, Activity,
  DollarSign, Flag, LifeBuoy, ScrollText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { type PlanId } from "@/lib/constants/pricing";
import { formatInrPaise, razorpayPaiseForPlan } from "@/lib/billing/priceCalculator";
import { formatUsdAmountAsInr } from "@/lib/utils/formatters";
import {
  runAdminHealthChecks,
  type HealthCheck,
} from "@/pages/app/admin/AdminDiagnostics";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DashboardStats {
  totalUsers:    number;
  proUsers:      number;
  freeUsers:     number;
  todaySessions: number;
  totalSessions: number;
  mrrPaise:      number;
  convRate:      string;
  aiSpendUsd:    number;
  activeSubscriptions: number;
}

interface KPIItem {
  label: string;
  value: string;
  sub:   string;
  icon:  LucideIcon;
  delta: string | null;
  up:    boolean;
}

function AdminStatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

function DashboardHealthStrip() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);

  useEffect(() => {
    void runAdminHealthChecks()
      .then(setChecks)
      .catch(() => setChecks([]));
  }, []);

  if (checks.length === 0) return null;

  const fail = checks.filter((c) => c.status === "FAIL").length;
  const warn = checks.filter((c) => c.status === "WARNING" || c.status === "NOT_CONFIGURED").length;
  const pass = checks.filter((c) => c.status === "PASS").length;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Operational health</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pass} pass · {warn} warn/not configured · {fail} fail
          </p>
        </div>
        <Link
          to="/app/admin/diagnostics"
          className="text-sm text-primary hover:underline"
        >
          Open diagnostics
        </Link>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const [stats,   setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    setLoading(true);
    setError(null);

    try {
      const counts = await adminAnalyticsDB.getDashboardStats();
      const { totalUsers, proUsers, todaySessions, totalSessions } = counts;

      const since = subDays(new Date(), 7).toISOString();
      const [{ data: subs, error: subsError }, { data: usage, error: usageError }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan_id, status")
          .in("status", ["active", "trialing"]),
        supabase
          .from("ai_usage_logs" as "profiles")
          .select("cost_microcents")
          .gte("created_at", since),
      ]);
      if (subsError) throw subsError;
      if (usageError) throw usageError;

      let mrrPaise = 0;
      for (const sub of subs ?? []) {
        const planId = String(sub.plan_id ?? "pro") as PlanId;
        mrrPaise += razorpayPaiseForPlan(planId) ?? 0;
      }

      const usageRows = (usage ?? []) as Array<{ cost_microcents?: number | null }>;
      const aiSpendUsd =
        usageRows.reduce((sum, row) => sum + (Number(row.cost_microcents) || 0), 0) /
        1_000_000;

      setStats({
        totalUsers,
        proUsers,
        freeUsers: totalUsers - proUsers,
        todaySessions,
        totalSessions,
        mrrPaise,
        convRate: totalUsers ? ((proUsers / totalUsers) * 100).toFixed(1) : "0",
        aiSpendUsd,
        activeSubscriptions: subs?.length ?? 0,
      });
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load admin stats";
      console.error("[AdminDashboard] fetchStats:", e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const KPIs: KPIItem[] = stats ? [
    {
      label: "Total users",
      value: stats.totalUsers.toLocaleString(),
      sub:   `${stats.freeUsers} free · ${stats.proUsers} pro`,
      icon:  Users,
      delta: null,
      up:    true,
    },
    {
      label: "Conversion rate",
      value: `${stats.convRate}%`,
      sub:   "Free → paid plans",
      icon:  TrendingUp,
      delta: null,
      up:    true,
    },
    {
      label: "Catalog value",
      value: formatInrPaise(stats.mrrPaise),
      sub:   `${stats.activeSubscriptions} active paid plans (INR)`,
      icon:  DollarSign,
      delta: null,
      up:    true,
    },
    {
      label: "Sessions today",
      value: stats.todaySessions.toLocaleString(),
      sub:   `${stats.totalSessions.toLocaleString()} total`,
      icon:  Activity,
      delta: null,
      up:    true,
    },
  ] : [];

  return (
    <PageContent className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Platform metrics, user activity, and operational shortcuts"
        badge="Admin only"
      />

      {error && !loading && (
        <InlineErrorRetry message={error} onRetry={() => void fetchStats()} />
      )}

      <DashboardHealthStrip />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground">Dashboard metrics unavailable. Please try again.</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {KPIs.map((kpi) => (
            <AdminStatCard
              key={kpi.label}
              title={kpi.label}
              value={kpi.value}
              description={kpi.sub}
              icon={kpi.icon}
            />
          ))}
        </div>

        {stats && (
          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">AI provider spend (7d)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Aggregated from ai_usage_logs (USD API cost shown in INR) ·{" "}
                  <Link to="/app/admin/model-costs" className="text-primary hover:text-primary/80">
                    View breakdown
                  </Link>
                </p>
              </div>
              <p className="text-2xl font-black text-foreground">
                {formatUsdAmountAsInr(stats.aiSpendUsd)}
              </p>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: "/app/admin/users", icon: Users, label: "Manage users", color: "text-primary" },
            { to: "/app/admin/support", icon: LifeBuoy, label: "Support queue", color: "text-blue-400" },
            { to: "/app/admin/feature-flags", icon: Flag, label: "Feature flags", color: "text-amber-400" },
            { to: "/app/admin/audit-log", icon: ScrollText, label: "Audit log", color: "text-emerald-400" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:border-primary/30 hover:bg-card/80 transition-all"
            >
              <item.icon className={cn("w-4 h-4 shrink-0", item.color)} />
              {item.label}
            </Link>
          ))}
        </div>
        </>
      )}

      {/* Recent signups table */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Recent signups
        </h3>
        <RecentSignups />
      </Card>

      {/* Session volume last 7 days */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Session volume — last 7 days
        </h3>
        <SessionVolumeChart />
      </Card>
    </PageContent>
  );
}

interface SignupRow {
  id:         string;
  full_name:  string | null;
  email:      string | null;
  plan_id:    string | null;
  created_at: string;
}

function RecentSignups() {
  const [rows, setRows] = useState<SignupRow[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email, plan_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setRows((data as unknown as SignupRow[]) ?? []));
  }, []);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Name", "Email", "Plan", "Joined"].map((h) => (
              <th key={h} className="text-left text-[10px] text-muted-foreground uppercase tracking-widest pb-3 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-3 pr-4 text-foreground font-medium">
                {row.full_name ?? "—"}
              </td>
              <td className="py-3 pr-4 text-muted-foreground text-xs">
                {row.email}
              </td>
              <td className="py-3 pr-4">
                <Badge
                  variant={row.plan_id === "free" ? "default" : "violet"}
                  size="sm"
                >
                  {row.plan_id}
                </Badge>
              </td>
              <td className="py-3 text-muted-foreground text-xs">
                {format(new Date(row.created_at), "MMM d, yyyy")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DayCount {
  day:   string;
  count: number;
}

function SessionVolumeChart() {
  const [data, setData] = useState<DayCount[]>([]);

  useEffect(() => {
    const days = [...Array(7)].map((_, i) => {
      const d = subDays(new Date(), 6 - i);
      return format(d, "yyyy-MM-dd");
    });

    Promise.all(
      days.map((day) =>
        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .gte("created_at", `${day}T00:00:00`)
          .lt("created_at", `${day}T23:59:59`)
          .then(({ count }) => ({ day, count: count ?? 0 }))
      )
    ).then(setData);
  }, []);

  const chartData = data.map((d) => ({
    day: format(new Date(d.day), "EEE"),
    count: d.count,
    full: d.day,
  }));

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.full
                ? format(new Date(payload[0].payload.full), "MMM d")
                : ""
            }
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Sessions" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
