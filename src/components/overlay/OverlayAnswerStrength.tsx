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

const DOT_CONFIG = {
  off:    { dots: [false, false, false], color: "bg-gray-600" },
  weak:   { dots: [true,  false, false], color: "bg-red-500" },
  ok:     { dots: [true,  true,  false], color: "bg-amber-400" },
  strong: { dots: [true,  true,  true],  color: "bg-emerald-400" },
};

const LABEL = { off: "…", weak: "Weak", ok: "Good", strong: "Strong" };

export function OverlayAnswerStrength() {
  const isAnswering      = useSessionStore((s) => s.is_answering);
  const wpm              = useSessionStore((s) => s.current_wpm);
  const fillerCount      = useSessionStore((s) => s.filler_count);
  const elapsedSeconds   = useSessionStore((s) => s.question_elapsed_seconds);

  const strength = computeStrength(isAnswering, wpm, fillerCount, elapsedSeconds);
  const { dots, color } = DOT_CONFIG[strength];

  return (
    <div className="flex items-center gap-1.5 px-1" title={`Answer strength: ${LABEL[strength]}`}>
      <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-wide">
        Strength
      </span>
      <div className="flex items-center gap-0.5">
        {dots.map((filled, i) => (
          <span
            key={i}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all duration-500",
              filled ? color : "bg-white/10",
            )}
          />
        ))}
      </div>
      <span className={cn(
        "text-[8px] font-mono transition-colors duration-500",
        strength === "strong" ? "text-emerald-400/70" :
        strength === "ok"     ? "text-amber-400/70"   :
        strength === "weak"   ? "text-red-400/70"     :
        "text-muted-foreground/30"
      )}>
        {LABEL[strength]}
      </span>
    </div>
  );
}
