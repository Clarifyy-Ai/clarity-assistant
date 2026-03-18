import { useRef, useEffect } from "react";
import { useAudioStore } from "@/store/audioStore";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// LiveTranscriptStream
// Real-time transcript display with speaker labels
// ─────────────────────────────────────────────────────────────────

export function LiveTranscriptStream() {
  const { transcript } = useAudioStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.utterances.length, transcript.interim_text]);

  return (
    <div className="h-48 overflow-y-auto scroll-container space-y-1.5 font-mono text-xs">
      {transcript.utterances.length === 0 && !transcript.interim_text && (
        <p className="text-muted-foreground/40 italic">Waiting for speech…</p>
      )}

      {transcript.utterances.map((u) => (
        <div key={u.id} className="flex gap-2">
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wider w-16",
              u.speaker === "interviewer" ? "text-warning/70" : "text-brand-400/70"
            )}
          >
            {u.speaker === "interviewer" ? "THEM" : "YOU"}
          </span>
          <span
            className={cn(
              "text-muted-foreground leading-relaxed",
              u.is_interviewer_question && "text-warning/80 font-medium"
            )}
          >
            {u.text}
          </span>
        </div>
      ))}

      {/* Interim (partial) text */}
      {transcript.interim_text && (
        <div className="flex gap-2 opacity-50">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider w-16 text-muted-foreground/40">
            …
          </span>
          <span className="text-muted-foreground/60 italic">
            {transcript.interim_text}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
