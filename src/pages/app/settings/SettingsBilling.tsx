import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useCredits } from "@/hooks/useCredits";

import {
  PLANS,
  type PlanId,
  getUserSubscription,
  type Subscription,
} from "@/lib/billing/subscriptionManager";

import { LAUNCH_PLANS } from "@/lib/constants/pricing";

import {
  formatPrice,
  CREDIT_PACKS as TOPUP_PACKS,
  getCostPerCredit,
  getBestValueCreditPack,
} from "@/lib/billing/priceCalculator";

import {
  cancelSubscription as cancelSubscriptionApi,
  resumeSubscription as resumeSubscriptionApi,
  openCheckoutForPrice,
  openBillingPortal,
} from "@/lib/api/billing";
import {
  openRazorpayCheckout,
  type RazorpayProductType,
} from "@/lib/api/payments";

import { PricingCard } from "@/components/billing/PricingCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ENV } from "@/lib/env";
import { creditsDB } from "@/lib/supabase/database";
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_CONFIGURED =
  Boolean(ENV.STRIPE_PRICE_PRO_MONTHLY) ||
  Boolean(ENV.STRIPE_PRICE_STARTER_MONTHLY) ||
  Boolean(ENV.STRIPE_PRICE_ELITE_MONTHLY) ||
  Boolean(ENV.STRIPE_PRICE_ENTERPRISE_MONTHLY) ||
  Boolean(ENV.STRIPE_PRICE_CREDITS_50) ||
  Boolean(ENV.STRIPE_PRICE_CREDITS_150) ||
  Boolean(ENV.STRIPE_PRICE_CREDITS_500);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: {
    label: "Active",
    color: "text-emerald-400",
  },
  trialing: {
    label: "Trial",
    color: "text-blue-400",
  },
  past_due: {
    label: "Past Due",
    color: "text-amber-400",
  },
  canceling: {
    label: "Canceling",
    color: "text-amber-400",
  },
  canceled: {
    label: "Canceled",
    color: "text-red-400",
  },
  cancelled: {
    label: "Canceled",
    color: "text-red-400",
  },
  unpaid: {
    label: "Unpaid",
    color: "text-red-400",
  },
  incomplete: {
    label: "Incomplete",
    color: "text-amber-400",
  },
  paused: {
    label: "Paused",
    color: "text-muted-foreground",
  },
};

const PLAN_COLORS: Record<string, "violet" | "amber" | "emerald" | "blue"> = {
  free: "blue",
  starter: "blue",
  pro: "violet",
  elite: "amber",
  enterprise: "emerald",
};

function getPlanPriceId(planId: PlanId): string | undefined {
  return PLANS[planId]?.stripePriceIdMonthly;
}

function getSettingsBillingSuccessUrl(): string {
  return `${window.location.origin}/app/settings/billing?checkout=success`;
}

function getSettingsBillingCancelUrl(): string {
  return `${window.location.origin}/app/settings/billing?checkout=cancelled`;
}

function isSubscriptionCancelable(
  subscription: Subscription | null,
  planId: PlanId
): boolean {
  return Boolean(
    subscription &&
      !subscription.cancelAtPeriodEnd &&
      planId !== "free" &&
      subscription.status !== "canceled" &&
      subscription.status !== "cancelled"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsBilling(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const planId = useAuthStore((state) => state.planId);
  const refreshCredits = useAuthStore((state) => state.refreshCredits);
  const loadProfile = useAuthStore((state) => state.loadProfile);

  const credits = useCredits();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [razorpayLoading, setRazorpayLoading] = useState<string | null>(null);
  /** Sum of debit amounts this calendar month; null when unknown / N/A. */
  const [creditsUsedThisPeriod, setCreditsUsedThisPeriod] = useState<number | null>(null);

  const effectivePlanId = (planId as PlanId) || "free";
  const currentPlan = PLANS[effectivePlanId] ?? PLANS.free;

  async function reloadBillingState(): Promise<void> {
    if (!user?.id) {
      setSubscription(null);
      setLoadingSub(false);
      return;
    }

    setLoadingSub(true);
    setSubError(null);

    try {
      const sub = await getUserSubscription(user.id);
      setSubscription(sub);
      await Promise.all([refreshCredits(), loadProfile()]);
    } catch (error) {
      console.error("[SettingsBilling] Failed to load subscription:", error);
      setSubError("Could not load subscription details. Please refresh.");
    } finally {
      setLoadingSub(false);
    }
  }

  useEffect(() => {
    void reloadBillingState();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setCreditsUsedThisPeriod(null);
      return;
    }

    let cancelled = false;

    async function loadPeriodUsage(): Promise<void> {
      try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const rows = await creditsDB.listByUserId(user!.id, 200);
        const used = rows
          .filter((tx) => {
            const created = new Date(tx.created_at).getTime();
            return created >= monthStart.getTime() && (tx.amount ?? 0) < 0;
          })
          .reduce((sum, tx) => sum + Math.abs(tx.amount ?? 0), 0);

        if (!cancelled) setCreditsUsedThisPeriod(used);
      } catch {
        if (!cancelled) setCreditsUsedThisPeriod(null);
      }
    }

    void loadPeriodUsage();
    return () => {
      cancelled = true;
    };
  }, [user?.id, credits.balance]);

  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    const legacySuccess = searchParams.get("success");
    const legacyCanceled = searchParams.get("canceled");

    if (checkoutStatus === "success" || legacySuccess === "1") {
      toast.success("Payment successful! Your balance is updating now.");
      setSearchParams({}, { replace: true });
      void reloadBillingState();
      void refreshCredits();
      return;
    }

    if (checkoutStatus === "cancelled" || legacyCanceled === "1") {
      toast.info("Checkout was cancelled. No payment was taken.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const statusInfo = STATUS_LABELS[subscription?.status ?? ""] ?? null;

  const creditsRemaining = credits.balance;
  const creditsMonthly = currentPlan.creditsPerMonth;

  // Prefer ledger debits; never invent used = monthly - remaining (packs break that).
  const creditsUsed =
    creditsUsedThisPeriod !== null
      ? creditsUsedThisPeriod
      : creditsRemaining > creditsMonthly
        ? null
        : Math.max(0, creditsMonthly - creditsRemaining);

  const usagePct =
    creditsUsed !== null && creditsMonthly > 0
      ? Math.min(100, (creditsUsed / creditsMonthly) * 100)
      : 0;

  const canCancel = useMemo(
    () => isSubscriptionCancelable(subscription, effectivePlanId),
    [subscription, effectivePlanId]
  );

  const bestValuePackId = useMemo(
    () => getBestValueCreditPack().id,
    []
  );

  async function handleRazorpayCheckout(productType: RazorpayProductType): Promise<void> {
    setRazorpayLoading(productType);
    try {
      await openRazorpayCheckout({
        productType,
        promoCode: promoCode.trim() || undefined,
        userEmail: profile?.email ?? user?.email ?? undefined,
        userName: profile?.full_name ?? undefined,
        onSuccess: () => {
          toast.success("Payment received — credits will appear shortly.");
          void credits.refresh();
        },
      });
    } catch (error) {
      console.error("[SettingsBilling] Razorpay", error);
      toast.error("Checkout failed. Try again or contact support.");
    } finally {
      setRazorpayLoading(null);
    }
  }

  async function handleUpgrade(targetPlanId: string): Promise<void> {
    if (!STRIPE_CONFIGURED) {
      toast.error("Payment processing is not configured. Please contact support.");
      return;
    }

    const typedPlanId = targetPlanId as PlanId;
    const priceId = getPlanPriceId(typedPlanId);

    if (!priceId) {
      toast.error("No Stripe price is configured for this plan.");
      return;
    }

    setActionLoading(targetPlanId);

    try {
      await openCheckoutForPrice(priceId);
    } catch (error) {
      console.error("[SettingsBilling] handleUpgrade error:", error);
      toast.error("Failed to start checkout. Please try again later.");
      setActionLoading(null);
    }
  }

  async function handleBuyCredits(
    packId: string,
    stripePriceId?: string
  ): Promise<void> {
    if (!STRIPE_CONFIGURED || !stripePriceId) {
      toast.error("Credit purchase is not available yet. Please contact support.");
      return;
    }

    setActionLoading(packId);

    try {
      await openCheckoutForPrice(stripePriceId);
    } catch (error) {
      console.error("[SettingsBilling] handleBuyCredits error:", error);
      toast.error("Failed to start checkout. Please try again later.");
      setActionLoading(null);
    }
  }

  async function handleOpenBillingPortal(): Promise<void> {
    setActionLoading("portal");

    try {
      await openBillingPortal();
    } catch (error) {
      console.error("[SettingsBilling] handleOpenBillingPortal error:", error);
      toast.error("Failed to open billing portal.");
      setActionLoading(null);
    }
  }

  async function handleCancel(): Promise<void> {
    if (!subscription) {
      toast.error("No active subscription found.");
      return;
    }

    setActionLoading("cancel");

    try {
      const result = await cancelSubscriptionApi({
        subscription_id: subscription.stripeSubscriptionId,
      });

      toast.success("Subscription will cancel at the end of the billing period.");

      setSubscription((current) =>
        current
          ? {
              ...current,
              cancelAtPeriodEnd: true,
              cancelAt: result.cancel_at_iso
                ? new Date(result.cancel_at_iso)
                : current.cancelAt,
            }
          : current
      );

      await reloadBillingState();
    } catch (error) {
      console.error("[SettingsBilling] handleCancel error:", error);
      toast.error("Failed to cancel subscription. Please try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume(): Promise<void> {
    if (!subscription) {
      toast.error("No subscription found.");
      return;
    }

    setActionLoading("resume");

    try {
      await resumeSubscriptionApi({
        subscription_id: subscription.stripeSubscriptionId,
      });

      toast.success("Subscription resumed.");

      setSubscription((current) =>
        current
          ? {
              ...current,
              cancelAtPeriodEnd: false,
              cancelAt: null,
            }
          : current
      );

      await reloadBillingState();
    } catch (error) {
      console.error("[SettingsBilling] handleResume error:", error);
      toast.error("Failed to resume subscription. Please try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your plan, subscription, credits, and invoices"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Settings", href: "/app/settings" },
          { label: "Billing" },
        ]}
      />

      {!STRIPE_CONFIGURED && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />

            <div>
              <p className="text-sm font-semibold text-amber-300">
                Stripe Not Configured
              </p>

              <p className="text-xs text-muted-foreground mt-1">
                Payment processing is not set up. Set the{" "}
                <code className="text-amber-300/80">VITE_STRIPE_*</code>{" "}
                environment variables to enable upgrades and credit purchases.
              </p>
            </div>
          </div>
        </Card>
      )}

      {subError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{subError}</p>
          </div>
        </Card>
      )}

      {!loadingSub && subscription?.status === "past_due" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Payment failed</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your last payment could not be processed. Update your payment method to
                  keep your subscription active.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleOpenBillingPortal()}
              loading={actionLoading === "portal"}
              disabled={!STRIPE_CONFIGURED}
              className="shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Retry payment
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {currentPlan.name}
                </h3>

                {statusInfo && !loadingSub && (
                  <Badge variant="outline" size="sm">
                    <span className={statusInfo.color}>{statusInfo.label}</span>
                  </Badge>
                )}

                {loadingSub && <Skeleton className="h-5 w-16 rounded-full" />}
              </div>

              <p className="text-xs text-muted-foreground mt-1">
                {currentPlan.tagline}
              </p>
            </div>

            <div className="text-right">
              <p className="text-2xl font-black text-foreground">
                {currentPlan.monthlyPrice === 0
                  ? "Free"
                  : formatPrice(currentPlan.monthlyPrice, true)}
              </p>

              {currentPlan.monthlyPrice > 0 && (
                <p className="text-xs text-muted-foreground">/month</p>
              )}
            </div>
          </div>

          {!loadingSub && subscription?.cancelAtPeriodEnd && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />

              <p className="text-xs text-red-300">
                Cancels at end of period{" "}
                {subscription.currentPeriodEnd
                  ? `(${subscription.currentPeriodEnd.toLocaleDateString()})`
                  : ""}
              </p>

              <Button
                variant="secondary"
                size="xs"
                loading={actionLoading === "resume"}
                onClick={() => void handleResume()}
                className="ml-auto"
              >
                Resume
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">
                  Credits used this period
                </p>

                <p className="text-xs text-muted-foreground">
                  {creditsUsed === null ? "N/A" : creditsUsed} /{" "}
                  {creditsMonthly.toLocaleString()}
                </p>
              </div>

              <ProgressBar
                value={creditsUsed ?? 0}
                max={creditsMonthly}
                color={usagePct > 80 ? "red" : usagePct > 50 ? "amber" : "violet"}
                size="sm"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-primary">
                  {creditsRemaining} credits remaining
                </span>
              </div>

              {effectivePlanId === "free" && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleUpgrade("pro")}
                  loading={actionLoading === "pro"}
                  disabled={!STRIPE_CONFIGURED}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                  Upgrade to Pro
                </Button>
              )}

              {!loadingSub && canCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCancel()}
                  loading={actionLoading === "cancel"}
                  className="text-red-400 hover:text-red-300"
                >
                  Cancel subscription
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Account Details
              </h3>
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={() => void handleOpenBillingPortal()}
              loading={actionLoading === "portal"}
              disabled={!STRIPE_CONFIGURED}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Portal
            </Button>
          </div>

          {loadingSub ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="flex justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Email</span>
                <span className="text-foreground truncate ml-2">
                  {user?.email ?? "—"}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Customer ID</span>
                <span className="text-foreground font-mono text-[10px] truncate">
                  {profile?.stripe_customer_id ?? "Not linked"}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Plan</span>
                <span className="text-foreground">{currentPlan.name}</span>
              </div>

              {subscription?.currentPeriodEnd && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {subscription.cancelAtPeriodEnd ? "Expires" : "Renews"}
                  </span>
                  <span className="text-foreground">
                    {subscription.currentPeriodEnd.toLocaleDateString()}
                  </span>
                </div>
              )}

              {subscription &&
                !subscription.cancelAtPeriodEnd &&
                (subscription.monthlyAmountCents ??
                  PLANS[subscription.planId]?.monthlyPrice ??
                  0) > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Next invoice</span>
                    <span className="text-foreground font-medium">
                      {formatPrice(
                        subscription.monthlyAmountCents ??
                          PLANS[subscription.planId]?.monthlyPrice ??
                          0,
                        false
                      )}
                    </span>
                  </div>
                )}
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Available Plans
          </h3>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => void reloadBillingState()}
            loading={loadingSub}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {LAUNCH_PLANS.map((id) => {
            const plan = PLANS[id];
            const isCurrent = effectivePlanId === id;
            const color = PLAN_COLORS[id] ?? "violet";

            return (
              <PricingCard
                key={id}
                id={id}
                label={plan.name}
                price={
                  plan.monthlyPrice === 0
                    ? "Free"
                    : formatPrice(plan.monthlyPrice, true)
                }
                period={plan.monthlyPrice === 0 ? "" : "/mo"}
                credits={plan.creditsPerMonth}
                color={color}
                features={plan.features.slice(0, 5).map((feature) => ({
                  label: feature.label,
                  included: feature.included,
                }))}
                isCurrent={isCurrent}
                isHighlighted={plan.isPopular && !isCurrent}
                badge={plan.isPopular ? "Most Popular" : undefined}
                subtitle={plan.tagline}
                size="sm"
                onUpgrade={
                  STRIPE_CONFIGURED && !isCurrent
                    ? () => void handleUpgrade(id)
                    : undefined
                }
                ctaLabel={
                  isCurrent
                    ? "Current plan"
                    : !STRIPE_CONFIGURED
                      ? "Unavailable"
                      : undefined
                }
                loading={actionLoading === id}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Checkout (Razorpay — India)
        </h3>
        <Card className="p-4 mb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Pay in INR via Razorpay. Referral codes and admin offers apply at checkout.
            Credits auto-deduct when you use AI features.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Razorpay checkout is a one-time payment (Order) — it does not auto-renew.
            Re-purchase when credits or plan access expire. Stripe subscriptions handle recurring USD billing.
          </p>
          <input
            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Promo / referral code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={razorpayLoading === "pro_monthly"}
              onClick={() => void handleRazorpayCheckout("pro_monthly")}
            >
              Pro — one-time (Razorpay)
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={razorpayLoading === "credits_150"}
              onClick={() => void handleRazorpayCheckout("credits_150")}
            >
              150 credits (one-time)
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={razorpayLoading === "credits_500"}
              onClick={() => void handleRazorpayCheckout("credits_500")}
            >
              500 credits (one-time)
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Buy Credit Packs (Stripe)
        </h3>

        <Card className="mb-3 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4 font-medium">Pack</th>
                  <th className="py-3 px-4 font-medium text-right">Credits</th>
                  <th className="py-3 px-4 font-medium text-right">Price</th>
                  <th className="py-3 px-4 font-medium text-right">$/credit</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {TOPUP_PACKS.map((pack) => {
                  const centsPerCredit = getCostPerCredit(pack);
                  const isBestValue = pack.id === bestValuePackId;
                  return (
                    <tr
                      key={pack.id}
                      className={cn(
                        "border-b border-border/60 last:border-0",
                        isBestValue && "bg-primary/5"
                      )}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{pack.label}</span>
                          {isBestValue && (
                            <Badge variant="primary" size="sm">
                              Best value
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-foreground">
                        {pack.credits.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-foreground">
                        {formatPrice(pack.priceUsdCents)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {formatPrice(Math.round(centsPerCredit), true)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="xs"
                          loading={actionLoading === pack.id}
                          disabled={!STRIPE_CONFIGURED || !pack.stripePriceId}
                          onClick={() =>
                            void handleBuyCredits(pack.id, pack.stripePriceId)
                          }
                        >
                          Buy
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TOPUP_PACKS.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                "flex flex-col gap-2",
                pack.badge && "border-primary/30 bg-primary/5"
              )}
            >
              {pack.badge && (
                <Badge variant="primary" size="sm" className="self-start">
                  {pack.badge}
                </Badge>
              )}
              {pack.id === bestValuePackId && !pack.badge && (
                <Badge variant="primary" size="sm" className="self-start">
                  Best value
                </Badge>
              )}

              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-lg font-black text-foreground">
                    {pack.credits.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">
                    {formatPrice(pack.priceUsdCents)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatPrice(Math.round(getCostPerCredit(pack)), true)}/credit
                  </p>
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-auto"
                loading={actionLoading === pack.id}
                disabled={!STRIPE_CONFIGURED || !pack.stripePriceId}
                onClick={() =>
                  void handleBuyCredits(pack.id, pack.stripePriceId)
                }
              >
                <CreditCard className="w-3.5 h-3.5 mr-1" />
                Buy
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
