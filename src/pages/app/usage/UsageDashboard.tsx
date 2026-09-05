// src/pages/app/usage/UsageDashboard.tsx
//
// Dashboard analytics and usage tracking page.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Clock,
  CreditCard,
  RefreshCw,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { creditsDB, sessionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type UsagePeriod = "7d" | "30d" | "90d" | "all";
type TransactionTypeFilter = "all" | "usage" | "added";

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const STATS_TX_LIMIT = 200;
const TX_PAGE = 20;

function periodToDays(period: UsagePeriod): number | null {
  switch (period) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return null;
  }
}

function periodStartMs(period: UsagePeriod): number | null {
  const days = periodToDays(period);
  if (days === null) {
    return null;
  }
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function isWithinPeriod(
  value: string | null | undefined,
  period: UsagePeriod
): boolean {
  if (!value) {
    return false;
  }
  const start = periodStartMs(period);
  if (start === null) {
    return true;
  }
  return new Date(value).getTime() >= start;
}

function chartDayCount(period: UsagePeriod): number {
  return periodToDays(period) ?? 90;
}

type CreditTransaction = {
  id: string;
  action: string | null;
  amount: number | null;
  balance_after: number | null;
  description: string | null;
  created_at: string;
};

type SessionSummary = {
  id: string;
  type: string | null;
  status: string | null;
  title: string | null;
  duration_seconds: number | null;
  credits_consumed: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type UsageStats = {
  creditsUsed: number;
  creditsAdded: number;
  sessions: number;
  avgSessionMinutes: number;
};

type UsageDay = {
  date: string;
  used: number;
  added: number;
};

function formatCreditAction(transaction: CreditTransaction): string {
  const source = (transaction.description || transaction.action || "").trim();
  if (!source || source === "usage") return "Usage";
  return source.replace(/^prep_tool_/, "").replace(/_/g, " ");
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  return `${Math.round(seconds / 60)} min`;
}

function getDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildUsageTrend(
  transactions: CreditTransaction[],
  period: UsagePeriod
): UsageDay[] {
  const dayCount = chartDayCount(period);
  const days = new Map<string, UsageDay>();
  const now = new Date();

  for (let index = dayCount - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);

    const key = getDayKey(date);

    days.set(key, {
      date: key,
      used: 0,
      added: 0,
    });
  }

  for (const transaction of transactions) {
    if (!isWithinPeriod(transaction.created_at, period)) {
      continue;
    }

    const key = getDayKey(new Date(transaction.created_at));
    const day = days.get(key);

    if (!day) {
      continue;
    }

    const amount = transaction.amount ?? 0;

    if (amount < 0) {
      day.used += Math.abs(amount);
    } else {
      day.added += amount;
    }
  }

  return Array.from(days.values());
}

function calculateStats(
  transactions: CreditTransaction[],
  sessions: SessionSummary[],
  period: UsagePeriod
): UsageStats {
  const recentTransactions = transactions.filter((transaction) =>
    isWithinPeriod(transaction.created_at, period)
  );

  const creditsUsed = recentTransactions.reduce((total, transaction) => {
    const amount = transaction.amount ?? 0;

    return amount < 0 ? total + Math.abs(amount) : total;
  }, 0);

  const creditsAdded = recentTransactions.reduce((total, transaction) => {
    const amount = transaction.amount ?? 0;

    return amount > 0 ? total + amount : total;
  }, 0);

  const recentSessions = sessions.filter((session) =>
    isWithinPeriod(session.created_at, period)
  );

  const totalDuration = recentSessions.reduce(
    (total, session) => total + (session.duration_seconds ?? 0),
    0
  );

  return {
    creditsUsed,
    creditsAdded,
    sessions: recentSessions.length,
    avgSessionMinutes:
      recentSessions.length > 0
        ? Math.round(totalDuration / recentSessions.length / 60)
        : 0,
  };
}

function matchesTransactionFilter(
  transaction: CreditTransaction,
  filter: TransactionTypeFilter
): boolean {
  if (filter === "all") {
    return true;
  }

  const amount = transaction.amount ?? 0;
  return filter === "usage" ? amount < 0 : amount > 0;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {description}
            </p>
          </div>

          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageTrend({
  data,
  period,
}: {
  data: UsageDay[];
  period: UsagePeriod;
}) {
  const chartData = data.map((day) => ({
    label: day.date.slice(5),
    used: day.used,
    added: day.added,
  }));

  const dayCount = chartDayCount(period);

  return (
    <div
      className="h-44 w-full"
      role="img"
      aria-label={`Credits used and added over ${dayCount} days`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="used" name="Used" fill="hsl(0 84% 60%)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="added" name="Added" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UsageFilterControls({
  period,
  transactionFilter,
  onPeriodChange,
  onTransactionFilterChange,
  onClearFilters,
  filtersActive,
}: {
  period: UsagePeriod;
  transactionFilter: TransactionTypeFilter;
  onPeriodChange: (period: UsagePeriod) => void;
  onTransactionFilterChange: (filter: TransactionTypeFilter) => void;
  onClearFilters: () => void;
  filtersActive: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={period}
        onValueChange={(value) => onPeriodChange(value as UsagePeriod)}
      >
        <SelectTrigger
          className="w-[130px] h-9"
          data-testid="usage-filter-period"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
          <SelectItem value="all">All time</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={transactionFilter}
        onValueChange={(value) =>
          onTransactionFilterChange(value as TransactionTypeFilter)
        }
      >
        <SelectTrigger
          className="w-[130px] h-9"
          data-testid="usage-filter-transaction-type"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All activity</SelectItem>
          <SelectItem value="usage">Usage only</SelectItem>
          <SelectItem value="added">Added only</SelectItem>
        </SelectContent>
      </Select>

      {filtersActive && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

export default function UsageDashboard(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const credits = useAuthStore((state) => state.credits);
  const planId = useAuthStore((state) => state.planId);
  const refreshCredits = useAuthStore((state) => state.refreshCredits);

  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionTypeFilter>("all");
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreTx, setIsLoadingMoreTx] = useState(false);
  const [txOffset, setTxOffset] = useState(0);
  const [txHasMore, setTxHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadUsage(): Promise<void> {
    if (!user?.id) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [txData, sessionRows] = await Promise.all([
        creditsDB.listByUserIdWithBalancePage(user.id, {
          limit: STATS_TX_LIMIT,
          offset: 0,
        }),
        sessionsDB.listSummariesByUserId(user.id, 100),
      ]);

      setTransactions((txData ?? []) as CreditTransaction[]);
      setTxOffset(txData.length);
      setTxHasMore(txData.length >= STATS_TX_LIMIT);
      setSessions(
        sessionRows.map((s) => ({
          id: s.id,
          type: s.type,
          status: s.status,
          title: s.title,
          duration_seconds: s.duration_seconds ?? null,
          credits_consumed: s.credits_consumed ?? null,
          created_at: s.created_at,
          started_at: s.started_at ?? null,
          ended_at: s.ended_at ?? null,
        })),
      );

      await refreshCredits();
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load usage data."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMoreTransactions(): Promise<void> {
    if (!user?.id || !txHasMore || isLoadingMoreTx) return;

    setIsLoadingMoreTx(true);
    try {
      const page = await creditsDB.listByUserIdWithBalancePage(user.id, {
        limit: TX_PAGE,
        offset: txOffset,
      });
      setTransactions((prev) => [
        ...prev,
        ...(page as CreditTransaction[]),
      ]);
      setTxOffset((o) => o + page.length);
      setTxHasMore(page.length >= TX_PAGE);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load more transactions."
      );
    } finally {
      setIsLoadingMoreTx(false);
    }
  }

  useEffect(() => {
    void loadUsage();
  }, [user?.id]);

  const stats = useMemo(
    () => calculateStats(transactions, sessions, period),
    [transactions, sessions, period]
  );

  const trend = useMemo(
    () => buildUsageTrend(transactions, period),
    [transactions, period]
  );

  const filteredSessions = useMemo(
    () => sessions.filter((session) => isWithinPeriod(session.created_at, period)),
    [sessions, period]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          isWithinPeriod(transaction.created_at, period) &&
          matchesTransactionFilter(transaction, transactionFilter)
      ),
    [transactions, period, transactionFilter]
  );

  const filtersActive = period !== "30d" || transactionFilter !== "all";
  const periodLabel = PERIOD_LABELS[period];
  const chartTitle =
    period === "all"
      ? "90-day credit activity"
      : `${periodLabel.toLowerCase()} credit activity`;

  return (
    <PageContent className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Usage & Analytics"
        description="Track credits, sessions, and recent billing-related activity."
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Usage & Credits" },
        ]}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <UsageFilterControls
              period={period}
              transactionFilter={transactionFilter}
              onPeriodChange={setPeriod}
              onTransactionFilterChange={setTransactionFilter}
              filtersActive={filtersActive}
              onClearFilters={() => {
                setPeriod("30d");
                setTransactionFilter("all");
              }}
            />

            <Button
              variant="outline"
              onClick={() => void loadUsage()}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")}
              />
              Refresh
            </Button>

            <Button
              variant="primary"
              onClick={() => navigate("/app/settings/billing")}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Billing
            </Button>
          </div>
        }
      />

      {error && (
        <InlineErrorRetry
          message={error}
          onRetry={() => void loadUsage()}
        />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
      <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Available credits"
          value={credits}
          description={`Current plan: ${planId || profile?.plan_id || "free"}`}
          icon={Zap}
        />

        <StatCard
          title="Credits used"
          value={stats.creditsUsed}
          description={periodLabel}
          icon={BarChart3}
        />

        <StatCard
          title="Credits added"
          value={stats.creditsAdded}
          description="Purchases, refunds, renewals"
          icon={CreditCard}
        />

        <StatCard
          title="Sessions"
          value={stats.sessions}
          description={`Avg duration: ${stats.avgSessionMinutes} min · ${periodLabel.toLowerCase()}`}
          icon={Clock}
        />
      </div>
      </>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{chartTitle}</CardTitle>
            <CardDescription>
              Red bars show usage; green bars show added credits.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                Loading usage trend…
              </div>
            ) : (
              <UsageTrend data={trend} period={period} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No sessions in this period"
                description={
                  filtersActive
                    ? "Try widening the date range or clearing filters."
                    : "Start a mock interview or practice session to see activity here."
                }
                compact
              />
            ) : (
            <div className="space-y-3">
              {filteredSessions.slice(0, 6).map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">
                      {session.title || session.type || "Interview session"}
                    </p>

                    <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {session.status ?? "unknown"}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(session.created_at)} ·{" "}
                    {formatDuration(session.duration_seconds)}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Credits: {session.credits_consumed ?? 0}
                  </p>
                </div>
              ))}

            </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credit transactions</CardTitle>
          <CardDescription>
            {periodLabel}
            {transactionFilter !== "all"
              ? ` · ${transactionFilter === "usage" ? "Usage only" : "Added only"}`
              : ""}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={
                transactions.length === 0
                  ? "No transactions yet"
                  : "No transactions match these filters"
              }
              description={
                transactions.length === 0
                  ? "Credit purchases, usage, and subscription events will appear here."
                  : "Try widening the date range or changing the activity filter."
              }
              compact
            />
          ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">Balance</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((transaction) => {
                  const amount = transaction.amount ?? 0;
                  const isPositive = amount >= 0;

                  return (
                    <tr
                      key={transaction.id}
                      className="border-b border-border/60"
                    >
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(transaction.created_at)}
                      </td>

                      <td className="py-3 pr-4">
                        {formatCreditAction(transaction)}
                      </td>

                      <td className="py-3 pr-4 text-muted-foreground">
                        {transaction.description ?? "—"}
                      </td>

                      <td
                        className={cn(
                          "py-3 pr-4 text-right font-medium",
                          isPositive ? "text-emerald-500" : "text-red-500"
                        )}
                      >
                        {isPositive ? "+" : ""}
                        {amount}
                      </td>

                      <td className="py-3 text-right">
                        {transaction.balance_after ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

            {txHasMore && (
              <div className="pt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  loading={isLoadingMoreTx}
                  onClick={() => void loadMoreTransactions()}
                >
                  Load more transactions
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>
    </PageContent>
  );
}
