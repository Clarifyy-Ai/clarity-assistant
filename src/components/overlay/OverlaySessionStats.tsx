import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAuthStore } from "@/store/authStore";
import { Clock, MessageSquare, Zap, CreditCard } from "lucide-react";

export function OverlaySessionStats() {
  const elapsed = useSessionStore((s) => s.elapsed_seconds);
  const creditsConsumed = useSessionStore((s) => s.credits_consumed);
  const totalCredits = useAuthStore((s) => s.profile?.credits ?? 0);
  const creditsRemaining = Math.max(0, totalCredits - creditsConsumed);
  const hintCount = useOverlayStore((s) => s.hint_history.length);
  const questionCount = useOverlayStore((s) => s.questions_detected);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex items-center justify-between border-t border-white/5 px-3 py-1 shrink-0">
      <StatItem icon={Clock} value={timeStr} />
      <StatItem icon={MessageSquare} value={String(questionCount)} label="Q" />
      <StatItem icon={Zap} value={String(hintCount)} label="hints" />
      <StatItem icon={CreditCard} value={String(creditsRemaining)} label="cr" />
    </div>
  );
}

function StatItem({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label?: string }) {
  return (
    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 font-mono">
      <Icon className="w-2.5 h-2.5" />
      <span className="text-muted-foreground/70">{value}</span>
      {label && <span>{label}</span>}
    </div>
  );
}
