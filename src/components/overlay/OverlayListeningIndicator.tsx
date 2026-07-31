// src/components/overlay/OverlayListeningIndicator.tsx
import { memo } from "react";
import { MicOff, AlertCircle, Pause } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

type ListeningState = "listening" | "paused" | "muted" | "error" | "idle";

export const OverlayListeningIndicator = memo(function OverlayListeningIndicator() {
  const isMuted = useAudioStore((s) => s.is_muted);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);
  const deepgram = useAudioStore((s) => s.deepgram_status);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const currentLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const sessionStatus = useSessionStore((s) => s.status);

  let state: ListeningState = "idle";
  let label = "Idle";
  let detail: string | undefined;

  if (streamError?.message) {
    state = "error";
    label = "Error";
    detail = streamError.message;
  } else if (isMuted) {
    state = "muted";
    label = "Muted";
  } else if (sessionStatus === "paused") {
    state = "paused";
    label = "Paused";
  } else if (
    sessionStatus === "active" &&
    (deepgram === "connected" || isCapturing)
  ) {
    state = "listening";
    label = "Listening";
    detail = "Hints typically appear in ~2–4s after a clear question";
  } else if (sessionStatus === "active" || sessionStatus === "warming_up") {
    state = "idle";
    label = "Connecting…";
  }

  const announced = detail ? `${label}: ${detail}` : label;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold shrink-0",
        state === "listening" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        state === "paused" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
        state === "muted" && "border-red-500/30 bg-red-500/10 text-red-300",
        state === "error" && "border-red-500/40 bg-red-500/15 text-red-300",
        state === "idle" && "border-white/10 bg-white/[0.04] text-white/45",
      )}
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      title={detail ?? label}
      data-coach="listening-indicator"
    >
      <span className="sr-only">{announced}</span>
      {state === "muted" ? (
        <MicOff className="w-2.5 h-2.5" aria-hidden />
      ) : state === "paused" ? (
        <Pause className="w-2.5 h-2.5" aria-hidden />
      ) : state === "error" ? (
        <AlertCircle className="w-2.5 h-2.5" aria-hidden />
      ) : (
        <span className="flex items-end gap-0.5 h-3" aria-hidden>
          {[0.35, 0.65, 1, 0.5].map((base, i) => {
            const active = state === "listening";
            const h = active
              ? Math.max(4, Math.min(12, (currentLevel / 100) * 12 * base + (i % 2) * 2))
              : 4 + i;
            return (
              <span
                key={i}
                className={cn(
                  "w-0.5 rounded-sm transition-all duration-150",
                  active ? "bg-emerald-400 animate-pulse" : "bg-white/20",
                )}
                style={{
                  height: `${h}px`,
                  animationDelay: active ? `${i * 80}ms` : undefined,
                }}
              />
            );
          })}
        </span>
      )}
      <span aria-hidden="true">{label}</span>
    </div>
  );
});
