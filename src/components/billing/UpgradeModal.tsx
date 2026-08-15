import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/userStore"
import {
  PLANS,
  type PlanId,
} from "@/lib/billing/subscriptionManager"
import { getPlanDisplayName } from "@/lib/constants/pricing"
import {
  CREDIT_PACKS,
  formatInrPaise,
  razorpayPaiseForPack,
  razorpayPaiseForPlan,
} from "@/lib/billing/priceCalculator"
import { Check, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { openRazorpayCheckout, type RazorpayProductType } from "@/lib/api/payments"
import { toast } from "sonner"

const MODAL_PLANS: Array<{
  id: PlanId
  productType: RazorpayProductType
  icon: typeof Zap
  color: "violet" | "amber"
}> = [
  { id: "pro", productType: "pro_monthly", icon: Zap, color: "violet" },
  { id: "enterprise", productType: "enterprise_monthly", icon: Zap, color: "amber" },
]

type CheckoutPhase = "creating" | "processing"

function checkoutBusyLabel(phase: CheckoutPhase | null, idle: string): string {
  if (!phase) return idle
  return phase === "processing" ? "Payment processing" : "Creating secure checkout…"
}

function checkoutErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : ""
  if (msg.includes("Checkout could not be prepared")) return msg
  if (msg.toLowerCase().includes("verif")) {
    return msg || "Payment could not be verified. No credits were added."
  }
  return msg.trim() || "Checkout failed. Open Settings → Billing to pay with Razorpay."
}

export function UpgradeModal() {
  const uiStore = useUIStore()
  const { planId, user, profile, refreshCredits, loadProfile } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase | null>(null)

  const handleRazorpay = async (
    loadingKey: string,
    productType: RazorpayProductType,
  ) => {
    if (loading) return
    setLoading(loadingKey)
    setCheckoutPhase("creating")
    try {
      await openRazorpayCheckout({
        productType,
        userEmail: profile?.email ?? user?.email ?? undefined,
        userName: profile?.full_name ?? undefined,
        onReady: () => setCheckoutPhase("processing"),
        onSuccess: () => {
          toast.success("Payment completed")
          void refreshCredits()
          void loadProfile()
          uiStore.setUpgradeModalOpen(false)
        },
      })
    } catch (error) {
      toast.error(checkoutErrorMessage(error))
    } finally {
      setLoading(null)
      setCheckoutPhase(null)
    }
  }

  const handleUpgrade = async (targetPlanId: PlanId, productType: RazorpayProductType) => {
    const plan = PLANS[targetPlanId]
    if (!plan) return
    await handleRazorpay(targetPlanId, productType)
  }

  const defaultPack = CREDIT_PACKS[0]

  const handleBuyCredits = async () => {
    await handleRazorpay("credits", "credits_50")
  }

  return (
    <Modal
      open={uiStore.upgrade_modal_open}
      onClose={() => uiStore.setUpgradeModalOpen(false)}
      title="Upgrade Clarify AI"
      size="lg"
    >
      <p className="mb-4 text-xs text-muted-foreground">
        One-time Pro or Max access and credit packs. Razorpay does not auto-renew.
      </p>
      <div
        className={cn(
          "grid gap-4",
          MODAL_PLANS.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {MODAL_PLANS.map((mp) => {
          const plan = PLANS[mp.id]
          const displayName = getPlanDisplayName(mp.id)
          const isCurrentPlan = planId === mp.id
          const Icon = mp.icon
          const isHighlighted = uiStore.upgrade_modal_trigger === mp.id
          const inrPaise = razorpayPaiseForPlan(mp.id)
          const busy = loading === mp.id

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
                  <p className="text-sm font-bold text-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {plan.creditsPerMonth.toLocaleString()} credits included
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-xl font-black text-foreground">
                    {inrPaise ? formatInrPaise(inrPaise) : "Free"}
                  </span>
                  <span className="text-xs text-muted-foreground"> one-time</span>
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
                onClick={() => !isCurrentPlan && void handleUpgrade(mp.id, mp.productType)}
                disabled={isCurrentPlan || Boolean(loading)}
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
                {busy
                  ? checkoutBusyLabel(checkoutPhase, `Upgrade to ${displayName}`)
                  : isCurrentPlan
                  ? "Current plan"
                  : `Buy ${displayName} (one-time)`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Credit pack</p>
          <p className="text-xs text-muted-foreground">
            {defaultPack
              ? `${defaultPack.credits} credits for ${formatInrPaise(razorpayPaiseForPack(defaultPack.id) ?? 0)} — one-time, no auto-renew`
              : "Credit packs — one-time, no auto-renew"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleBuyCredits()}
          disabled={Boolean(loading)}
          className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          {loading === "credits"
            ? checkoutBusyLabel(checkoutPhase, "Buy credits")
            : "Buy credits"}
        </button>
      </div>
    </Modal>
  )
}
