import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export { useCreditExhaustedState } from "./useCreditState";

interface CreditExhaustedStateProps {
  className?: string;
  compact?: boolean;
}

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
