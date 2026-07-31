// ✅ FIX P2-A: Alternating interviewer / candidate turns from audioStore.
// Mobile-first: taller scroll area, larger bubbles, sticky live transcript.

import { memo, useEffect, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export const MockConversationPanel = memo(function MockConversationPanel() {
  const utterances = useAudioStore((s) => s.transcript?.utterances ?? []);
  const interim = useAudioStore((s) => s.transcript?.interim_text ?? "");
  const isMobile = useIsMobile();
  const bottomRef = useRef<HTMLDivElement>(null);

  const finals = utterances.filter((u) => u.is_final);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [finals.length, interim]);

  if (finals.length === 0 && !interim.trim()) {
    return (
      <p className="text-sm text-muted-foreground italic py-4 text-center">
        Conversation transcript will appear here as you practice.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 overflow-y-auto pr-1",
        isMobile ? "max-h-[min(55vh,420px)] min-h-[200px]" : "max-h-48",
      )}
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {finals.map((u) => (
        <div
          key={u.id}
          className={cn(
            "rounded-2xl px-3.5 py-2.5 leading-relaxed border",
            isMobile ? "text-sm" : "text-xs",
            u.speaker === "interviewer"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-100/90 ml-0 mr-4 sm:mr-6"
              : "bg-blue-500/10 border-blue-500/20 text-blue-100/90 ml-4 sm:ml-6 mr-0",
          )}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-70">
            {u.speaker === "interviewer" ? "Interviewer" : "You"}
          </span>
          {u.text}
        </div>
      ))}
      {interim.trim() && (
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 italic text-muted-foreground border border-dashed border-border ml-4 sm:ml-6",
            isMobile ? "text-sm" : "text-xs",
          )}
        >
          You (speaking…) {interim}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
});
