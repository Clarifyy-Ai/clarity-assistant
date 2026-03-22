import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/userStore"
import {
  PLANS,
  type PlanId,
} from "@/lib/billing/subscriptionManager"
import { formatPrice, CREDIT_PACKS } from "@/lib/billing/priceCalculator"
import { Check, Zap, Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"

const STRIPE_CONFIGURED =
  !!import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY ||
  !!import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY

const MODAL_PLANS: Array<{
  id: PlanId
  icon: typeof Zap
  color: "violet" | "amber"
}> = [
  { id: "pro",   icon: Zap,   color: "violet" },
  { id: "elite", icon: Crown, color: "amber" },
]

export function UpgradeModal() {
  const uiStore = useUIStore()
  const { planId } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)

  const handleUpgrade = async (targetPlanId: PlanId) => {
    const plan = PLANS[targetPlanId]
    if (!plan) return

    if (!STRIPE_CONFIGURED || !plan.stripePriceIdMonthly) {
      toast.error("Stripe is not configured. Visit Settings > Billing for details.")
      uiStore.setUpgradeModalOpen(false)
      return
    }

    setLoading(targetPlanId)
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id:    plan.stripePriceIdMonthly,
          success_url: `${window.location.origin}/app/settings/billing?success=1`,
          cancel_url:  `${window.location.origin}/app/settings/billing?canceled=1`,
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

  const defaultPack = CREDIT_PACKS[0]

  const handleBuyCredits = async () => {
    if (!STRIPE_CONFIGURED) {
      toast.error("Stripe is not configured. Visit Settings > Billing for details.")
      uiStore.setUpgradeModalOpen(false)
      return
    }

    const priceId = defaultPack?.stripePriceId
    if (!priceId) {
      toast.error("No credit pack price configured.")
      return
    }

    setLoading("credits")
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id:    priceId,
          success_url: `${window.location.origin}/app/settings/credits?success=1`,
          cancel_url:  `${window.location.origin}/app/settings/billing?canceled=1`,
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
      title="Upgrade Clarify AI"
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
        {MODAL_PLANS.map((mp) => {
          const plan = PLANS[mp.id]
          const isCurrentPlan = planId === mp.id
          const Icon = mp.icon
          const isHighlighted = uiStore.upgrade_modal_trigger === mp.id

          return (
            <div
              key={mp.id}
              className={cn(
                "flex flex-col gap-4 rounded-2xl border p-5 transition-all",
                isHighlighted
                  ? mp.color === "violet"
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-amber-500/50 bg-amber-500/5"
                  : "border-white/10 bg-white/[0.03]"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    mp.color === "violet"
                      ? "bg-violet-500/15 text-violet-400"
                      : "bg-amber-500/15 text-amber-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{plan.name}</p>
                  <p className="text-xs text-gray-400">{plan.creditsPerMonth} credits/mo</p>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-xl font-black text-white">
                    {formatPrice(plan.monthlyPrice, true)}
                  </span>
                  <span className="text-xs text-gray-500">/mo</span>
                </div>
              </div>

              <ul className="space-y-1.5">
                {plan.features
                  .filter((f) => f.included)
                  .slice(0, 6)
                  .map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-xs text-gray-300">
                      <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                      {f.label}
                      {f.limit && f.limit !== "unlimited" && (
                        <span className="text-gray-500">({f.limit})</span>
                      )}
                    </li>
                  ))}
              </ul>

              <button
                type="button"
                onClick={() => !isCurrentPlan && handleUpgrade(mp.id)}
                disabled={isCurrentPlan || loading === mp.id}
                aria-disabled={isCurrentPlan}
                className={cn(
                  "mt-auto w-full rounded-xl py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent",
                  isCurrentPlan
                    ? "cursor-not-allowed bg-white/10 text-gray-500"
                    : mp.color === "violet"
                    ? "bg-violet-600 text-white hover:bg-violet-500 focus:ring-violet-500"
                    : "bg-amber-500 text-black hover:bg-amber-400 focus:ring-amber-500"
                )}
              >
                {loading === mp.id
                  ? "Redirecting…"
                  : isCurrentPlan
                  ? "Current plan"
                  : `Upgrade to ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <p className="text-sm font-medium text-white">Pay as you go</p>
          <p className="text-xs text-gray-400">
            {defaultPack
              ? `${defaultPack.credits} credits for ${formatPrice(defaultPack.priceUsdCents)} — no subscription`
              : "Credit packs — no subscription"}
          </p>
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
