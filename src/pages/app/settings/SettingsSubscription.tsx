// @ts-nocheck
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  CreditCard, CheckCircle, Zap,
  Star, Shield, ChevronRight,
  Crown, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// SettingsSubscription
// ─────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id:       "free",
    label:    "Free",
    price:    0,
    billing:  "",
    features: [
      "5 mock sessions / month",
      "Basic AI feedback",
      "Question bank access",
      "STAR builder",
    ],
    color: "default",
  },
  {
    id:       "pro",
    label:    "Pro",
    price:    19,
    billing:  "/month",
    popular:  true,
    features: [
      "Unlimited mock sessions",
      "Advanced AI feedback",
      "Live co-pilot with hints",
      "Company research briefs",
      "Analytics & score trends",
      "AI Tools (cover letter, etc.)",
      "PDF export",
      "Priority support",
    ],
    color: "violet",
  },
  {
    id:       "team",
    label:    "Team",
    price:    49,
    billing:  "/month",
    features: [
      "Everything in Pro",
      "5 team seats",
      "Shared answer bank",
      "Team analytics",
      "Admin dashboard",
      "Custom branding",
    ],
    color: "amber",
  },
];

export default function SettingsSubscription() {
  const { profile } = useAuthStore();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const currentPlan = profile?.plan ?? "free";
  const renewDate   = profile?.subscription_renews_at;

  function getPrice(base: number) {
    if (base === 0) return 0;
    return billing === "annual" ? Math.floor(base * 0.75) : base;
  }

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
              {b}
              {b === "annual" && (
                <span className="ml-1 text-emerald-400">-25%</span>
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

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const price     = getPrice(plan.price);
          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col relative",
                plan.popular && "border-violet-500/40 bg-violet-600/5",
                isCurrent && "ring-1 ring-violet-500/30"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="violet" size="sm">Most popular</Badge>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm font-bold text-foreground">{plan.label}</p>
                <div className="flex items-baseline gap-0.5 mt-1">
                  <span className="text-3xl font-black text-foreground">
                    ${price}
                  </span>
                  <span className="text-xs text-muted-foreground">{plan.billing}</span>
                </div>
                {billing === "annual" && price > 0 && (
                  <p className="text-[10px] text-emerald-400 mt-0.5">
                    Save ${(plan.price - price) * 12}/year
                  </p>
                )}
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant={isCurrent ? "ghost" : plan.popular ? "primary" : "secondary"}
                size="sm"
                fullWidth
                className="mt-4"
                disabled={isCurrent}
              >
                {isCurrent ? "Current plan" :
                 currentPlan === "free" ? `Upgrade to ${plan.label}` :
                 plan.id === "free" ? "Downgrade" : `Switch to ${plan.label}`}
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
