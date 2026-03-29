// src/components/overlay/OverlayQuestionPreview.tsx
import { useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { ChevronDown, ChevronRight, History, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUNCATE = 62;
const trim = (s: string) => s.length > TRUNCATE ? s.slice(0, TRUNCATE - 1) + "…" : s;

export function OverlayQuestionPreview() {
  const [open, setOpen] = useState(false);

  const hintHistory  = useOverlayStore((s) => s.hint_history);
  const activeTab    = useOverlayStore((s) => s.active_tab);
  const sessionMode  = useSessionStore((s) => s.mode);
  const questions    = useSessionStore((s) => s.questions);
  const currentIndex = useSessionStore((s) => s.current_question_index);

  if (activeTab !== "answer" && activeTab !== "chat") return null;

  const recentQs = hintHistory
    .slice(-3)
    .reverse()
    .map((h) => h.question)
    .filter(Boolean);

  const upcomingQs = sessionMode === "mock"
    ? questions
        .slice(currentIndex + 1, currentIndex + 3)
        .map((q) => q.question_text ?? "")
        .filter(Boolean)
    : [];

  const hasContent = recentQs.length > 0 || upcomingQs.length > 0;

  if (!hasContent) return null;

  return (
    <div className="border-b border-white/[0.05] shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/25 hover:text-white/45 transition-colors"
      >
        <ChevronDown className={cn("w-2.5 h-2.5 transition-transform duration-200", !open && "-rotate-90")} />
        <span className="uppercase tracking-widest font-bold">Q Preview</span>
        {!open && (
          <span className="ml-auto font-mono text-white/20">
            {recentQs.length + upcomingQs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-2.5 space-y-2">
          {upcomingQs.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ListOrdered className="w-2.5 h-2.5 text-indigo-400/50" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/45">
                  Upcoming
                </span>
              </div>
              <ul className="space-y-1">
                {upcomingQs.map((q, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/55">
                    <span className="shrink-0 text-indigo-400/45 font-mono mt-0.5">{i + 1}.</span>
                    <span>{trim(q)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recentQs.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <History className="w-2.5 h-2.5 text-white/20" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">
                  Recent
                </span>
              </div>
              <ul className="space-y-0.5">
                {recentQs.map((q, i) => (
                  <li key={i} className={cn(
                    "text-[11px]",
                    i === 0 ? "text-white/50" : "text-white/20"
                  )}>
                    {trim(q)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
