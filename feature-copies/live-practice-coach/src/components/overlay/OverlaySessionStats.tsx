// src/components/overlay/OverlaySessionStats.tsx
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAuthStore } from "@/store/authStore";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";
import { Clock, MessageSquare, Zap, CreditCard } from "lucide-react";

export function OverlaySessionStats() {
  const elapsed = useSessionStore((s) => s.elapsed_seconds);
  const profileCredits = useAuthStore((s) => s.profile?.credits);
  const storeCredits = useAuthStore((s) => s.credits);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const { balance: creditsRemaining } = resolveCreditBalance({
    isProfileLoaded,
    profileCredits,
    storeCredits,
  });
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
