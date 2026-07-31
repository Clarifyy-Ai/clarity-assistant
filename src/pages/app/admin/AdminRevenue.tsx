import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { creditsDB } from "@/lib/supabase/database";
import { ENV } from "@/lib/env";
import { PLAN_PRICE_CENTS_MONTHLY } from "@/lib/constants/pricing";
import { formatCents, formatNumber, formatPercent, formatDate } from "@/lib/utils/formatters";
import { timeAgo }             from "@/lib/utils/dateUtils";

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge }   from "@/components/ui/Badge";
import { Button }  from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  DollarSign, TrendingUp, TrendingDown, Users,
  CreditCard, Download, RefreshCw,
} from "lucide-react";

interface RevenueMetrics {
  mrr:               number;
  arr:               number;
  mrrGrowth:         number;
  activeSubscribers: number;
  churnRate:         number;
  ltv:               number;
  totalRevenue:      number;
  creditRevenue:     number;
  /** INR paise from paid Razorpay orders in the selected window (separate from USD MRR). */
  inrRevenuePaise:   number;
}

interface PlanDistribution {
  planId:     string;
  planName:   string;
  userCount:  number;
  mrr:        number;
  percentage: number;
}

interface RevenueTransaction {
  id:          string;
  userId:      string;
  userEmail:   string;
  type:        "subscription" | "credits" | "refund";
  amount:      number;
  description: string;
  createdAt:   string;
  status:      "succeeded" | "refunded" | "failed";
}

type DateRange = "7d" | "30d" | "90d" | "12m";

const STRIPE_CONFIGURED =
  !!ENV.STRIPE_PRICE_PRO_MONTHLY || !!ENV.STRIPE_PRICE_STARTER_MONTHLY;

const RANGE_DAYS: Record<DateRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

interface MetricCardProps {
  title:      string;
  value:      string;
  subtitle?:  string;
  trend?:     number;
  trendLabel?: string;
  icon:       React.ElementType;
  loading:    boolean;
}

function MetricCard({
  title, value, subtitle, trend, trendLabel, icon: Icon, loading,
}: MetricCardProps) {
  const isPositive = (trend ?? 0) >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        )}
        {trend !== undefined && !loading && (
          <div className="flex items-center gap-1">
            {isPositive
              ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            }
            <span className={`text-xs font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
              {isPositive ? "+" : ""}{formatPercent(Math.abs(trend) / 100)}
            </span>
            {trendLabel && (
              <span className="text-xs text-muted-foreground">{trendLabel}</span>
            )}
          </div>
        )}
        {subtitle && !loading && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

type BadgeVariant = "default" | "violet" | "emerald" | "red" | "amber" | "blue" | "gray";

const PLAN_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  free:       "default",
  starter:    "blue",
  pro:        "violet",
  elite:      "red",
  enterprise: "red",
};

export default function AdminRevenue() {
  const [metrics,      setMetrics]      = useState<RevenueMetrics | null>(null);
  const [plans,        setPlans]        = useState<PlanDistribution[]>([]);
  const [transactions, setTransactions] = useState<RevenueTransaction[]>([]);
  const [dateRange,    setDateRange]    = useState<DateRange>("30d");
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mrrIsEstimated, setMrrIsEstimated] = useState(!STRIPE_CONFIGURED);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else             setIsLoading(true);
    setLoadError(null);

    try {
      const days = RANGE_DAYS[dateRange];
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();

      // Previous-period window for growth calc
      const prevSince = new Date();
      prevSince.setDate(prevSince.getDate() - days * 2);
      const prevSinceIso = prevSince.toISOString();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("plan_id, credits, stripe_subscription_id, subscription_status");

      if (profileData) {
        const planCounts: Record<string, number> = {};
        let activeSubscribers = 0;

        profileData.forEach((p) => {
          const row = p as { plan_id?: string; subscription_status?: string };
          const planId = row.plan_id ?? "free";
          planCounts[planId] = (planCounts[planId] ?? 0) + 1;
          if (row.subscription_status === "active") activeSubscribers++;
        });

        const planNames: Record<string, string> = {
          free: "Free", starter: "Pro", pro: "Pro", elite: "Pro", enterprise: "Max",
        };

        const total = profileData.length || 1;
        const planDist: PlanDistribution[] = Object.entries(planCounts).map(([planId, count]) => {
          const planKey = planId as keyof typeof PLAN_PRICE_CENTS_MONTHLY;
          const cents = PLAN_PRICE_CENTS_MONTHLY[planKey] ?? 0;
          return {
            planId,
            planName:   planNames[planId] ?? planId,
            userCount:  count,
            mrr:        (cents ?? 0) * count,
            percentage: (count / total) * 100,
          };
        });

        setPlans(planDist);

        const planEstimateMrr = planDist.reduce((sum, p) => sum + p.mrr, 0);

        const { data: subRows } = await supabase
          .from("subscriptions")
          .select("status")
          .in("status", ["active", "trialing"]);

        const subsFromTable = subRows?.length ?? 0;
        const activeCount = Math.max(activeSubscribers, subsFromTable);

        // Churn: subscriptions canceled in current period
        const { count: canceledInPeriod } = await (supabase as any)
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "canceled")
          .gte("updated_at", sinceIso);

        const churnRate = activeCount > 0
          ? ((canceledInPeriod ?? 0) / (activeCount + (canceledInPeriod ?? 0))) * 100
          : 0;

        const txData = await creditsDB.listRecent(50);
        // P0-6: USD MRR from active subscriptions × catalog prices (not credit ledger).
        const usdMrrRows = await creditsDB.monthlyRevenueByPlan(sinceIso);
        const subscriptionMrr = usdMrrRows.reduce((sum, row) => sum + row.totalCents, 0);
        const mrr = subscriptionMrr > 0 ? subscriptionMrr : planEstimateMrr;
        // Estimated when Stripe isn't configured OR we fell back to profile plan counts.
        setMrrIsEstimated(!STRIPE_CONFIGURED || subscriptionMrr === 0);

        let inrRevenuePaise = 0;
        try {
          inrRevenuePaise = await creditsDB.sumRazorpayPaidPaiseSince(sinceIso);
        } catch {
          inrRevenuePaise = 0;
        }

        // MRR growth vs previous snapshot (subscription-based)
        let mrrGrowth = 0;
        try {
          const prevRows = await creditsDB.monthlyRevenueByPlan(prevSinceIso);
          const prevTotal = prevRows.reduce((sum, row) => sum + row.totalCents, 0);
          if (prevTotal > 0 && mrr !== prevTotal) {
            mrrGrowth = ((mrr - prevTotal) / prevTotal) * 100;
          }
        } catch {
          mrrGrowth = 0;
        }

        const userIds = [...new Set((txData ?? []).map((tx) => tx.user_id))];
        const emailByUser: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profileEmails } = await supabase
            .from("profiles")
            .select("id, email")
            .in("id", userIds);
          (profileEmails ?? []).forEach((p) => {
            if (p.id && p.email) emailByUser[p.id] = p.email;
          });
        }

        if (txData) {
          const txs: RevenueTransaction[] = txData.map((tx) => ({
            id:          tx.id,
            userId:      tx.user_id,
            userEmail:   emailByUser[tx.user_id] ?? `user-${tx.user_id.slice(0, 8)}`,
            type:        String(tx.action ?? "").includes("purchase") ? "credits" : "subscription",
            amount:      Math.abs(Number(tx.amount) || 0),
            description: tx.action ?? "",
            createdAt:   tx.created_at,
            status:      "succeeded" as const,
          }));
          setTransactions(txs);
        }

        // LTV: average revenue per paying user / monthly churn rate (capped sanely),
        // or fallback to 18-month multiplier when churn is 0.
        const arpu = activeCount > 0 ? mrr / activeCount : 0;
        const monthlyChurnFrac = churnRate / 100;
        const ltv = monthlyChurnFrac > 0
          ? Math.round(arpu / monthlyChurnFrac)
          : Math.round(arpu * 18);

        setMetrics({
          mrr,
          arr:               mrr * 12,
          mrrGrowth,
          activeSubscribers: activeCount,
          churnRate,
          ltv,
          totalRevenue:      mrr,
          creditRevenue:     0,
          inrRevenuePaise,
        });
      }
    } catch (err) {
      console.error("[AdminRevenue] fetch error:", err);
      setLoadError("Failed to load revenue metrics. Please retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateRange]);  

  const exportCSV = () => {
    const rows = [
      ["ID", "User", "Type", "Amount", "Description", "Status", "Date"],
      ...transactions.map((tx) => [
        tx.id,
        tx.userEmail,
        tx.type,
        (tx.amount / 100).toFixed(2),
        tx.description,
        tx.status,
        formatDate(tx.createdAt),
      ]),
    ];
    const csv  = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `revenue-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Revenue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mrrIsEstimated
              ? "USD MRR estimated from active plan counts × catalog prices. INR shown separately from Razorpay payment_orders."
              : "USD MRR from active/trialing subscriptions × catalog prices. INR shown separately from Razorpay payment_orders."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[120px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost" size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>

          <Button size="sm" onClick={exportCSV} disabled={isLoading}
            leftIcon={<Download className="h-3.5 w-3.5" />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void fetchData(true)} />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
      <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title={mrrIsEstimated ? "MRR — Estimated (Stripe disconnected)" : "MRR"}
          value={metrics ? formatCents(metrics.mrr) : "—"}
          trend={metrics?.mrrGrowth}
          trendLabel="vs last month"
          icon={DollarSign}
          loading={isLoading}
        />
        <MetricCard
          title="ARR"
          value={metrics ? formatCents(metrics.arr) : "—"}
          subtitle="Annualised run rate"
          icon={TrendingUp}
          loading={isLoading}
        />
        <MetricCard
          title="Active Subscribers"
          value={metrics ? formatNumber(metrics.activeSubscribers) : "—"}
          subtitle={`Churn: ${metrics ? formatPercent(metrics.churnRate / 100) : "—"}/mo`}
          icon={Users}
          loading={isLoading}
        />
        <MetricCard
          title="Avg. LTV"
          value={metrics ? formatCents(metrics.ltv) : "—"}
          subtitle="Per paying user"
          icon={CreditCard}
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          title="USD MRR"
          value={metrics ? formatCents(metrics.mrr) : "—"}
          subtitle="Active/trialing × catalog USD prices"
          icon={DollarSign}
          loading={isLoading}
        />
        <MetricCard
          title="INR revenue (period)"
          value={
            metrics
              ? `₹${(metrics.inrRevenuePaise / 100).toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}`
              : "—"
          }
          subtitle="Paid Razorpay orders in selected range (not blended into USD MRR)"
          icon={CreditCard}
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Plan Distribution */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
            <CardDescription>Users and MRR by plan tier</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))
              : plans
                  .sort((a, b) => b.mrr - a.mrr)
                  .map((plan) => (
                    <div key={plan.planId} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant={PLAN_BADGE_VARIANTS[plan.planId] ?? "default"}>
                            {plan.planName}
                          </Badge>
                          <span className="text-muted-foreground tabular-nums">
                            {formatNumber(plan.userCount)} users
                          </span>
                        </div>
                        <span className="font-medium">{formatCents(plan.mrr)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all duration-500"
                          style={{ width: `${plan.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))
            }
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <CardDescription>Latest {transactions.length} revenue events</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : transactions.length === 0
                      ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <EmptyState
                              icon={CreditCard}
                              title="No transactions yet"
                              description="Revenue events will appear here once users subscribe or purchase credits."
                              compact
                            />
                          </TableCell>
                        </TableRow>
                      )
                      : transactions.map((tx) => (
                          <TableRow key={tx.id} className="text-sm">
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {tx.userEmail}
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                tx.type === "subscription" ? "violet"
                                : tx.type === "credits"     ? "blue"
                                : "red"
                              } className="capitalize">
                                {tx.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">
                              {tx.description}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              <span className={tx.type === "refund" ? "text-red-500" : "text-green-600"}>
                                {tx.type === "refund" ? "-" : "+"}{formatCents(tx.amount)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                              {timeAgo(tx.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))
                  }
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
