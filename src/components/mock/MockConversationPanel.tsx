// ✅ FIX P2-A: Alternating interviewer / candidate turns from audioStore.
// Mobile-first: taller scroll area, larger bubbles, sticky live transcript.

import { memo, useEffect, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export interface MockConversationPanelProps {
  currentQuestion?: string;
  answerStatus?: string;
  answerStatusLabel?: string;
}

export const MockConversationPanel = memo(function MockConversationPanel({
  currentQuestion,
  answerStatus,
  answerStatusLabel,
}: MockConversationPanelProps) {
  const utterances = useAudioStore((s) => s.transcript?.utterances ?? []);
  const interim = useAudioStore((s) => s.transcript?.interim_text ?? "");
  const isMobile = useIsMobile();
  const bottomRef = useRef<HTMLDivElement>(null);

  const finals = utterances.filter((u) => u.is_final);
  const questionInTranscript = Boolean(
    currentQuestion?.trim() &&
      finals.some((u) => u.speaker === "interviewer" && u.text.trim() === currentQuestion.trim()),
  );
  const showQuestionBubble = Boolean(currentQuestion?.trim() && !questionInTranscript);
  const statusText = answerStatusLabel || answerStatus;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [finals.length, interim, currentQuestion]);

  if (finals.length === 0 && !interim.trim() && !showQuestionBubble) {
    return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground italic text-center">
          Conversation transcript will appear here as you practice.
        </p>
        {statusText && (
          <p className="text-[10px] text-muted-foreground text-center" data-testid="mock-conversation-status">
            Status: <span className="text-foreground font-medium">{statusText}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "space-y-3 overflow-y-auto pr-1",
          isMobile ? "max-h-[min(55vh,420px)] min-h-[200px]" : "max-h-48",
        )}
        role="log"
        aria-live="polite"
        aria-label="Conversation transcript"
      >
        {showQuestionBubble && (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 leading-relaxed border",
              isMobile ? "text-sm" : "text-xs",
              "bg-amber-500/10 border-amber-500/25 text-foreground ml-0 mr-4 sm:mr-6",
            )}
            data-testid="mock-conversation-current-question"
          >
            <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-70">
              Interviewer
            </span>
            {currentQuestion}
          </div>
        )}
        {finals.map((u) => (
        <div
          key={u.id}
          className={cn(
            "rounded-2xl px-3.5 py-2.5 leading-relaxed border",
            isMobile ? "text-sm" : "text-xs",
            u.speaker === "interviewer"
              ? "bg-amber-500/10 border-amber-500/25 text-foreground ml-0 mr-4 sm:mr-6"
              : "bg-primary/10 border-primary/25 text-foreground ml-4 sm:ml-6 mr-0",
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
      {statusText && (
        <p className="text-[10px] text-muted-foreground" data-testid="mock-conversation-status">
          Status: <span className="text-foreground font-medium">{statusText}</span>
        </p>
      )}
    </div>
  );
});
