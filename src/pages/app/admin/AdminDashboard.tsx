// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Users, BarChart2, CreditCard, Zap,
  TrendingUp, TrendingDown, Activity,
  CalendarDays, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// AdminDashboard — platform-wide KPIs
// ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats,   setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    setLoading(true);

    const [
      { count: totalUsers },
      { count: proUsers   },
      { count: todaySessions },
      { count: totalSessions },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).neq("plan", "free"),
      supabase.from("sessions").select("*", { count: "exact", head: true })
        .gte("created_at", new Date().toISOString().slice(0, 10)),
      supabase.from("sessions").select("*", { count: "exact", head: true }),
    ]);

    setStats({
      totalUsers,
      proUsers,
      freeUsers:   (totalUsers ?? 0) - (proUsers ?? 0),
      todaySessions,
      totalSessions,
      mrr:         (proUsers ?? 0) * 19,
      convRate:    totalUsers ? (((proUsers ?? 0) / totalUsers) * 100).toFixed(1) : "0",
    });

    setLoading(false);
  }

  const KPIs = stats ? [
    {
      label: "Total users",
      value: stats.totalUsers?.toLocaleString() ?? "—",
      sub:   `${stats.freeUsers} free · ${stats.proUsers} pro`,
      icon:  <Users className="w-4 h-4 text-violet-400" />,
      delta: "+12%",
      up:    true,
    },
    {
      label: "Conversion rate",
      value: `${stats.convRate}%`,
      sub:   "Free → Pro",
      icon:  <TrendingUp className="w-4 h-4 text-emerald-400" />,
      delta: "+2.1%",
      up:    true,
    },
    {
      label: "Est. MRR",
      value: `$${stats.mrr?.toLocaleString() ?? "—"}`,
      sub:   "Monthly recurring revenue",
      icon:  <DollarSign className="w-4 h-4 text-amber-400" />,
      delta: "+8%",
      up:    true,
    },
    {
      label: "Sessions today",
      value: stats.todaySessions?.toLocaleString() ?? "—",
      sub:   `${stats.totalSessions?.toLocaleString()} total`,
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

// ─────────────────────────────────────────────────────────────────
// RecentSignups
// ─────────────────────────────────────────────────────────────────

function RecentSignups() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email, plan, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setRows(data ?? []));
  }, []);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8">
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
                  variant={row.plan === "free" ? "default" : "violet"}
                  size="sm"
                >
                  {row.plan}
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

// ─────────────────────────────────────────────────────────────────
// SessionVolumeChart — simple bar chart
// ─────────────────────────────────────────────────────────────────

function SessionVolumeChart() {
  const [data, setData] = useState<{ day: string; count: number }[]>([]);

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
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] border border-white/15 rounded-lg px-2 py-1 text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
            {d.count} sessions
          </div>
        </div>
      ))}
    </div>
  );
}
