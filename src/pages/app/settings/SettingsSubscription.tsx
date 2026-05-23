// @ts-nocheck
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PLANS, type PlanId } from "@/lib/billing/subscriptionManager";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  CheckCircle, Zap,
  Shield, ChevronRight,
  Crown, AlertTriangle, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Link } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────
// SettingsSubscription — uses the same PLANS from subscriptionManager
// ─────────────────────────────────────────────────────────────────

const DISPLAY_PLANS: PlanId[] = ["free", "pro", "enterprise"];

const PLAN_COLORS: Record<string, string> = {
  slate: "from-gray-500 to-gray-600",
  blue: "from-blue-500 to-blue-600",
  violet: "from-violet-500 to-purple-600",
  amber: "from-amber-500 to-orange-500",
};

export default function SettingsSubscription() {
  usePageMeta({ title: "Subscription | Clarify AI" });

  const { profile } = useAuthStore();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const currentPlan = profile?.plan_id ?? "free";
  const renewDate   = profile?.subscription_renews_at;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Subscription</h2>

        {/* Billing toggle */}
        <div className="flex items-center gap-2 bg-accent/5 border border-border rounded-xl p-1">
          {(["monthly", "annual"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                billing === b
                  ? "bg-violet-600/30 text-violet-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {b === "monthly" ? "Monthly" : "Annual"}
              {b === "annual" && (
                <span className="ml-1 text-emerald-400">-20%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Current plan status */}
      {currentPlan !== "free" && (
        <Card className="flex items-center gap-4 border-violet-500/20 bg-violet-500/5">
          <Crown className="w-5 h-5 text-violet-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground capitalize">
              {currentPlan} plan active
            </p>
            {renewDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Renews {format(new Date(renewDate), "MMMM d, yyyy")}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm">
            Manage billing
          </Button>
        </Card>
      )}

      {/* Plan cards — sourced from the single PLANS catalogue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DISPLAY_PLANS.map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = planId === currentPlan;
          const price = billing === "annual" ? plan.yearlyPrice : plan.monthlyPrice;
          const priceDisplay = price === 0 ? "Free" : `$${(price / 100).toFixed(0)}`;

          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col relative",
                plan.isPopular && "border-primary/40 bg-primary/[0.04]",
                isCurrent && "ring-1 ring-primary/30"
              )}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="violet" size="sm">Most popular</Badge>
                </div>
              )}

              <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4", PLAN_COLORS[plan.color] ?? PLAN_COLORS.slate)}>
                <Zap className="w-5 h-5 text-white" />
              </div>

              <div className="mb-4">
                <p className="text-sm font-bold text-foreground">{plan.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.tagline}</p>
                <div className="flex items-baseline gap-0.5 mt-2">
                  <span className="text-3xl font-black text-foreground">
                    {priceDisplay}
                  </span>
                  {price > 0 && <span className="text-xs text-muted-foreground">/mo</span>}
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {plan.creditsPerMonth === -1 ? "Unlimited credits" : `${plan.creditsPerMonth} credits/mo`}
                </p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.slice(0, 6).map((f) => (
                  <li key={f.key} className="flex items-start gap-2 text-xs">
                    {f.included ? (
                      <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
                    )}
                    <span className={f.included ? "text-muted-foreground" : "text-muted-foreground/40"}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant={isCurrent ? "ghost" : plan.isPopular ? "primary" : "secondary"}
                size="sm"
                fullWidth
                className="mt-4"
                disabled={isCurrent}
              >
                {isCurrent ? "Current plan" :
                 currentPlan === "free" ? `Upgrade to ${plan.name}` :
                 planId === "free" ? "Downgrade" : `Switch to ${plan.name}`}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Cancellation note */}
      {currentPlan !== "free" && (
        <Card className="flex items-start gap-3 border-red-500/15 bg-red-500/3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-300">Cancel anytime</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              You can cancel your subscription at any time. Access continues until
              the end of your billing period.
            </p>
            <button className="text-xs text-red-400 hover:text-red-300 mt-2 underline">
              Cancel subscription
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
