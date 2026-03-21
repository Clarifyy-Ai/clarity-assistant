import { useEffect, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// LiveTranscriptStream
// Real-time transcript display with speaker labels
// ─────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LiveTranscriptStream() {
  const transcript = useAudioStore((s) => s.transcript);

  // Fallbacks in case the store is not yet hydrated
  const utterances = transcript?.utterances ?? [];
  const interim = transcript?.interim_text ?? "";

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new content arrives:
  // - If the user is near the bottom, smooth-scroll
  // - If the user has scrolled up to read, do not force scrolling
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !bottomRef.current) return;

    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

    const isNearBottom = distanceFromBottom < 48; // px threshold
    bottomRef.current.scrollIntoView({
      behavior: isNearBottom ? "smooth" : "auto",
      block: "end",
    });
  }, [utterances.length, interim]);

  return (
    <div
      ref={scrollRef}
      className="scroll-container h-48 space-y-1.5 overflow-y-auto font-mono text-xs"
    >
      {utterances.length === 0 && !interim && (
        <p className="italic text-muted-foreground/40">Waiting for speech…</p>
      )}

      {utterances.map((u) => (
        <div key={u.id} className="flex gap-2">
          <span className="w-10 shrink-0 text-[9px] font-mono tabular-nums text-muted-foreground/30">
            {formatTimestamp(u.start_ms)}
          </span>
          <span
            className={cn(
              "w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider",
              u.speaker === "interviewer"
                ? "text-warning/70"
                : "text-brand-400/70"
            )}
          >
            {u.speaker === "interviewer" ? "THEM" : "YOU"}
          </span>
          <span
            className={cn(
              "leading-relaxed text-muted-foreground",
              u.is_interviewer_question && "text-warning/80 font-medium"
            )}
          >
            {u.text}
          </span>
        </div>
      ))}

      {/* Interim (partial) text */}
      {interim && (
        <div className="flex gap-2 opacity-50">
          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            …
          </span>
          <span className="italic text-muted-foreground/60">{interim}</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
