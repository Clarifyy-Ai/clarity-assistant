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
  children:     ReactNode;
  fallback?:    ReactNode;
  inline?:      boolean;   // compact inline lock badge vs full overlay
}

export function PlanGate({
  requiredPlan,
  children,
  fallback,
  inline = false,
}: PlanGateProps) {
  const { profile }  = useAuthStore();
  const uiStore      = useUIStore();
  const userPlan     = (profile?.plan ?? "free") as Plan;
  const hasAccess    = PLAN_RANK[userPlan] >= PLAN_RANK[requiredPlan];

  if (hasAccess) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  if (inline) {
    return (
      <span
        onClick={() => uiStore.openUpgradeModal(requiredPlan)}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-full cursor-pointer hover:bg-amber-500/20 transition-all"
      >
        <Lock className="w-3 h-3" />
        {requiredPlan === "pro" ? "Pro" : "Team"}
      </span>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-white font-semibold text-sm">
            {requiredPlan === "pro" ? "Pro" : "Team"} Feature
          </p>
          <p className="text-gray-400 text-xs leading-relaxed">
            Upgrade to unlock this feature and all{" "}
            {requiredPlan === "pro" ? "Pro" : "Team"} benefits.
          </p>
          <button
            onClick={() => uiStore.openUpgradeModal(requiredPlan)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              requiredPlan === "pro"
                ? "bg-violet-600 hover:bg-violet-500 text-white"
                : "bg-amber-500 hover:bg-amber-400 text-black"
            )}
          >
            Upgrade to {requiredPlan === "pro" ? "Pro" : "Team"}
          </button>
        </div>
      </div>
    </div>
  );
}
