import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type InsufficientCreditsMode = "credits" | "plan" | "both";

export type InsufficientCreditsActionProps = {
  /** Canonical or alias operation key (for analytics / test ids). */
  operationKey?: string;
  required: number | null;
  balance: number | null;
  mode?: InsufficientCreditsMode;
  /** Path to return to after purchase (encoded into billing query). */
  returnTo?: string;
  className?: string;
  compact?: boolean;
  title?: string;
  description?: string;
};

function billingHref(returnTo?: string, upgrade = false): string {
  const params = new URLSearchParams();
  if (upgrade) params.set("upgrade", "pro");
  if (returnTo?.trim()) params.set("returnTo", returnTo.trim());
  const q = params.toString();
  return q ? `/app/settings/billing?${q}` : "/app/settings/billing";
}

/**
 * Action-level insufficient credits / plan gate.
 * Does not redirect automatically — user must click Buy Credits or Upgrade.
 */
export function InsufficientCreditsAction({
  operationKey,
  required,
  balance,
  mode = "credits",
  returnTo,
  className,
  compact = false,
  title,
  description,
}: InsufficientCreditsActionProps) {
  const navigate = useNavigate();
  const showBuy = mode === "credits" || mode === "both";
  const showUpgrade = mode === "plan" || mode === "both";

  const resolvedTitle =
    title ??
    (mode === "plan"
      ? "Upgrade required"
      : "Not enough credits");

  const costLabel =
    typeof required === "number" && Number.isFinite(required)
      ? Math.max(0, Math.floor(required))
      : null;
  const balanceLabel =
    typeof balance === "number" && Number.isFinite(balance)
      ? Math.max(0, Math.floor(balance))
      : null;

  const resolvedDescription =
    description ??
    (mode === "plan"
      ? "This action is not included in your current plan. Upgrade to unlock it."
      : costLabel != null && balanceLabel != null
        ? `This action requires ${costLabel} credit${costLabel === 1 ? "" : "s"}. You currently have ${balanceLabel}.`
        : costLabel != null
          ? `This action requires ${costLabel} credit${costLabel === 1 ? "" : "s"}. Top up to continue.`
          : "You need more credits to run this action.");

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/30 bg-amber-500/5 text-foreground",
        compact ? "p-3 space-y-2" : "p-4 space-y-3",
        className,
      )}
      data-testid="insufficient-credits-action"
      data-operation-key={operationKey ?? undefined}
      role="status"
    >
      <div className="flex items-start gap-2">
        <Zap
          className={cn(
            "shrink-0 text-amber-500",
            compact ? "w-4 h-4 mt-0.5" : "w-5 h-5 mt-0.5",
          )}
        />
        <div className="min-w-0 space-y-1">
          <p className={cn("font-semibold", compact ? "text-sm" : "text-sm")}>
            {resolvedTitle}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {resolvedDescription}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {showBuy && (
          <Button
            variant="primary"
            size={compact ? "sm" : "md"}
            data-testid="buy-credits-cta"
            onClick={() => navigate(billingHref(returnTo, false))}
          >
            Buy Credits
          </Button>
        )}
        {showUpgrade && (
          <Button
            variant={showBuy ? "outline" : "primary"}
            size={compact ? "sm" : "md"}
            data-testid="upgrade-plan-cta"
            onClick={() => navigate(billingHref(returnTo, true))}
          >
            Upgrade
          </Button>
        )}
      </div>
    </div>
  );
}
