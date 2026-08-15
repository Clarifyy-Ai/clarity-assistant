import type { ReactNode } from "react";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import { useGlobalStore } from "@/store/globalStore";
import { Ban, Lock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLAN_ORDER,
  type PlanId,
  getPlanFeatureLimit,
} from "@/lib/billing/subscriptionManager";
import { normalizePlanId } from "@/lib/billing/planIds";
import { getPlanDisplayName } from "@/lib/constants/pricing";
import { EmptyState } from "@/components/common/EmptyState";
import type { FeatureFlagId } from "@/types";
export { handleSessionStartError, isSessionLimitError } from "@/lib/billing/sessionStartErrors";

// ─────────────────────────────────────────────────────────────────
// PlanGate
// Wraps any feature that requires a plan upgrade.
// Shows a locked overlay with upgrade CTA instead of the feature.
// ─────────────────────────────────────────────────────────────────

/** Public tiers only (Free / Pro / Max). Never gate on legacy starter. */
type GatedPlan = "free" | "pro" | "enterprise";

function normalizeUserPlan(value: unknown): PlanId {
  const normalized = normalizePlanId(value as string);
  if (PLAN_ORDER.includes(normalized as PlanId)) {
    return normalized as PlanId;
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
  /**
   * Optional kill-switch flag. Plan remains the primary gate.
   * A killed flag hides the module; enabled=true never grants access.
   */
  featureFlag?: FeatureFlagId;
}

/** Honest empty state when a kill-switch has hidden a module. */
export function FeatureUnavailableState({ compact = false }: { compact?: boolean }) {
  return (
    <EmptyState
      icon={Ban}
      title="Temporarily unavailable"
      description="This module is temporarily unavailable. Please try again later."
      compact={compact}
    />
  );
}

/**
 * Route/nav lock for `enabled: false` kill-switches.
 * Does not apply plan authorization — PlanGate remains the primary gate.
 * `isFeatureEnabled` is consulted so a killed flag cannot pass.
 */
export function FeatureKillGate({
  flag,
  children,
  compact = false,
}: {
  flag: FeatureFlagId;
  children: ReactNode;
  compact?: boolean;
}) {
  const blocked = useGlobalStore((state) => {
    const killed = state.featureKillSwitches[flag] === false;
    if (!killed) return false;
    return !state.isFeatureEnabled(flag);
  });

  if (blocked) return <FeatureUnavailableState compact={compact} />;
  return <>{children}</>;
}

/**
 * Sidebar / command palette visibility.
 * Hide when the kill-switch is off. Plan-deny stays visible so PlanGate can upsell.
 */
export function useNavFeatureVisible(flag?: FeatureFlagId): boolean {
  return useGlobalStore((state) => {
    if (!flag) return true;
    return (
      state.isFeatureEnabled(flag) ||
      state.featureKillSwitches[flag] !== false
    );
  });
}

export function PlanGate({
  requiredPlan,
  children,
  fallback,
  inline = false,
  featureFlag,
}: PlanGateProps) {
  const { profile } = useAuthStore();
  const uiStore = useUIStore();

  const userPlan = normalizeUserPlan((profile as { plan_id?: string } | null)?.plan_id);
  const hasAccess = planMeetsRequirement(userPlan, requiredPlan);
  const requiredLabel = getPlanDisplayName(requiredPlan);

  const featureKilled = useGlobalStore((state) =>
    featureFlag ? state.featureKillSwitches[featureFlag] === false : false,
  );
  const featureEnabled = useGlobalStore((state) =>
    featureFlag ? state.isFeatureEnabled(featureFlag) : true,
  );
  const storePlan = useGlobalStore((state) => state.currentPlan);
  const flagsReady = normalizePlanId(storePlan) === userPlan;

  if (featureKilled) {
    if (fallback) return <>{fallback}</>;
    if (inline) {
      return (
        <span className="text-xs text-muted-foreground">Temporarily unavailable</span>
      );
    }
    return <FeatureUnavailableState />;
  }

  if (hasAccess) {
    // Plan passed; kill-switch is AND. Skip until flags match the profile
    // so a brief boot race is not shown as "unavailable".
    if (featureFlag && flagsReady && !featureEnabled) {
      if (fallback) return <>{fallback}</>;
      if (inline) {
        return (
          <span className="text-xs text-muted-foreground">Temporarily unavailable</span>
        );
      }
      return <FeatureUnavailableState />;
    }
    return <>{children}</>;
  }
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
