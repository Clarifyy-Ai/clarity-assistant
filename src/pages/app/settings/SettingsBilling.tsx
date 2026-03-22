import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { useCredits } from "@/hooks/useCredits";
import {
  PLANS,
  PLAN_ORDER,
  type PlanId,
  getUserSubscription,
  cancelSubscription,
  resumeSubscription,
  type Subscription,
} from "@/lib/billing/subscriptionManager";
import {
  formatPrice,
  CREDIT_PACKS as TOPUP_PACKS,
} from "@/lib/billing/priceCalculator";
import { PricingCard } from "@/components/billing/PricingCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Zap,
  CreditCard,
  Shield,
  AlertTriangle,
  XCircle,
  Crown,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const STRIPE_CONFIGURED =
  !!import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY ||
  !!import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:     { label: "Active",     color: "text-emerald-400" },
  trialing:   { label: "Trial",      color: "text-blue-400" },
  past_due:   { label: "Past Due",   color: "text-amber-400" },
  canceled:   { label: "Canceled",   color: "text-red-400" },
  unpaid:     { label: "Unpaid",     color: "text-red-400" },
  incomplete: { label: "Incomplete", color: "text-amber-400" },
  paused:     { label: "Paused",     color: "text-muted-foreground" },
};

const PLAN_COLORS: Record<string, "violet" | "amber" | "emerald" | "blue"> = {
  free: "blue",
  starter: "blue",
  pro: "violet",
  elite: "amber",
  enterprise: "emerald",
};

export default function SettingsBilling() {
  const { user, profile, planId } = useAuthStore();
  const credits = useCredits();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const effectivePlanId = (planId as PlanId) || "free";
  const currentPlan = PLANS[effectivePlanId] ?? PLANS.free;

  useEffect(() => {
    if (!user?.id) return;
    setLoadingSub(true);
    getUserSubscription(user.id)
      .then((sub) => setSubscription(sub))
      .finally(() => setLoadingSub(false));
  }, [user?.id]);

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (success === "1") {
      toast.success("Payment successful! Your plan has been activated.");
      setSearchParams({}, { replace: true });
      if (user?.id) {
        getUserSubscription(user.id).then((sub) => setSubscription(sub));
      }
    } else if (canceled === "1") {
      toast.info("Checkout was cancelled. No payment was taken.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpgrade(targetPlanId: string) {
    if (!STRIPE_CONFIGURED) {
      toast.error("Stripe is not configured. Contact support to upgrade.");
      return;
    }
    const plan = PLANS[targetPlanId as PlanId];
    if (!plan?.stripePriceIdMonthly) {
      toast.error("No Stripe price configured for this plan.");
      return;
    }
    setActionLoading(targetPlanId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id:    plan.stripePriceIdMonthly,
          success_url: `${window.location.origin}/app/settings/billing?success=1`,
          cancel_url:  `${window.location.origin}/app/settings/billing?canceled=1`,
          mode:        "subscription",
          plan_id:     targetPlanId,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not create checkout session.");
      }
    } catch {
      toast.error("Failed to start checkout. The checkout service may not be deployed yet.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    if (!subscription?.stripeSubscriptionId) {
      toast.error("No active subscription to cancel.");
      return;
    }
    setActionLoading("cancel");
    try {
      await cancelSubscription(subscription.stripeSubscriptionId);
      toast.success("Subscription will cancel at end of billing period.");
      setSubscription((s) => s ? { ...s, cancelAtPeriodEnd: true } : s);
    } catch {
      toast.error("Failed to cancel subscription. Try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume() {
    if (!subscription?.stripeSubscriptionId) return;
    setActionLoading("resume");
    try {
      await resumeSubscription(subscription.stripeSubscriptionId);
      toast.success("Subscription resumed!");
      setSubscription((s) => s ? { ...s, cancelAtPeriodEnd: false } : s);
    } catch {
      toast.error("Failed to resume subscription. Try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBuyCredits(packId: string, stripePriceId?: string, creditCount?: number) {
    if (!STRIPE_CONFIGURED && !stripePriceId) {
      toast.error("Stripe is not configured. Contact support to buy credits.");
      return;
    }
    setActionLoading(packId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id:    stripePriceId,
          success_url: `${window.location.origin}/app/settings/credits?success=1`,
          cancel_url:  `${window.location.origin}/app/settings/billing?canceled=1`,
          mode:        "payment",
          credits:     creditCount,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not create checkout session.");
      }
    } catch {
      toast.error("Failed to start checkout. The checkout service may not be deployed yet.");
    } finally {
      setActionLoading(null);
    }
  }

  const statusInfo = STATUS_LABELS[subscription?.status ?? ""] ?? null;
  const creditsRemaining = credits.balance;
  const creditsMonthly = currentPlan.creditsPerMonth === -1 ? 999 : currentPlan.creditsPerMonth;
  const creditsUsed = Math.max(0, creditsMonthly - creditsRemaining);
  const usagePct = creditsMonthly > 0 ? Math.min(100, (creditsUsed / creditsMonthly) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your plan, subscription, and credits"
      />

      {!STRIPE_CONFIGURED && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Stripe Not Configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Payment processing is not set up yet. Set the VITE_STRIPE_* environment
                variables and deploy the create-checkout edge function to enable upgrades
                and credit purchases.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-gradient-to-br from-violet-600/10 to-blue-600/10 border-violet-500/20">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Current Plan</p>
              <div className="flex items-center gap-2 mt-1">
                <Crown className="w-5 h-5 text-violet-400" />
                <p className="text-2xl font-black text-foreground">{currentPlan.name}</p>
                {statusInfo && (
                  <Badge variant="default" size="sm">
                    <span className={statusInfo.color}>{statusInfo.label}</span>
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{currentPlan.tagline}</p>
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

          {subscription?.cancelAtPeriodEnd && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">
                Cancels at end of period ({subscription.currentPeriodEnd.toLocaleDateString()})
              </p>
              <Button
                variant="secondary"
                size="xs"
                loading={actionLoading === "resume"}
                onClick={handleResume}
                className="ml-auto"
              >
                Resume
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Credits used this period</p>
                <p className="text-xs text-muted-foreground">
                  {creditsUsed} / {currentPlan.creditsPerMonth === -1 ? "∞" : creditsMonthly}
                </p>
              </div>
              <ProgressBar
                value={creditsUsed}
                max={creditsMonthly}
                color={usagePct > 80 ? "red" : usagePct > 50 ? "amber" : "violet"}
                size="sm"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-bold text-violet-400">
                  {creditsRemaining} credits remaining
                </span>
              </div>
              {effectivePlanId === "free" && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleUpgrade("starter")}
                  loading={actionLoading === "starter"}
                  disabled={!STRIPE_CONFIGURED}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                  Upgrade
                </Button>
              )}
              {subscription && !subscription.cancelAtPeriodEnd && effectivePlanId !== "free" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
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
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Account Details</h3>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground truncate ml-2">{user?.email ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer ID</span>
              <span className="text-foreground font-mono text-[10px]">
                {profile?.stripe_customer_id ?? "Not linked"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="text-foreground">{currentPlan.name}</span>
            </div>
            {subscription?.currentPeriodEnd && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renews</span>
                <span className="text-foreground">
                  {subscription.currentPeriodEnd.toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {PLAN_ORDER.filter((id) => id !== "enterprise").map((id) => {
            const plan = PLANS[id];
            const isCurrent = effectivePlanId === id;
            const color = PLAN_COLORS[id] ?? "violet";

            return (
              <PricingCard
                key={id}
                id={id}
                label={plan.name}
                price={plan.monthlyPrice === 0 ? "Free" : formatPrice(plan.monthlyPrice, true)}
                period={plan.monthlyPrice === 0 ? "" : "/mo"}
                credits={plan.creditsPerMonth === -1 ? undefined : plan.creditsPerMonth}
                color={color}
                features={plan.features.slice(0, 5).map((f) => ({
                  label: f.label,
                  included: f.included,
                }))}
                isCurrent={isCurrent}
                isHighlighted={plan.isPopular && !isCurrent}
                badge={plan.isPopular ? "Most Popular" : undefined}
                subtitle={plan.tagline}
                size="sm"
                onUpgrade={STRIPE_CONFIGURED ? () => handleUpgrade(id) : undefined}
                ctaLabel={
                  isCurrent
                    ? undefined
                    : !STRIPE_CONFIGURED
                    ? "Stripe not configured"
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Buy Credit Packs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TOPUP_PACKS.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                "flex flex-col gap-2",
                pack.badge && "border-violet-500/30 bg-violet-600/5"
              )}
            >
              {pack.badge && (
                <Badge variant="violet" size="sm" className="self-start">
                  {pack.badge}
                </Badge>
              )}
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-lg font-black text-foreground">
                    {pack.credits}
                  </p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {formatPrice(pack.priceUsdCents)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-auto"
                loading={actionLoading === pack.id}
                disabled={!STRIPE_CONFIGURED || !pack.stripePriceId}
                onClick={() => handleBuyCredits(pack.id, pack.stripePriceId, pack.credits)}
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
