import { useEffect, useState } from "react"
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
import { Check, Crown, Sparkles, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  openRazorpayCheckout,
  RAZORPAY_QA_SANDBOX_HINT,
  showRazorpayQaSandboxHint,
  toPaymentUserFacingError,
  type RazorpayProductType,
} from "@/lib/billing/razorpayCheckout"
import { toast } from "sonner"
import { hydrateBillingCatalog } from "@/lib/billing/liveCatalog"

const MODAL_PLANS: Array<{
  id: PlanId
  productType: RazorpayProductType
  icon: typeof Zap
  color: "violet" | "amber"
}> = [
  { id: "pro", productType: "pro_monthly", icon: Zap, color: "violet" },
  { id: "enterprise", productType: "enterprise_monthly", icon: Crown, color: "amber" },
]

type CheckoutPhase = "creating" | "processing"

function checkoutBusyLabel(phase: CheckoutPhase | null, idle: string): string {
  if (!phase) return idle
  return phase === "processing" ? "Payment processing" : "Creating secure checkout…"
}

function checkoutErrorMessage(error: unknown): string {
  return toPaymentUserFacingError(error)
}

export function UpgradeModal() {
  const uiStore = useUIStore()
  const { planId, user, profile, refreshCredits, loadProfile } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase | null>(null)

  useEffect(() => {
    if (uiStore.upgrade_modal_open) void hydrateBillingCatalog()
  }, [uiStore.upgrade_modal_open])

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

  const handleBuyCredits = async (packId: RazorpayProductType) => {
    await handleRazorpay(packId, packId)
  }

  const isMax = planId === "enterprise"
  const heading = isMax
    ? "Add credits"
    : planId === "pro"
      ? "Upgrade or add credits"
      : "Upgrade Career Pilot"

  return (
    <Modal
      open={uiStore.upgrade_modal_open}
      onClose={() => uiStore.setUpgradeModalOpen(false)}
      title={heading}
      size="lg"
    >
      <p className="mb-4 text-xs text-muted-foreground">
        {isMax
          ? "You already have Max. Buy a credit pack — Razorpay does not auto-renew."
          : "One-time Pro or Max access and credit packs. Razorpay does not auto-renew."}
      </p>
      {showRazorpayQaSandboxHint() ? (
        <p className="mb-4 text-xs text-sky-800 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
          {RAZORPAY_QA_SANDBOX_HINT}
        </p>
      ) : null}
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

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => {
          const productType = pack.id as RazorpayProductType
          const busy = loading === pack.id
          return (
            <div
              key={pack.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/50 p-3"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                <p className="text-sm font-medium text-foreground">{pack.credits} credits</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatInrPaise(razorpayPaiseForPack(pack.id) ?? 0)} · one-time
              </p>
              <button
                type="button"
                onClick={() => void handleBuyCredits(productType)}
                disabled={Boolean(loading)}
                title={`Buy ${pack.credits} credits`}
                className="mt-auto rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
              >
                {busy
                  ? checkoutBusyLabel(checkoutPhase, `Buy ${pack.credits}`)
                  : `Buy ${pack.credits}`}
              </button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
