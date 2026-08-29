import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { PLAN_MONTHLY_CREDITS, type PlanId } from "@/lib/constants/pricing";
import { cn } from "@/lib/utils";
import { CreditExhaustedState } from "./CreditExhaustedState";
import { useCreditBalance } from "./useCreditState";

export { useLowCreditState } from "./useCreditState";

interface LowCreditBannerProps {
  className?: string;
}

const ABSOLUTE_LOW_CREDIT = 5;

/** Shows when balance is at or below 5 credits or 20% of the plan's monthly allotment. */
export function LowCreditBanner({ className }: LowCreditBannerProps) {
  const planId = (useAuthStore((s) => s.planId) ?? "free") as PlanId;
  const { balance, known } = useCreditBalance();
  const monthly = PLAN_MONTHLY_CREDITS[planId];

  if (!known) return null;

  if (balance <= 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-red-500/25 bg-red-500/5",
          className
        )}
        role="status"
      >
        <CreditExhaustedState compact />
      </div>
    );
  }

  const percentThreshold =
    monthly === null ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(monthly * 0.2));
  const isLow = balance <= ABSOLUTE_LOW_CREDIT || balance <= percentThreshold;
  if (!isLow) return null;

  const pct = monthly === null ? null : Math.round((balance / monthly) * 100);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3",
        "bg-amber-500/10 border border-amber-500/25 rounded-xl",
        className
      )}
      role="status"
    >
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-xs text-amber-200/90 flex-1">
        You have {balance.toLocaleString()} credits left
        {pct !== null ? ` (${pct}% of your monthly allotment)` : ""}.
        Top up or upgrade to keep practising without interruptions.
      </p>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/app/settings/billing"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
        >
          Billing <ArrowUpRight className="w-3 h-3" />
        </Link>
        {planId === "free" && (
          <Link
            to="/app/settings/billing?upgrade=pro"
            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Upgrade to Pro
          </Link>
        )}
      </div>
    </div>
  );
}
