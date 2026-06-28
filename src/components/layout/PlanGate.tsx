import type { ReactNode } from "react";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import { Lock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLAN_ORDER,
  type PlanId,
  getPlanFeatureLimit,
} from "@/lib/billing/subscriptionManager";
import { getPlanDisplayName } from "@/lib/constants/pricing";
export { handleSessionStartError, isSessionLimitError } from "@/lib/billing/sessionStartErrors";

// ─────────────────────────────────────────────────────────────────
// PlanGate
// Wraps any feature that requires a plan upgrade.
// Shows a locked overlay with upgrade CTA instead of the feature.
// ─────────────────────────────────────────────────────────────────

type GatedPlan = "free" | "pro" | "enterprise";

function normalizeUserPlan(value: unknown): PlanId {
  if (typeof value === "string" && PLAN_ORDER.includes(value as PlanId)) {
    return value as PlanId;
  }
  return "free";
}

function planMeetsRequirement(userPlan: PlanId, requiredPlan: GatedPlan): boolean {
  if (requiredPlan === "free") return true;

  const userRank = PLAN_ORDER.indexOf(userPlan);

  if (requiredPlan === "pro") {
    return userRank >= PLAN_ORDER.indexOf("pro");
  }

  return userPlan === "enterprise";
}

interface PlanGateProps {
  requiredPlan: GatedPlan;
  children: ReactNode;
  fallback?: ReactNode;
  /** compact inline lock badge vs full overlay */
  inline?: boolean;
}

export function PlanGate({
  requiredPlan,
  children,
  fallback,
  inline = false,
}: PlanGateProps) {
  const { profile } = useAuthStore();
  const uiStore = useUIStore();

  const userPlan = normalizeUserPlan((profile as { plan_id?: string } | null)?.plan_id);
  const hasAccess = planMeetsRequirement(userPlan, requiredPlan);
  const requiredLabel = getPlanDisplayName(requiredPlan);

  if (hasAccess) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  if (inline) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => uiStore.openUpgradeModal(requiredPlan)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            uiStore.openUpgradeModal(requiredPlan);
          }
        }}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400 transition-all hover:bg-amber-500/20"
        aria-label={`Upgrade to ${requiredLabel} plan`}
        title={`Requires ${requiredLabel} plan`}
      >
        <Lock className="h-3 w-3" />
        {requiredLabel}
      </span>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none select-none opacity-40 blur-sm" aria-hidden="true">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <Lock className="h-5 w-5 text-amber-400" />
          </div>

          <p className="text-sm font-semibold text-foreground">
            {requiredLabel} Feature
          </p>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Upgrade to unlock this feature and all {requiredLabel} benefits.
          </p>

          <button
            type="button"
            onClick={() => uiStore.openUpgradeModal(requiredPlan)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent",
              requiredPlan === "enterprise"
                ? "bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-500"
                : "bg-primary text-white hover:bg-primary focus:ring-primary"
            )}
            aria-label={`Upgrade to ${requiredLabel}`}
          >
            Upgrade to {requiredLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SessionLimitPrompt — inline upgrade CTA when session quota is hit
// ─────────────────────────────────────────────────────────────────

interface SessionLimitPromptProps {
  sessionsUsed: number;
  sessionLimit: number;
  className?: string;
}

export function SessionLimitPrompt({
  sessionsUsed,
  sessionLimit,
  className,
}: SessionLimitPromptProps) {
  const uiStore = useUIStore();

  if (sessionsUsed < sessionLimit) return null;

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3",
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-2 flex-1">
        <Zap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Session limit reached</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You&apos;ve used {sessionsUsed} of {sessionLimit} sessions today on the free plan.
            Upgrade for unlimited sessions.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => uiStore.openUpgradeModal("session_limit")}
        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary transition-all"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

/** Returns daily session cap for the user's plan (null = unlimited). */
export function getDailySessionCap(planId: PlanId): number | null {
  const limit = getPlanFeatureLimit(planId, "live_assist");
  if (limit === null || limit === "unlimited") return null;
  return typeof limit === "number" ? limit : null;
}
