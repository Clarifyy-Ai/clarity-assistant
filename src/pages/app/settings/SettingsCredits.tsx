import { ENV } from "@/lib/env";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { useCredits } from "@/hooks/useCredits";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { Zap, TrendingDown, Info, History, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { createCheckoutSession } from "@/lib/api/billing";
import { toast } from "sonner";
import { CREDIT_PACKS, formatPrice } from "@/lib/billing/priceCalculator";
import { PLANS, type PlanId } from "@/lib/billing/subscriptionManager";
import { SERVER_AI_CREDIT_COSTS } from "@/lib/billing/creditsManager";
import { creditsDB } from "@/lib/supabase/database";
import type { Tables } from "@/integrations/supabase";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";

const STRIPE_CONFIGURED =
  !!ENV.STRIPE_PRICE_PRO_MONTHLY ||
  !!ENV.STRIPE_PRICE_STARTER_MONTHLY ||
  !!ENV.STRIPE_PRICE_CREDITS_50;

type CreditTransactionRow = Pick<
  Tables<"credit_transactions">,
  "id" | "action" | "amount" | "balance_after" | "description" | "created_at"
>;

const CREDIT_COSTS = [
  { action: "Quick hints (overlay)", cost: SERVER_AI_CREDIT_COSTS.hint,   icon: "💡" },
  { action: "Full answer (overlay)", cost: SERVER_AI_CREDIT_COSTS.fullAnswer, icon: "✨" },
  { action: "Screen capture answer", cost: SERVER_AI_CREDIT_COSTS.screenshotAnswer, icon: "📸" },
  { action: "Mock session",       cost: 5,   icon: "🎤" },
  { action: "Practice Coach",      cost: 3,   icon: "🚀" },
  { action: "Prep tool",          cost: 3,   icon: "🔧" },
  { action: "STAR polish",        cost: 2,   icon: "⭐" },
  { action: "Company brief",      cost: 8,   icon: "🏢" },
  { action: "Debrief generation", cost: 10,  icon: "🧠" },
  { action: "Cover letter",       cost: 5,   icon: "✉️" },
];

function formatTxDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadTransactionsCsv(rows: CreditTransactionRow[]) {
  const header = "Date,Action,Description,Amount,Balance\n";
  const body = rows
    .map((tx) => {
      const amount = tx.amount ?? 0;
      return [
        escapeCsvCell(formatTxDate(tx.created_at)),
        escapeCsvCell(tx.action ?? ""),
        escapeCsvCell(tx.description ?? ""),
        String(amount),
        String(tx.balance_after ?? ""),
      ].join(",");
    })
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clarify-credits-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsCredits() {
  const { profile, user, refreshCredits } = useAuthStore();
  const credits      = useCredits();
  const [buying, setBuying] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<CreditTransactionRow[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [csvExporting, setCsvExporting] = useState(false);

  const isLoading = !profile;

  const loadTransactions = useCallback(async () => {
    if (!user?.id) {
      setTransactions([]);
      setTxLoading(false);
      return;
    }
    setTxLoading(true);
    try {
      const rows = await creditsDB.listByUserIdWithBalancePage(user.id, {
        limit: 25,
        offset: 0,
      });
      setTransactions(rows as CreditTransactionRow[]);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const success  = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (success === "1") {
      toast.success("Credits added! Your balance has been refreshed.");
      setSearchParams({}, { replace: true });
      void refreshCredits();
      void loadTransactions();
    } else if (canceled === "1") {
      toast.info("Checkout was cancelled. No payment was taken.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshCredits, loadTransactions]);

  const effectivePlanId = ((profile as { plan_id?: string } | null)?.plan_id ?? "free") as PlanId;
  const planCredits = PLANS[effectivePlanId]?.creditsPerMonth ?? PLANS.free.creditsPerMonth;
  const monthly   = planCredits === -1 ? 999 : planCredits;
  const remaining = credits.balance ?? 0;
  const used      = Math.max(0, monthly - remaining);
  const usedPct   = monthly > 0 ? Math.min(100, (used / monthly) * 100) : 0;

  async function handleBuy(packId: string) {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) return;

    if (!pack.stripePriceId) {
      toast.error("No Stripe price configured for this credit pack.");
      return;
    }

    setBuying(packId);
    try {
      const data = await createCheckoutSession({
        price_id: pack.stripePriceId!,
        success_url: `${window.location.origin}/app/settings/credits?success=1`,
        cancel_url: `${window.location.origin}/app/settings/credits?canceled=1`,
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not create checkout session.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("not configured") || msg.includes("STRIPE_SECRET_KEY")
          ? "Stripe is not configured on the server. Contact support to buy credits."
          : "Failed to start checkout. The checkout service may not be deployed yet."
      );
    } finally {
      setBuying(null);
    }
  }

  async function handleDownloadCsv() {
    if (!user?.id) return;
    setCsvExporting(true);
    try {
      const rows = await creditsDB.listByUserIdWithBalancePage(user.id, {
        limit: 500,
        offset: 0,
      });
      if (rows.length === 0) {
        toast.info("No transactions to export yet.");
        return;
      }
      downloadTransactionsCsv(rows as CreditTransactionRow[]);
      toast.success("Credit history downloaded as CSV.");
    } catch {
      toast.error("Could not export transaction history.");
    } finally {
      setCsvExporting(false);
    }
  }

  return (
    <SettingsPageShell title="Credits">

      {isLoading ? (
        <div className="space-y-5">
          <Card>
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2 w-full mt-4" />
            </div>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <div className="space-y-3">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
      <>

      <Card className="bg-gradient-to-r from-primary/10 to-blue-600/10 border-primary/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              Available credits
            </p>
            <p className="text-4xl font-black text-primary mt-1">
              {remaining.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {used} of {monthly} monthly credits used
            </p>
          </div>
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
        </div>
        <ProgressBar
          value={used}
          max={monthly}
          color={usedPct > 80 ? "red" : usedPct > 50 ? "amber" : "violet"}
          size="sm"
          className="mt-4"
        />
        {credits.isLow && (
          <div className="flex items-center gap-2 mt-3">
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs text-amber-300">
              Running low — consider topping up
            </p>
          </div>
        )}
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Buy credit packs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CREDIT_PACKS.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                "flex flex-col gap-3 relative",
                pack.badge === "Most Popular" && "border-primary/40 bg-primary/5"
              )}
            >
              {pack.badge && (
                <div className="absolute -top-2 right-3">
                  <Badge variant="primary" size="sm">{pack.badge}</Badge>
                </div>
              )}
              <div>
                <p className="text-xl font-black text-foreground">
                  {pack.credits.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-foreground">
                  {formatPrice(pack.priceUsdCents)}
                </p>
                <Button
                  variant="secondary"
                  size="xs"
                  loading={buying === pack.id}
                  disabled={!STRIPE_CONFIGURED || !pack.stripePriceId}
                  onClick={() => handleBuy(pack.id)}
                >
                  Buy
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Transaction log</h3>
          </div>
          <Button
            variant="secondary"
            size="xs"
            loading={csvExporting}
            disabled={txLoading || !user?.id}
            onClick={() => void handleDownloadCsv()}
            leftIcon={<Download className="w-3 h-3" />}
          >
            Download CSV
          </Button>
        </div>
        {txLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No credit transactions yet. Usage and purchases will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const amount = tx.amount ?? 0;
                  const isPositive = amount >= 0;
                  return (
                    <tr key={tx.id} className="border-b border-border/60">
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {formatTxDate(tx.created_at)}
                      </td>
                      <td className="py-2.5 pr-3">{tx.action ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground max-w-[180px] truncate">
                        {tx.description ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pr-3 text-right font-medium",
                          isPositive ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {isPositive ? "+" : ""}{amount}
                      </td>
                      <td className="py-2.5 text-right">{tx.balance_after ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Credit costs</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CREDIT_COSTS.map((c) => (
            <div
              key={c.action}
              className="flex items-center justify-between p-2 bg-secondary rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{c.icon}</span>
                <span className="text-xs text-muted-foreground">{c.action}</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-primary" />
                <span className="text-xs font-bold text-primary">{c.cost}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      </>
      )}
    </SettingsPageShell>
  );
}
