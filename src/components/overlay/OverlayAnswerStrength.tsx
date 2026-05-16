// src/components/overlay/OverlayAnswerStrength.tsx
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

function computeStrength(
  isAnswering: boolean,
  wpm: number,
  fillerCount: number,
  elapsedSeconds: number
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

const LABEL = {
  off: "…",
  weak: "Weak",
  ok: "Good",
  strong: "Strong",
};

const CONFIG = {
  off: { bars: 0, color: "bg-white/10", text: "text-white/20" },
  weak: { bars: 1, color: "bg-red-500", text: "text-red-400/70" },
  ok: { bars: 2, color: "bg-amber-400", text: "text-amber-400/70" },
  strong: { bars: 3, color: "bg-emerald-400", text: "text-emerald-400/70" },
};

export function OverlayAnswerStrength() {
  const isAnswering = useSessionStore((s) => s.is_answering ?? false);
  const wpm = useSessionStore((s) => s.current_wpm ?? 0);
  const fillerCount = useSessionStore((s) => s.filler_count ?? 0);
  const elapsed = useSessionStore((s) => s.question_elapsed_seconds ?? 0);

  const strength = computeStrength(isAnswering, wpm, fillerCount, elapsed);
  const { bars, color, text } = CONFIG[strength];

  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-[10px] font-bold text-white/20 uppercase">
        Strength
      </span>

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

      <span className={cn("text-[11px] font-semibold", text)}>
        {LABEL[strength]}
      </span>
    </div>
  );
}
