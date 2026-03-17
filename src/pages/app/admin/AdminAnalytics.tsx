import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  BarChart2, Users, Activity,
  TrendingUp, Zap, Globe,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// AdminAnalytics — platform-wide analytics
// ─────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const [dailySignups, setDailySignups] = useState<{day: string; count: number}[]>([]);
  const [topCompanies, setTopCompanies] = useState<any[]>([]);
  const [planDist,     setPlanDist]     = useState<any>({});
  const [loading,      setLoading]      = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);

    // Daily signups last 14 days
    const days = [...Array(14)].map((_, i) => {
      const d = subDays(new Date(), 13 - i);
      return format(d, "yyyy-MM-dd");
    });

    const signupData = await Promise.all(
      days.map((day) =>
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", `${day}T00:00:00`)
          .lt("created_at", `${day}T23:59:59`)
          .then(({ count }) => ({ day, count: count ?? 0 }))
      )
    );
    setDailySignups(signupData);

    // Plan distribution
    const [{ count: free }, { count: pro }, { count: team }] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("plan", "free"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("plan", "pro"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("plan", "team"),
    ]);
    const total = (free ?? 0) + (pro ?? 0) + (team ?? 0);
    setPlanDist({ free, pro, team, total });

    // Top companies practiced for
    const { data: companyData } = await supabase
      .from("sessions")
      .select("target_company")
      .not("target_company", "is", null)
      .limit(500);

    const counts: Record<string, number> = {};
    (companyData ?? []).forEach((s: any) => {
      if (s.target_company) counts[s.target_company] = (counts[s.target_company] ?? 0) + 1;
    });
    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    setTopCompanies(sorted);

    setLoading(false);
  }

  const maxSignup = Math.max(...dailySignups.map((d) => d.count), 1);
  const maxCompany = Math.max(...topCompanies.map((c) => c.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-violet-400" />
        Platform Analytics
      </h1>

      {/* Signups chart */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">
          Daily signups — last 14 days
        </h3>
        <div className="flex items-end gap-1.5 h-28">
          {dailySignups.map((d) => (
            <div
              key={d.day}
              className="flex-1 flex flex-col items-center gap-1 group relative"
            >
              <div
                className="w-full bg-violet-500/50 hover:bg-violet-500 rounded-sm transition-all"
                style={{ height: `${(d.count / maxSignup) * 100}%`, minHeight: "2px" }}
              />
              <span className="text-[9px] text-gray-700">
                {format(new Date(d.day), "d")}
              </span>
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] border border-white/15 rounded-lg px-2 py-1 text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
                {d.count} signups · {format(new Date(d.day), "MMM d")}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Plan distribution */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4">Plan distribution</h3>
          <div className="space-y-3">
            {[
              { key: "free", label: "Free",  color: "gray"   as const },
              { key: "pro",  label: "Pro",   color: "violet" as const },
              { key: "team", label: "Team",  color: "amber"  as const },
            ].map((p) => {
              const count = planDist[p.key] ?? 0;
              const pct   = planDist.total ? ((count / planDist.total) * 100).toFixed(1) : "0";
              return (
                <div key={p.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 capitalize">{p.label}</span>
                    <span className="text-xs font-bold text-white">
                      {count?.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <ProgressBar
                    value={count}
                    max={planDist.total ?? 1}
                    color={p.color}
                    size="sm"
                  />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top companies */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Top companies practised for
          </h3>
          <div className="space-y-2">
            {topCompanies.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600 w-4 text-right">
                  {i + 1}
                </span>
                <span className="text-xs text-gray-300 w-24 truncate">{c.name}</span>
                <ProgressBar
                  value={c.count}
                  max={maxCompany}
                  color="blue"
                  size="xs"
                  className="flex-1"
                />
                <span className="text-xs text-gray-500 w-6 text-right">
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
