// @ts-nocheck
import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/userStore"
import { Check, Zap, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"

type PlanId = "pro" | "team"

const STRIPE_CONFIGURED =
  !!import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY;

const PLANS: Array<{
  id: PlanId
  label: string
  price: string
  period: "/mo"
  icon: typeof Zap
  color: "violet" | "amber"
  credits: number
  stripePriceId: string | undefined
  perks: string[]
}> = [
  {
    id: "pro",
    label: "Pro",
    price: "$12",
    period: "/mo",
    icon: Zap,
    color: "violet",
    credits: 30,
    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY,
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
    id: "team",
    label: "Team",
    price: "$25",
    period: "/mo",
    icon: Users,
    color: "amber",
    credits: 150,
    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_TEAM_MONTHLY,
    perks: [
      "5 seats included",
      "150 shared credits / month",
      "Collaborative practice rooms",
      "Shared question banks",
      "Team scorecard sharing",
      "All Pro features",
    ],
  },
]

export function UpgradeModal() {
  const uiStore = useUIStore()
  const { profile } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)

  const handleUpgrade = async (plan: PlanId) => {
    const planDef = PLANS.find((p) => p.id === plan)
    if (!planDef) return

    if (!STRIPE_CONFIGURED || !planDef.stripePriceId) {
      toast.error("Stripe is not configured. Visit Settings > Billing for details.")
      uiStore.setUpgradeModalOpen(false)
      return
    }

    setLoading(plan)
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id: planDef.stripePriceId,
          success_url: `${window.location.origin}/app/settings/billing?success=1`,
          cancel_url: `${window.location.origin}/app/settings/billing`,
          mode: "subscription",
        },
      })

      if (error) throw error
      if (data?.url) {
        window.location.href = data.url
      } else {
        toast.error("Could not create checkout session.")
      }
    } catch {
      toast.error("Failed to start checkout. The checkout service may not be deployed yet.")
    } finally {
      setLoading(null)
      uiStore.setUpgradeModalOpen(false)
    }
  }

  const handleBuyCredits = async () => {
    if (!STRIPE_CONFIGURED) {
      toast.error("Stripe is not configured. Visit Settings > Billing for details.")
      uiStore.setUpgradeModalOpen(false)
      return
    }

    setLoading("credits")
    try {
      const priceId = import.meta.env.VITE_STRIPE_PRICE_CREDITS_10
      if (!priceId) {
        toast.error("No credit pack price configured.")
        return
      }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id: priceId,
          success_url: `${window.location.origin}/app/settings/credits?success=1`,
          cancel_url: `${window.location.origin}/app/settings/billing`,
          mode: "payment",
        },
      })

      if (error) throw error
      if (data?.url) {
        window.location.href = data.url
      } else {
        toast.error("Could not create checkout session.")
      }
    } catch {
      toast.error("Failed to start checkout. The checkout service may not be deployed yet.")
    } finally {
      setLoading(null)
      uiStore.setUpgradeModalOpen(false)
    }
  }

  return (
    <Modal
      open={uiStore.upgrade_modal_open}
      onClose={() => uiStore.setUpgradeModalOpen(false)}
      title="Upgrade ConfideQ"
      size="lg"
    >
      {!STRIPE_CONFIGURED && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <span className="text-amber-400 text-sm">⚠</span>
          <p className="text-xs text-amber-300">
            Stripe is not configured yet. Checkout will not work until VITE_STRIPE_* env vars are set.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrentPlan = (profile as any)?.plan_id === plan.id
          const Icon = plan.icon
          const isHighlighted = uiStore.upgrade_modal_trigger === plan.id

          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-4 rounded-2xl border p-5 transition-all",
                isHighlighted
                  ? plan.color === "violet"
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-amber-500/50 bg-amber-500/5"
                  : "border-white/10 bg-white/[0.03]"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    plan.color === "violet"
                      ? "bg-violet-500/15 text-violet-400"
                      : "bg-amber-500/15 text-amber-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{plan.label}</p>
                  <p className="text-xs text-gray-400">{plan.credits} credits/mo</p>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-xl font-black text-white">{plan.price}</span>
                  <span className="text-xs text-gray-500">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-1.5">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-xs text-gray-300">
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                    {perk}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => !isCurrentPlan && handleUpgrade(plan.id)}
                disabled={isCurrentPlan || loading === plan.id}
                aria-disabled={isCurrentPlan}
                className={cn(
                  "mt-auto w-full rounded-xl py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent",
                  isCurrentPlan
                    ? "cursor-not-allowed bg-white/10 text-gray-500"
                    : plan.color === "violet"
                    ? "bg-violet-600 text-white hover:bg-violet-500 focus:ring-violet-500"
                    : "bg-amber-500 text-black hover:bg-amber-400 focus:ring-amber-500"
                )}
              >
                {loading === plan.id
                  ? "Redirecting…"
                  : isCurrentPlan
                  ? "Current plan"
                  : `Upgrade to ${plan.label}`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <p className="text-sm font-medium text-white">Pay as you go</p>
          <p className="text-xs text-gray-400">10 credits for $3 — no subscription</p>
        </div>
        <button
          type="button"
          onClick={handleBuyCredits}
          disabled={loading === "credits"}
          className="rounded-xl border border-white/[0.15] bg-white/10 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-white/[0.15] focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          {loading === "credits" ? "Redirecting…" : "Buy credits"}
        </button>
      </div>
    </Modal>
  )
}
