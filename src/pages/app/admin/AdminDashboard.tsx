import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminAnalyticsDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Users,
  TrendingUp, TrendingDown, Activity,
  DollarSign, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";

interface DashboardStats {
  totalUsers:    number;
  proUsers:      number;
  freeUsers:     number;
  todaySessions: number;
  totalSessions: number;
  mrr:           number;
  convRate:      string;
}

interface KPIItem {
  label: string;
  value: string;
  sub:   string;
  icon:  React.ReactNode;
  delta: string | null;
  up:    boolean;
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

      setStats({
        totalUsers,
        proUsers,
        freeUsers: totalUsers - proUsers,
        todaySessions,
        totalSessions,
        mrr: proUsers * 19,
        convRate: totalUsers ? ((proUsers / totalUsers) * 100).toFixed(1) : "0",
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
      icon:  <Users className="w-4 h-4 text-violet-400" />,
      delta: null,
      up:    true,
    },
    {
      label: "Conversion rate",
      value: `${stats.convRate}%`,
      sub:   "Free → paid plans",
      icon:  <TrendingUp className="w-4 h-4 text-emerald-400" />,
      delta: null,
      up:    true,
    },
    {
      label: "Est. MRR",
      value: `$${stats.mrr.toLocaleString()}`,
      sub:   "Pro users × $19 (estimate)",
      icon:  <DollarSign className="w-4 h-4 text-amber-400" />,
      delta: null,
      up:    true,
    },
    {
      label: "Sessions today",
      value: stats.todaySessions.toLocaleString(),
      sub:   `${stats.totalSessions.toLocaleString()} total`,
      icon:  <Activity className="w-4 h-4 text-blue-400" />,
      delta: null,
      up:    true,
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
        <Badge variant="red" size="sm">Admin only</Badge>
      </div>

      {error && !loading && (
        <Card>
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-foreground font-medium">Failed to load stats</p>
              <p className="text-muted-foreground text-xs mt-0.5">{error}</p>
              <button
                onClick={fetchStats}
                className="mt-2 text-xs text-violet-400 hover:text-violet-300 font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {KPIs.map((kpi) => (
            <Card key={kpi.label}>
              <div className="flex items-center justify-between mb-2">
                {kpi.icon}
                {kpi.delta && (
                  <span className={cn(
                    "text-[10px] font-semibold flex items-center gap-0.5",
                    kpi.up ? "text-emerald-400" : "text-red-400"
                  )}>
                    {kpi.up
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />
                    }
                    {kpi.delta}
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-foreground">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
            </Card>
          ))}
        </div>
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
    </div>
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

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-violet-500/60 hover:bg-violet-500 rounded-sm transition-all"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: "4px" }}
          />
          <span className="text-[9px] text-muted-foreground">
            {format(new Date(d.day), "EEE")}
          </span>
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg px-2 py-1 text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
            {d.count} sessions
          </div>
        </div>
      ))}
    </div>
  );
}
