// src/components/overlay/OverlayAnswerStrength.tsx
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

function computeStrength(
  isAnswering: boolean,
  wpm: number,
  fillerCount: number,
  elapsedSeconds: number,
): "off" | "weak" | "ok" | "strong" {
  if (!isAnswering && elapsedSeconds < 5) return "off";

  let score = 0;

  if (wpm >= 90 && wpm <= 160) score += 2;
  else if (wpm > 0) score += 1;

  if (fillerCount === 0) score += 2;
  else if (fillerCount <= 2) score += 1;

  if (elapsedSeconds >= 30 && elapsedSeconds <= 130) score += 2;
  else if (elapsedSeconds > 10) score += 1;

  if (score >= 5) return "strong";
  if (score >= 3) return "ok";
  if (score >= 1) return "weak";
  return "off";
}

const LABEL = { off: "…", weak: "Weak", ok: "Good", strong: "Strong" };

const STRENGTH_CONFIG = {
  off:    { bars: 0, color: "bg-white/10",    textColor: "text-white/20" },
  weak:   { bars: 1, color: "bg-red-500",     textColor: "text-red-400/70" },
  ok:     { bars: 2, color: "bg-amber-400",   textColor: "text-amber-400/70" },
  strong: { bars: 3, color: "bg-emerald-400", textColor: "text-emerald-400/70" },
};

export function OverlayAnswerStrength() {
  const isAnswering    = useSessionStore((s) => s.is_answering);
  const wpm            = useSessionStore((s) => s.current_wpm);
  const fillerCount    = useSessionStore((s) => s.filler_count);
  const elapsedSeconds = useSessionStore((s) => s.question_elapsed_seconds);

  const strength = computeStrength(isAnswering, wpm, fillerCount, elapsedSeconds);
  const { bars, color, textColor } = STRENGTH_CONFIG[strength];

  return (
    <div className="flex items-center gap-2 px-1" title={`Answer strength: ${LABEL[strength]}`}>
      <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Strength</span>
      <div className="flex items-end gap-0.5 h-3">
        {[0, 1, 2].map((i) => {
          const filled = i < bars;
          const height = i === 0 ? "h-1.5" : i === 1 ? "h-2" : "h-3";
          return (
            <span
              key={i}
              className={cn(
                "w-1.5 rounded-sm transition-all duration-500",
                height,
                filled ? color : "bg-white/8"
              )}
            />
          );
        })}
      </div>
      <span className={cn("text-[11px] font-semibold transition-colors duration-500", textColor)}>
        {LABEL[strength]}
      </span>
    </div>
  );
}
