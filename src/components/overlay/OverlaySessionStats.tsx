// src/components/overlay/OverlaySessionStats.tsx
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAuthStore } from "@/store/authStore";
import { Clock, MessageSquare, Zap, CreditCard } from "lucide-react";

export function OverlaySessionStats() {
  const elapsed = useSessionStore((s) => s.elapsed_seconds);
  const creditsRemaining = useAuthStore((s) => s.profile?.credits ?? 0);
  const hintCount = useOverlayStore((s) => s.hint_history.length);
  const questionCount = useOverlayStore((s) => s.questions_detected);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex items-center justify-between border-t border-white/[0.05] bg-[#0a0a14]/60 px-3 py-1.5 shrink-0">
      <StatItem icon={Clock} value={timeStr} label="session" />
      <div className="w-px h-3 bg-white/[0.07]" />
      <StatItem icon={MessageSquare} value={String(questionCount)} label="Q" />
      <div className="w-px h-3 bg-white/[0.07]" />
      <StatItem icon={Zap} value={String(hintCount)} label="hints" />
      <div className="w-px h-3 bg-white/[0.07]" />
      <StatItem icon={CreditCard} value={String(creditsRemaining)} label="cr" highlight={creditsRemaining < 5} />
    </div>
  );
}

function StatItem({
  icon: Icon,
  value,
  label,
  highlight,
}: {
  icon: React.ElementType;
  value: string;
  label?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 text-[11px] font-mono">
      <Icon className={`w-2.5 h-2.5 ${highlight ? "text-amber-400" : "text-white/25"}`} />
      <span className={`tabular-nums ${highlight ? "text-amber-400" : "text-white/45"}`}>{value}</span>
      {label && <span className="text-[10px] text-white/20">{label}</span>}
    </div>
  );
}
