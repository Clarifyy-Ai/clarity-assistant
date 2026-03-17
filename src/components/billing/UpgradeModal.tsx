import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/userStore";
import { Check, Zap, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// UpgradeModal
// Global upgrade CTA modal triggered by PlanGate or empty credits.
// ─────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id:      "pro" as const,
    label:   "Pro",
    price:   "$12",
    period:  "/mo",
    icon:    Zap,
    color:   "violet",
    credits: 30,
    perks: [
      "30 credits / month",
      "All 4 AI models",
      "Full analytics dashboard",
      "PDF scorecard export",
      "Post-interview debrief",
      "AI coach chat",
    ],
  },
  {
    id:      "team" as const,
    label:   "Team",
    price:   "$25",
    period:  "/mo",
    icon:    Users,
    color:   "amber",
    credits: 150,
    perks: [
      "5 seats included",
      "150 shared credits / month",
      "Collaborative practice rooms",
      "Shared question banks",
      "Team scorecard sharing",
      "All Pro features",
    ],
  },
];

export function UpgradeModal() {
  const uiStore = useUIStore();
  const { profile } = useAuthStore();

  return (
    <Modal
      open={uiStore.upgrade_modal_open}
      onClose={() => uiStore.setUpgradeModalOpen(false)}
      title="Upgrade ConfideQ"
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLANS.map((plan) => {
          const isCurrentPlan = profile?.plan === plan.id;
          const Icon = plan.icon;
          const isHighlighted = uiStore.upgradeModalTarget === plan.id;

          return (
            <div
              key={plan.id}
              className={cn(
                "rounded-2xl border p-5 flex flex-col gap-4 transition-all",
                isHighlighted
                  ? plan.color === "violet"
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-amber-500/50 bg-amber-500/5"
                  : "border-white/10 bg-white/3"
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center",
                  plan.color === "violet"
                    ? "bg-violet-500/15 text-violet-400"
                    : "bg-amber-500/15 text-amber-400"
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{plan.label}</p>
                  <p className="text-gray-400 text-xs">{plan.credits} credits/mo</p>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-white font-black text-xl">{plan.price}</span>
                  <span className="text-gray-500 text-xs">{plan.period}</span>
                </div>
              </div>

              {/* Perks */}
              <ul className="space-y-1.5">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-xs text-gray-300">
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    {perk}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                disabled={isCurrentPlan}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-semibold transition-all mt-auto",
                  isCurrentPlan
                    ? "bg-white/10 text-gray-500 cursor-not-allowed"
                    : plan.color === "violet"
                    ? "bg-violet-600 hover:bg-violet-500 text-white"
                    : "bg-amber-500 hover:bg-amber-400 text-black"
                )}
              >
                {isCurrentPlan ? "Current plan" : `Upgrade to ${plan.label}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Pay-per-credit option */}
      <div className="mt-4 p-4 bg-white/3 border border-white/10 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Pay as you go</p>
          <p className="text-xs text-gray-400">10 credits for $3 — no subscription</p>
        </div>
        <button className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-medium rounded-xl transition-all">
          Buy credits
        </button>
      </div>
    </Modal>
  );
}
