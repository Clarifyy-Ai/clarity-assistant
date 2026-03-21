import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/billing/subscriptionManager";
import { Check, X, ArrowRight, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CREDIT_PACKS = [
  { credits: 50, price: 499, label: "50 credits" },
  { credits: 150, price: 1199, label: "150 credits" },
  { credits: 500, price: 2999, label: "500 credits" },
];

const DISPLAY_PLANS: PlanId[] = ["free", "starter", "pro", "elite"];

const PLAN_COLORS: Record<string, string> = {
  slate: "from-gray-500 to-gray-600",
  blue: "from-blue-500 to-blue-600",
  violet: "from-violet-500 to-purple-600",
  amber: "from-amber-500 to-orange-500",
  emerald: "from-emerald-500 to-teal-500",
};

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-[#07070d] text-white overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#07070d]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-8 w-auto" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <Link to="/pricing" className="text-white">Pricing</Link>
            <Link to="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link to="/help" className="hover:text-white transition-colors">Help</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline-block">Log in</Link>
            <Link to="/signup" className="text-sm font-semibold px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Get started free</Link>
          </div>
        </div>
      </nav>

      <section className="pt-36 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 text-lg text-gray-400 max-w-lg mx-auto">
              Start free. Upgrade when you're ready. Cancel anytime.
            </p>
          </motion.div>

          <div className="mt-8 inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/[0.06]">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                !annual ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                annual ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
              )}
            >
              Annual <span className="text-primary text-xs ml-1">Save 20%</span>
            </button>
          </div>
        </div>
      </section>

      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {DISPLAY_PLANS.map((planId, i) => {
            const plan = PLANS[planId];
            const price = annual ? plan.yearlyPrice : plan.monthlyPrice;
            const priceDisplay = price === 0 ? "Free" : `$${(price / 100).toFixed(0)}`;

            return (
              <motion.div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6",
                  plan.isPopular
                    ? "border-primary/40 bg-primary/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02]"
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

                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="text-xs text-gray-400 mt-1">{plan.tagline}</p>

                <div className="mt-5">
                  <span className="text-3xl font-extrabold">{priceDisplay}</span>
                  {price > 0 && <span className="text-sm text-gray-400 ml-1">/mo</span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {plan.creditsPerMonth === -1 ? "Unlimited credits" : `${plan.creditsPerMonth} credits/mo`}
                </p>

                <Link
                  to={planId === "free" ? "/signup" : "/signup?plan=" + planId}
                  className={cn(
                    "mt-5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    plan.isPopular
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-white/10 text-white hover:bg-white/15"
                  )}
                >
                  {planId === "free" ? "Start Free" : "Get Started"} <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <div className="mt-6 pt-5 border-t border-white/[0.06] space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f.key} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
                      )}
                      <span className={f.included ? "text-gray-300" : "text-gray-600"}>
                        {f.label}
                        {f.included && f.limit && f.limit !== "unlimited" && (
                          <span className="text-gray-500 ml-1">({f.note ?? f.limit})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold">Enterprise</h3>
              <p className="text-sm text-gray-400 mt-1">{PLANS.enterprise.tagline}</p>
              <div className="flex flex-wrap gap-3 mt-4">
                {PLANS.enterprise.features.map((f) => (
                  <span key={f.key} className="flex items-center gap-1.5 text-xs text-gray-300">
                    <Check className="w-3.5 h-3.5 text-primary" /> {f.label}
                  </span>
                ))}
              </div>
            </div>
            <a
              href="mailto:sales@clarifyai.com"
              className="flex-shrink-0 px-6 py-3 rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/15 transition-all"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-6">Need more credits?</h2>
          <p className="text-gray-400 text-sm mb-8">Buy credit packs anytime, no subscription change required.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.credits} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center">
                <p className="text-2xl font-bold">{pack.credits}</p>
                <p className="text-xs text-gray-400 mt-1">credits</p>
                <p className="text-lg font-semibold mt-3">${(pack.price / 100).toFixed(2)}</p>
                <p className="text-[10px] text-gray-500">${((pack.price / 100) / pack.credits).toFixed(2)}/credit</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>&copy; {new Date().getFullYear()} Clarify AI. All rights reserved.</span>
          <div className="flex gap-6">
            <Link to="/pricing" className="hover:text-gray-400 transition-colors">Pricing</Link>
            <Link to="/help" className="hover:text-gray-400 transition-colors">Help</Link>
            <Link to="/shortcuts" className="hover:text-gray-400 transition-colors">Shortcuts</Link>
            <Link to="/blog" className="hover:text-gray-400 transition-colors">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
