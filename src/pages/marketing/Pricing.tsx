import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANS, type PlanId } from "@/lib/billing/subscriptionManager";
import { Check, X, ArrowRight, Zap } from "lucide-react";
import { ComplianceBanner } from "@/components/marketing";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { cn } from "@/lib/utils";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";

import { LAUNCH_PLANS } from "@/lib/constants/pricing";
import {
  billingReturnPathForPlan,
  isPaidSignupPlan,
} from "@/lib/billing/pendingPlan";

const DISPLAY_PLANS: PlanId[] = LAUNCH_PLANS;

const PLAN_COLORS: Record<string, string> = {
  slate: "from-gray-500 to-gray-600",
  blue: "from-blue-500 to-blue-600",
  violet: "from-primary to-purple-600",
  amber: "from-amber-500 to-orange-500",
  emerald: "from-emerald-500 to-teal-500",
};

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

function paidPlanHref(planId: PlanId): string {
  if (!isPaidSignupPlan(planId)) return "/signup";
  const returnTo = encodeURIComponent(billingReturnPathForPlan(planId));
  return `/login?plan=${planId}&returnTo=${returnTo}`;
}

export default function Pricing() {
  usePageMeta({
    title: "Pricing — Clarify AI",
    description: "Simple, transparent pricing for interview prep and rehearsal. Start free, upgrade when ready.",
    canonical: `${SITE_URL}/pricing`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Clarify AI",
      description: "AI-powered interview preparation platform with live practice coaching, mock interviews, and a prep lab.",
      brand: { "@type": "Brand", name: "Clarify AI" },
      offers: DISPLAY_PLANS.map((planId) => {
        const plan = PLANS[planId];
        return {
          "@type": "Offer",
          name: plan.name,
          price: planId === "free" ? "0" : (plan.monthlyPrice / 100).toFixed(2),
          priceCurrency: "USD",
          url: `${SITE_URL}${planId === "free" ? "/signup" : paidPlanHref(planId)}`,
        };
      }),
    },
  });
  const [annual, setAnnual] = useState(false);

  return (
    <MarketingLayout>
      <LazyMotion features={domAnimation} strict>
      <section className="pt-4 sm:pt-12 pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <m.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-lg mx-auto">
              Start free. Upgrade when you're ready. Cancel anytime.
            </p>
          </m.div>

          <div className="mt-8 inline-flex items-center gap-1 p-1 rounded-xl bg-secondary/60 border border-border">
            <button
              onClick={() => setAnnual(false)}
              aria-pressed={!annual}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                !annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Annual <span className="text-primary text-xs ml-1">Save 20%</span>
            </button>
          </div>
        </div>
      </section>

      <section className="pb-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <ComplianceBanner />
        </div>
      </section>

      <section className="pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {DISPLAY_PLANS.map((planId, i) => {
            const plan = PLANS[planId];
            const monthlyPrice = plan.monthlyPrice;
            const effectiveMonthly = annual
              ? Math.round(plan.yearlyPrice)
              : monthlyPrice;
            const priceDisplay =
              effectiveMonthly === 0
                ? "Free"
                : `$${(effectiveMonthly / 100).toFixed(0)}`;
            const isMax = planId === "enterprise";
            const ctaHref = planId === "free" ? "/signup" : paidPlanHref(planId);

            return (
              <m.div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6",
                  plan.isPopular
                    ? "border-primary/40 bg-primary/[0.04]"
                    : "border-border bg-card"
                )}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
              >
                {plan.isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
                    Most Popular
                  </span>
                )}

                <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4", PLAN_COLORS[plan.color] ?? PLAN_COLORS.slate)}>
                  <Zap className="w-5 h-5 text-white" />
                </div>

                <h3 className="text-base font-bold">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>

                <div className="mt-5 min-h-[4.5rem]">
                  <span className="text-3xl font-extrabold">{priceDisplay}</span>
                  {effectiveMonthly > 0 && (
                    <span className="text-sm text-muted-foreground ml-1">/mo</span>
                  )}
                  {annual && effectiveMonthly > 0 ? (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">billed annually</p>
                  ) : (
                    <p className="text-[11px] text-transparent mt-0.5 select-none" aria-hidden>
                      billed annually
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  {plan.creditsPerMonth.toLocaleString()} credits/mo
                </p>

                <Link
                  to={ctaHref}
                  className={cn(
                    "mt-5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    plan.isPopular
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  )}
                >
                  {planId === "free" ? "Start Free" : isMax ? "Get Max" : "Get Started"}{" "}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <div className="mt-6 pt-5 border-t border-border space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f.key} className="flex items-start gap-2 text-xs">
                      {f.included ? (
                        <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                      )}
                      <span className={f.included ? "text-muted-foreground" : "text-muted-foreground/40"}>
                        {f.label}
                        {f.included && f.limit && f.limit !== "unlimited" && (
                          <span className="text-muted-foreground/60 ml-1">({f.note ?? f.limit})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </m.div>
            );
          })}
        </div>
      </section>
      </LazyMotion>
    </MarketingLayout>
  );
}
