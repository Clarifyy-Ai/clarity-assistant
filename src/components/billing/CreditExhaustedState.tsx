import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { useAuthStore } from "@/store/authStore";

interface CreditExhaustedStateProps {
  className?: string;
  compact?: boolean;
}

/** Full-page or inline empty state when the user has zero credits. */
export function CreditExhaustedState({ className, compact }: CreditExhaustedStateProps) {
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={Zap}
      title="You're out of credits"
      description="Mock and live practice sessions need credits to run. Buy a credit pack or upgrade your plan to keep practising."
      actionLabel="Buy credits"
      onAction={() => navigate("/app/settings/billing")}
      secondaryActionLabel="View usage"
      onSecondaryAction={() => navigate("/app/usage")}
      className={className}
      compact={compact}
    />
  );
}

export function useCreditExhaustedState(): { isExhausted: boolean; balance: number } {
  const profile = useAuthStore((s) => s.profile);
  const balance = profile?.credits ?? 0;
  return { isExhausted: balance <= 0, balance };
}
