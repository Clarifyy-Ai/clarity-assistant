// src/components/overlay/OverlayFirstRunCoach.tsx
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESPONSIBLE_USE_NOTICE } from "@/lib/overlay/responsibleUseConsent";

const STORAGE_KEY = "clarify:overlay-first-run-done-v2";

const STEPS = [
  {
    id: "responsible-use",
    title: "Use only where assistance is allowed",
    body: RESPONSIBLE_USE_NOTICE,
    anchor: "responsible-use",
  },
  {
    id: "listening",
    title: "Always know you're heard",
    body: "This chip shows Listening, Paused, Muted, or Error — so you never wonder if audio is working. Capture never starts until you begin a session.",
    anchor: "listening-indicator",
  },
  {
    id: "more-tools",
    title: "More tools when you need them",
    body: "Hints stay front and center. Open More tools for Chat, resume context, status, and settings. Always-on-top and presentation-safe mode are opt-in.",
    anchor: "more-tools",
  },
] as const;

export function OverlayFirstRunCoach() {
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setStepIndex(0), 600);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setStepIndex(null);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i == null) return null;
      if (i >= STEPS.length - 1) {
        try {
          localStorage.setItem(STORAGE_KEY, "1");
        } catch {
          // ignore
        }
        return null;
      }
      return i + 1;
    });
  }, []);

  if (stepIndex == null) return null;

  const step = STEPS[stepIndex];

  return (
    <div
      className="absolute inset-0 z-[80] pointer-events-none"
      role="dialog"
      aria-label="Overlay tips"
      aria-modal="false"
    >
      <div
        className={cn(
          "pointer-events-auto absolute left-3 right-3 max-w-sm",
          stepIndex === 0 ? "top-20" : stepIndex === 1 ? "top-24" : "top-36",
        )}
      >
        <div className="rounded-2xl border border-indigo-500/30 bg-[#12122a] shadow-[0_16px_48px_rgba(0,0,0,0.65)] p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70">
                Tip {stepIndex + 1} of {STEPS.length}
              </p>
              <p className="text-[13px] font-semibold text-white mt-0.5">{step.title}</p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="text-white/30 hover:text-white/70 p-1 rounded-lg"
              aria-label="Dismiss tips"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[12px] text-white/55 leading-relaxed">{step.body}</p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={dismiss}
              className="text-[11px] text-white/35 hover:text-white/60 px-2 py-1"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={next}
              className="text-[11px] font-semibold text-indigo-200 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 px-3 py-1.5 rounded-lg"
            >
              {stepIndex >= STEPS.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
