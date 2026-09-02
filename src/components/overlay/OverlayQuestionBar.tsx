// src/components/overlay/OverlayQuestionBar.tsx
import { Trash2, X } from "lucide-react";
import { useOverlayStore } from "@/store/overlayStore";
import { cn } from "@/lib/utils";

interface OverlayQuestionBarProps {
  question: string;
}

export function OverlayQuestionBar({ question }: OverlayQuestionBarProps) {
  const hint_history = useOverlayStore((s) => s.hint_history);
  const hint_history_index = useOverlayStore((s) => s.hint_history_index);
  const navigateHintHistory = useOverlayStore((s) => s.navigateHintHistory);
  const clearHint = useOverlayStore((s) => s.clearHint);
  const setCurrentQuestion = useOverlayStore((s) => s.setCurrentQuestion);

  const total = hint_history.length;
  const current = hint_history_index + 1;
  const hasPrev = hint_history_index > 0;
  const hasNext = hint_history_index < total - 1;

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-white/[0.06] bg-gradient-to-r from-indigo-500/[0.05] to-transparent shrink-0">
      {/* Question */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <span className="text-[11px] font-bold text-indigo-400/60 uppercase tracking-widest mt-0.5">
            Q
          </span>
          <p className="text-[12px] text-white/75 leading-snug break-words">
            {question}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5 mt-0.5">
        {total > 1 && (
          <div className="flex items-center gap-0.5 mr-1">
            <NavArrow
              direction="prev"
              disabled={!hasPrev}
              onClick={() => navigateHintHistory("prev")}
            />
            <span className="text-[10px] font-mono text-white/20">
              {current}/{total}
            </span>
            <NavArrow
              direction="next"
              disabled={!hasNext}
              onClick={() => navigateHintHistory("next")}
            />
          </div>
        )}

        <button
          onClick={() => {
            setCurrentQuestion("");
            clearHint();
          }}
          title="Clear question"
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>

        <button
          onClick={() => clearHint()}
          title="Dismiss"
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/20 hover:text-white/60 hover:bg-white/8 transition-all"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

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
        "w-5 h-5 flex items-center justify-center rounded-md text-[11px] transition-all",
        disabled
          ? "text-white/10 cursor-not-allowed"
          : "text-white/40 hover:text-white hover:bg-white/8"
      )}
    >
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}
