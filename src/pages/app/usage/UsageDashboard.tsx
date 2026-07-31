// src/pages/app/usage/UsageDashboard.tsx
//
// Dashboard analytics and usage tracking page.

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/card";
import { openBillingPortal } from "@/lib/api/billing";
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
import { cn } from "@/lib/utils";

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
  creditsUsed30d: number;
  creditsAdded30d: number;
  sessions30d: number;
  avgSessionMinutes: number;
};

type UsageDay = {
  date: string;
  used: number;
  added: number;
};

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

function buildUsageTrend(transactions: CreditTransaction[]): UsageDay[] {
  const days = new Map<string, UsageDay>();
  const now = new Date();

  for (let index = 13; index >= 0; index -= 1) {
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
  sessions: SessionSummary[]
): UsageStats {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const recentTransactions = transactions.filter(
    (transaction) =>
      new Date(transaction.created_at).getTime() >= thirtyDaysAgo
  );

  const creditsUsed30d = recentTransactions.reduce((total, transaction) => {
    const amount = transaction.amount ?? 0;

    return amount < 0 ? total + Math.abs(amount) : total;
  }, 0);

  const creditsAdded30d = recentTransactions.reduce((total, transaction) => {
    const amount = transaction.amount ?? 0;

    return amount > 0 ? total + amount : total;
  }, 0);

  const recentSessions = sessions.filter(
    (session) => new Date(session.created_at).getTime() >= thirtyDaysAgo
  );

  const totalDuration = recentSessions.reduce(
    (total, session) => total + (session.duration_seconds ?? 0),
    0
  );

  return {
    creditsUsed30d,
    creditsAdded30d,
    sessions30d: recentSessions.length,
    avgSessionMinutes:
      recentSessions.length > 0
        ? Math.round(totalDuration / recentSessions.length / 60)
        : 0,
  };
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

function UsageTrend({ data }: { data: UsageDay[] }) {
  const chartData = data.map((day) => ({
    label: day.date.slice(5),
    used: day.used,
    added: day.added,
  }));

  return (
    <div className="h-44 w-full" role="img" aria-label="Credits used and added over 14 days">
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

export default function UsageDashboard(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const credits = useAuthStore((state) => state.credits);
  const planId = useAuthStore((state) => state.planId);
  const refreshCredits = useAuthStore((state) => state.refreshCredits);

  const TX_PAGE = 20;

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreTx, setIsLoadingMoreTx] = useState(false);
  const [txOffset, setTxOffset] = useState(0);
  const [txHasMore, setTxHasMore] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
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
          limit: TX_PAGE,
          offset: 0,
        }),
        sessionsDB.listSummariesByUserId(user.id, 50),
      ]);

      setTransactions((txData ?? []) as CreditTransaction[]);
      setTxOffset(txData.length);
      setTxHasMore(txData.length >= TX_PAGE);
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
    () => calculateStats(transactions, sessions),
    [transactions, sessions]
  );

  const trend = useMemo(() => buildUsageTrend(transactions), [transactions]);

  async function handleOpenBillingPortal(): Promise<void> {
    setIsPortalLoading(true);

    try {
      await openBillingPortal();
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Unable to open billing portal."
      );

      setIsPortalLoading(false);
    }
  }

  return (
    <PageContent className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Usage & Analytics"
        description="Track credits, sessions, and recent billing-related activity."
        actions={
          <div className="flex gap-2">
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
              onClick={() => void handleOpenBillingPortal()}
              loading={isPortalLoading}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Billing Portal
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
          value={stats.creditsUsed30d}
          description="Last 30 days"
          icon={BarChart3}
        />

        <StatCard
          title="Credits added"
          value={stats.creditsAdded30d}
          description="Purchases, refunds, renewals"
          icon={CreditCard}
        />

        <StatCard
          title="Sessions"
          value={stats.sessions30d}
          description={`Avg duration: ${stats.avgSessionMinutes} min`}
          icon={Clock}
        />
      </div>
      </>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>14-day credit activity</CardTitle>
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
              <UsageTrend data={trend} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <CardDescription>Latest interview activity</CardDescription>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No sessions yet"
                description="Start a mock interview or practice session to see activity here."
                compact
              />
            ) : (
            <div className="space-y-3">
              {sessions.slice(0, 6).map((session) => (
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
          <CardTitle>Recent credit transactions</CardTitle>
          <CardDescription>
            Usage, purchases, refunds, and subscription credit events.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No transactions yet"
              description="Credit purchases, usage, and subscription events will appear here."
              compact
            />
          ) : (
          <div className="overflow-x-auto">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
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
                {transactions.map((transaction) => {
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
                        {transaction.action ?? "—"}
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
            </table></div>

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
          </div>
          )}
        </CardContent>
      </Card>
    </PageContent>
  );
}
