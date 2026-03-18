import { MessageSquare } from "lucide-react";

interface OverlayQuestionBarProps {
  question: string;
}

export function OverlayQuestionBar({ question }: OverlayQuestionBarProps) {
  return (
    <div className="px-4 py-2.5 border-b border-white/5 bg-brand-500/5 animate-fade-in">
      <div className="flex items-start gap-2">
        <MessageSquare className="w-3 h-3 text-brand-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-brand-400/60 font-semibold mb-0.5">
            Detected Question
          </p>
          <p className="text-xs text-overlay-text leading-relaxed line-clamp-3">
            {question}
          </p>
        </div>
      </div>
    </div>
  );
}
