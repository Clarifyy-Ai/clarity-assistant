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
    <div className="border-b border-white/5 shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-[9px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
      >
        {open ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        <span className="uppercase tracking-wide font-semibold">
          Q Preview
        </span>
        {!open && (
          <span className="ml-auto font-mono opacity-60">
            {recentQs.length + upcomingQs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-2 space-y-2">
          {upcomingQs.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <ListOrdered className="w-2.5 h-2.5 text-brand-400/50" />
                <span className="text-[8px] font-semibold uppercase tracking-wider text-brand-300/50">
                  Upcoming
                </span>
              </div>
              <ul className="space-y-0.5">
                {upcomingQs.map((q, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-overlay-text/70">
                    <span className="shrink-0 text-brand-400/50 font-mono mt-0.5">{i + 1}.</span>
                    <span>{trim(q)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recentQs.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <History className="w-2.5 h-2.5 text-muted-foreground/40" />
                <span className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                  Recent
                </span>
              </div>
              <ul className="space-y-0.5">
                {recentQs.map((q, i) => (
                  <li key={i} className={cn(
                    "text-[10px]",
                    i === 0 ? "text-overlay-text/60" : "text-muted-foreground/30"
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
