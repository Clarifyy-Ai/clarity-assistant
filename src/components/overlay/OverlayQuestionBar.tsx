// src/components/overlay/OverlayQuestionBar.tsx
import { Trash2, X } from "lucide-react";
import { useOverlayStore } from "@/store/overlayStore";
import { cn } from "@/lib/utils";

interface OverlayQuestionBarProps {
  question: string;
}

export function OverlayQuestionBar({ question }: OverlayQuestionBarProps) {
  const hint_history       = useOverlayStore((s) => s.hint_history);
  const hint_history_index = useOverlayStore((s) => s.hint_history_index);
  const navigateHintHistory = useOverlayStore((s) => s.navigateHintHistory);
  const clearHint           = useOverlayStore((s) => s.clearHint);
  const setCurrentQuestion  = useOverlayStore((s) => s.setCurrentQuestion);

  const hasPrev = hint_history_index > 0;
  const hasNext = hint_history_index < hint_history.length - 1;
  const total   = hint_history.length;
  const current = hint_history_index + 1;

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 border-b border-white/8 bg-white/3 animate-fade-in shrink-0">

      {/* ── Question text ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/90 leading-snug">
          <span className="mr-1.5">💬</span>
          <span className="text-white/45 font-semibold mr-1">Question:</span>
          <span className="text-white/85">{question}</span>
        </p>
      </div>

      {/* ── Right controls ───────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 shrink-0 mt-0.5">

        {/* History navigation */}
        {total > 1 && (
          <div className="flex items-center gap-0.5 mr-1">
            <NavArrow
              direction="prev"
              disabled={!hasPrev}
              onClick={() => navigateHintHistory("prev")}
            />
            <span className="text-[10px] font-mono text-white/25 px-0.5">
              {current}/{total}
            </span>
            <NavArrow
              direction="next"
              disabled={!hasNext}
              onClick={() => navigateHintHistory("next")}
            />
          </div>
        )}

        {/* Clear question */}
        <button
          onClick={() => {
            setCurrentQuestion("");
            clearHint();
          }}
          title="Clear question"
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>

        {/* Dismiss bar */}
        <button
          onClick={() => clearHint()}
          title="Dismiss"
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/25 hover:text-white/70 hover:bg-white/8 transition-all"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Nav arrow sub-component ─────────────────────────────────────────────────
function NavArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={direction === "prev" ? "Previous question" : "Next question"}
      className={cn(
        "w-5 h-5 flex items-center justify-center rounded transition-all text-[11px]",
        disabled
          ? "text-white/15 cursor-not-allowed"
          : "text-white/50 hover:text-white hover:bg-white/8"
      )}
    >
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}
