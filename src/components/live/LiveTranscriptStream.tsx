import { memo, useEffect, useRef } from "react";
import { useAudioStore } from "@/store/audioStore";
import { cn } from "@/lib/utils";
import type { TranscriptUtterance } from "@/types/audio.types";

const EMPTY_UTTERANCES: TranscriptUtterance[] = [];

// ─────────────────────────────────────────────────────────────────
// LiveTranscriptStream
// Real-time transcript display with speaker labels and smart
// auto-scroll that respects user-initiated scroll position.
// ─────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function LiveTranscriptStreamInner() {
  const utterances = useAudioStore((s) => s.transcript?.utterances ?? EMPTY_UTTERANCES);
  const interim = useAudioStore((s) => s.transcript?.interim_text ?? "");

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !bottomRef.current) return;

    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

    const isNearBottom = distanceFromBottom < 48;

    // FIX: only scroll when the user is near the bottom.
    // Previously, scrollIntoView was always called (with behavior "auto"
    // when far from bottom), which forced the view back to the bottom even
    // when the user deliberately scrolled up to read earlier utterances.
    if (!isNearBottom) return;

    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [utterances.length, interim]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-[8rem] space-y-1.5 overflow-y-auto font-mono text-xs"
      style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
    >
      {utterances.length === 0 && !interim && (
        <p className="italic" style={{ color: "rgba(255,255,255,0.2)" }}>
          Waiting for speech…
        </p>
      )}

      {utterances.map((u) => (
        <div key={u.id} className="flex gap-2">
          <span
            className="w-10 shrink-0 text-[9px] font-mono tabular-nums"
            style={{ color: "rgba(255,255,255,0.18)" }}
          >
            {formatTimestamp(u.start_ms)}
          </span>
          <span
            className={cn(
              "w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider",
              u.speaker === "interviewer" ? "text-amber-400/70" : "text-blue-400/70",
            )}
          >
            {u.speaker === "interviewer" ? "THEM" : "YOU"}
          </span>
          <span
            className={cn(
              "leading-relaxed",
              u.is_interviewer_question
                ? "text-amber-300/80 font-medium"
                : "text-white/55",
            )}
            aria-label="Final transcript"
          >
            {u.text}
          </span>
        </div>
      ))}

      {/* Interim (partial) text */}
      {interim && (
        <div className="flex gap-2 opacity-40">
          <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            …
          </span>
          <span
            className="italic"
            style={{ color: "rgba(255,255,255,0.45)" }}
            aria-label="Interim transcript — not final"
          >
            {interim}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export const LiveTranscriptStream = memo(LiveTranscriptStreamInner);
