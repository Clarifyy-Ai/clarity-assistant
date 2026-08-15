import { isStripeConfigured } from "@/lib/env";
import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/userStore"
import {
  PLANS,
  type PlanId,
} from "@/lib/billing/subscriptionManager"
import { formatPrice, CREDIT_PACKS } from "@/lib/billing/priceCalculator"
import { Check, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { createCheckoutSession, getCheckoutUrls } from "@/lib/api/billing"
import { openRazorpayCheckout } from "@/lib/api/payments"
import { toast } from "sonner"

const STRIPE_CONFIGURED = isStripeConfigured();

const MODAL_PLANS: Array<{
  id: PlanId
  icon: typeof Zap
  color: "violet" | "amber"
}> = [
  // Launch lineup only — Pro is the single paid self-serve tier.
  // Enterprise is contact-sales (handled on Pricing page), not an in-app upgrade.
  { id: "pro", icon: Zap, color: "violet" },
]

export function UpgradeModal() {
  const uiStore = useUIStore()
  const { planId, user, profile, refreshCredits, loadProfile } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)

  const reloadAfterRazorpay = () => {
    toast.success("Payment confirmed. Your plan and credits are updating.")
    void refreshCredits()
    void loadProfile()
  }

  const handleUpgrade = async (targetPlanId: PlanId) => {
    const plan = PLANS[targetPlanId]
    if (!plan) return

    if (!STRIPE_CONFIGURED || !plan.stripePriceIdMonthly) {
      setLoading(targetPlanId)
      try {
        await openRazorpayCheckout({
          productType: "pro_monthly",
          userEmail: profile?.email ?? user?.email ?? undefined,
          userName: profile?.full_name ?? undefined,
          onSuccess: reloadAfterRazorpay,
        })
        uiStore.setUpgradeModalOpen(false)
      } catch {
        toast.error("Checkout failed. Open Settings → Billing to pay with Razorpay.")
      } finally {
        setLoading(null)
      }
      return
    }

    setLoading(targetPlanId)
    try {
      const urls = getCheckoutUrls()
      const data = await createCheckoutSession({
        price_id: plan.stripePriceIdMonthly!,
        ...urls,
      })

      if (data?.url) {
        window.location.href = data.url
      } else {
        toast.error("Could not create checkout session.")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      toast.error(
        msg.includes("not configured") || msg.includes("STRIPE_SECRET_KEY")
          ? "Stripe is not configured on the server. Contact support to upgrade."
          : "Failed to start checkout. The checkout service may not be deployed yet."
      )
    } finally {
      setLoading(null)
      uiStore.setUpgradeModalOpen(false)
    }
  }

  const defaultPack = CREDIT_PACKS[0]

  const handleBuyCredits = async () => {
    if (!STRIPE_CONFIGURED) {
      setLoading("credits")
      try {
        await openRazorpayCheckout({
          productType: "credits_150",
          userEmail: profile?.email ?? user?.email ?? undefined,
          userName: profile?.full_name ?? undefined,
          onSuccess: reloadAfterRazorpay,
        })
        uiStore.setUpgradeModalOpen(false)
      } catch {
        toast.error("Checkout failed. Open Settings → Billing to pay with Razorpay.")
      } finally {
        setLoading(null)
      }
      return
    }

    const priceId = defaultPack?.stripePriceId
    if (!priceId) {
      toast.error("No credit pack price configured.")
      return
    }

    setLoading("credits")
    try {
      const data = await createCheckoutSession({
        price_id: priceId,
        success_url: `${window.location.origin}/app/settings/credits?success=1`,
        cancel_url: `${window.location.origin}/app/settings/billing?canceled=1`,
      })

      if (data?.url) {
        window.location.href = data.url
      } else {
        toast.error("Could not create checkout session.")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      toast.error(
        msg.includes("not configured") || msg.includes("STRIPE_SECRET_KEY")
          ? "Stripe is not configured on the server. Contact support to buy credits."
          : "Failed to start checkout. The checkout service may not be deployed yet."
      )
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
            USD Stripe is not configured. Upgrade and credit packs use Razorpay (INR).
          </p>
        </div>
      )}

      <div
        className={cn(
          "grid gap-4",
          MODAL_PLANS.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
      >
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
                    ? "border-primary/50 bg-primary/5"
                    : "border-amber-500/50 bg-amber-500/5"
                  : "border-border bg-secondary/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    mp.color === "violet"
                      ? "bg-primary/15 text-primary"
                      : "bg-amber-500/15 text-amber-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.creditsPerMonth} credits/mo</p>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-xl font-black text-foreground">
                    {formatPrice(plan.monthlyPrice, true)}
                  </span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                </div>
              </div>

              <ul className="space-y-1.5">
                {plan.features
                  .filter((f) => f.included)
                  .slice(0, 6)
                  .map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                      {f.label}
                      {f.limit && f.limit !== "unlimited" && (
                        <span className="text-muted-foreground">({f.limit})</span>
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
                    ? "cursor-not-allowed bg-secondary text-muted-foreground"
                    : mp.color === "violet"
                    ? "bg-primary text-white hover:bg-primary/90 focus:ring-primary"
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

      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Pay as you go</p>
          <p className="text-xs text-muted-foreground">
            {defaultPack
              ? `${defaultPack.credits} credits for ${formatPrice(defaultPack.priceUsdCents)} — no subscription`
              : "Credit packs — no subscription"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBuyCredits}
          disabled={loading === "credits"}
          className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          {loading === "credits" ? "Redirecting…" : "Buy credits"}
        </button>
      </div>
    </Modal>
  )
}
