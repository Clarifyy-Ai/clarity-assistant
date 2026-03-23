import type { ReactNode } from "react";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// PlanGate
// Wraps any feature that requires a plan upgrade.
// Shows a locked overlay with upgrade CTA instead of the feature.
// ─────────────────────────────────────────────────────────────────

type Plan = "free" | "pro" | "team";

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, team: 2 };

interface PlanGateProps {
  requiredPlan: Plan;
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

  const userPlan = ((profile as any)?.plan_id ?? "free") as Plan;
  const hasAccess = PLAN_RANK[userPlan] >= PLAN_RANK[requiredPlan];

  // If user has access, render children directly
  if (hasAccess) return <>{children}</>;

  // If a custom fallback is provided, render it
  if (fallback) return <>{fallback}</>;

  // Inline badge mode (for small locked UI chunks)
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
        aria-label={`Upgrade to ${requiredPlan === "pro" ? "Pro" : "Team"} plan`}
        title={`Requires ${requiredPlan === "pro" ? "Pro" : "Team"} plan`}
      >
        <Lock className="h-3 w-3" />
        {requiredPlan === "pro" ? "Pro" : "Team"}
      </span>
    );
  }

  // Full overlay lock with blurred preview
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Blurred preview (make it inert to screen readers) */}
      <div className="pointer-events-none select-none opacity-40 blur-sm" aria-hidden="true">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <Lock className="h-5 w-5 text-amber-400" />
          </div>

          <p className="text-sm font-semibold text-foreground">
            {requiredPlan === "pro" ? "Pro" : "Team"} Feature
          </p>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Upgrade to unlock this feature and all{" "}
            {requiredPlan === "pro" ? "Pro" : "Team"} benefits.
          </p>

          <button
            type="button"
            onClick={() => uiStore.openUpgradeModal(requiredPlan)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent",
              requiredPlan === "pro"
                ? "bg-violet-600 text-white hover:bg-violet-500 focus:ring-violet-500"
                : "bg-amber-500 text-black hover:bg-amber-400 focus:ring-amber-500"
            )}
            aria-label={`Upgrade to ${requiredPlan === "pro" ? "Pro" : "Team"}`}
          >
            Upgrade to {requiredPlan === "pro" ? "Pro" : "Team"}
          </button>
        </div>
      </div>
    </div>
  );
}
