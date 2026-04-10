import { ENV } from "@/lib/env";
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
import { PricingCard }  from "@/components/billing/PricingCard";
import { Card }         from "@/components/ui/Card";
import { Button }       from "@/components/ui/Button";
import { Badge }        from "@/components/ui/Badge";
import { ProgressBar }  from "@/components/ui/ProgressBar";
import { PageHeader }   from "@/components/layout/PageHeader";
import { Skeleton }     from "@/components/ui/Skeleton";
import {
  Zap,
  CreditCard,
  Shield,
  AlertTriangle,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import { toast }       from "sonner";
import { supabase }    from "@/lib/supabase/client";
import { cn }          from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

// Stripe is considered configured if at least one price env var is set.
// Price IDs are sourced exclusively from env vars — never hardcoded here.
const STRIPE_CONFIGURED =
  !!ENV.STRIPE_PRICE_PRO_MONTHLY ||
  !!ENV.STRIPE_PRICE_STARTER_MONTHLY;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:     { label: "Active",     color: "text-emerald-400" },
  trialing:   { label: "Trial",      color: "text-blue-400"    },
  past_due:   { label: "Past Due",   color: "text-amber-400"   },
  canceling:  { label: "Canceling",  color: "text-amber-400"   },
  canceled:   { label: "Canceled",   color: "text-red-400"     },
  unpaid:     { label: "Unpaid",     color: "text-red-400"     },
  incomplete: { label: "Incomplete", color: "text-amber-400"   },
  paused:     { label: "Paused",     color: "text-muted-foreground" },
};

const PLAN_COLORS: Record<string, "violet" | "amber" | "emerald" | "blue"> = {
  free:       "blue",
  starter:    "blue",
  pro:        "violet",
  elite:      "amber",
  enterprise: "emerald",
};

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function SettingsBilling() {
  const { user, profile, planId } = useAuthStore();
  const credits = useCredits();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subscription, setSubscription]   = useState<Subscription | null>(null);
  const [loadingSub, setLoadingSub]       = useState(true);
  const [subError, setSubError]           = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const effectivePlanId = (planId as PlanId) || "free";
  const currentPlan     = PLANS[effectivePlanId] ?? PLANS.free;

  // Load subscription on mount
  useEffect(() => {
    if (!user?.id) return;
    setLoadingSub(true);
    setSubError(null);
    getUserSubscription(user.id)
      .then((sub) => setSubscription(sub))
      .catch((err) => {
        console.error("[SettingsBilling] Failed to load subscription:", err);
        setSubError("Could not load subscription details. Please refresh.");
      })
      .finally(() => setLoadingSub(false));
  }, [user?.id]);

  // Handle Stripe redirect callbacks (?success=1 / ?canceled=1)
  useEffect(() => {
    const success  = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success === "1") {
      toast.success("Payment successful! Your plan has been activated.");
      setSearchParams({}, { replace: true });
      if (user?.id) {
        setLoadingSub(true);
        getUserSubscription(user.id)
          .then((sub) => setSubscription(sub))
          .finally(() => setLoadingSub(false));
      }
    } else if (canceled === "1") {
      toast.info("Checkout was cancelled. No payment was taken.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────

  async function handleUpgrade(targetPlanId: string) {
    if (!STRIPE_CONFIGURED) {
      toast.error("Payment processing is not configured. Please contact support.");
      return;
    }

    const plan = PLANS[targetPlanId as PlanId];
    if (!plan?.stripePriceIdMonthly) {
      toast.error("No price configured for this plan. Please contact support.");
      return;
    }

    setActionLoading(targetPlanId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id:    plan.stripePriceIdMonthly,
          success_url: `${window.location.origin}/app/settings/billing?success=1`,
          cancel_url:  `${window.location.origin}/app/settings/billing?canceled=1`,
        },
      });

      if (error) throw new Error(error.message ?? "Checkout invocation failed");

      if (data?.url) {
        window.location.href = data.url as string;
      } else if (data?.error) {
        const msg = data.error as string;
        if (msg.includes("not configured") || msg.includes("STRIPE_SECRET_KEY")) {
          toast.error("Stripe is not configured on the server. Contact support.");
        } else {
          toast.error(msg);
        }
      } else {
        toast.error("Could not create checkout session. Please try again.");
      }
    } catch (err) {
      console.error("[SettingsBilling] handleUpgrade error:", err);
      toast.error("Failed to start checkout. Please try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    if (!subscription) {
      toast.error("No active subscription found.");
      return;
    }
    setActionLoading("cancel");
    try {
      await cancelSubscription();
      toast.success("Subscription will cancel at the end of the billing period.");
      setSubscription((s) => (s ? { ...s, cancelAtPeriodEnd: true } : s));
    } catch (err) {
      console.error("[SettingsBilling] handleCancel error:", err);
      toast.error("Failed to cancel subscription. Please try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume() {
    if (!subscription) return;
    setActionLoading("resume");
    try {
      await resumeSubscription();
      toast.success("Subscription resumed!");
      setSubscription((s) => (s ? { ...s, cancelAtPeriodEnd: false } : s));
    } catch (err) {
      console.error("[SettingsBilling] handleResume error:", err);
      toast.error("Failed to resume subscription. Please try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBuyCredits(packId: string, stripePriceId?: string) {
    if (!STRIPE_CONFIGURED || !stripePriceId) {
      toast.error("Credit purchase is not available yet. Please contact support.");
      return;
    }

    setActionLoading(packId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id:    stripePriceId,
          success_url: `${window.location.origin}/app/settings/billing?success=1`,
          cancel_url:  `${window.location.origin}/app/settings/billing?canceled=1`,
        },
      });

      if (error) throw new Error(error.message ?? "Checkout invocation failed");

      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        toast.error("Could not create checkout session. Please try again.");
      }
    } catch (err) {
      console.error("[SettingsBilling] handleBuyCredits error:", err);
      toast.error("Failed to start checkout. Please try again later.");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Derived values ─────────────────────────────────────────────

  const statusInfo       = STATUS_LABELS[subscription?.status ?? ""] ?? null;
  const creditsRemaining = credits.balance;
  const creditsMonthly   = currentPlan.creditsPerMonth === -1 ? 999 : currentPlan.creditsPerMonth;
  const creditsUsed      = Math.max(0, creditsMonthly - creditsRemaining);
  const usagePct         = creditsMonthly > 0
    ? Math.min(100, (creditsUsed / creditsMonthly) * 100)
    : 0;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your plan, subscription, and credits"
      />

      {/* Stripe not configured warning */}
      {!STRIPE_CONFIGURED && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Stripe Not Configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Payment processing is not set up. Set the{" "}
                <code className="text-amber-300/80">VITE_STRIPE_*</code> environment
                variables to enable upgrades and credit purchases.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Subscription fetch error */}
      {subError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{subError}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current plan card */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{currentPlan.name}</h3>
                {statusInfo && !loadingSub && (
                  <Badge variant="outline" size="sm">
                    <span className={statusInfo.color}>{statusInfo.label}</span>
                  </Badge>
                )}
                {loadingSub && (
                  <Skeleton className="h-5 w-16 rounded-full" />
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

          {/* Scheduled cancellation notice */}
          {!loadingSub && subscription?.cancelAtPeriodEnd && (
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
              {!loadingSub &&
                subscription &&
                !subscription.cancelAtPeriodEnd &&
                effectivePlanId !== "free" && (
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

        {/* Account details card */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Account Details</h3>
          </div>

          {loadingSub ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          ) : (
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next invoice</span>
                    <span className="text-foreground font-medium">
                      {formatPrice(
                        subscription.monthlyAmountCents ??
                          PLANS[subscription.planId]!.monthlyPrice,
                        false,
                      )}
                    </span>
                  </div>
                )}
            </div>
          )}
        </Card>
      </div>

      {/* Available plans */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {PLAN_ORDER.filter((id) => id !== "enterprise").map((id) => {
            const plan      = PLANS[id];
            const isCurrent = effectivePlanId === id;
            const color     = PLAN_COLORS[id] ?? "violet";

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
                  label:    f.label,
                  included: f.included,
                }))}
                isCurrent={isCurrent}
                isHighlighted={plan.isPopular && !isCurrent}
                badge={plan.isPopular ? "Most Popular" : undefined}
                subtitle={plan.tagline}
                size="sm"
                onUpgrade={STRIPE_CONFIGURED && !isCurrent ? () => handleUpgrade(id) : undefined}
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

      {/* Credit packs */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Buy Credit Packs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TOPUP_PACKS.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                "flex flex-col gap-2",
                pack.badge && "border-violet-500/30 bg-violet-600/5",
              )}
            >
              {pack.badge && (
                <Badge variant="violet" size="sm" className="self-start">
                  {pack.badge}
                </Badge>
              )}
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-lg font-black text-foreground">{pack.credits}</p>
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
                onClick={() => handleBuyCredits(pack.id, pack.stripePriceId)}
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
