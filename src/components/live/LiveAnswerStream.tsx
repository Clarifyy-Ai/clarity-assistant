import { useMemo } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { composeHint } from "@/lib/overlay/overlayCompositor";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// LiveAnswerStream
// In-page (non-overlay) streaming answer display for the
// LiveRehearsal page. Shows same content as overlay hint panel.
// ─────────────────────────────────────────────────────────────────

export function LiveAnswerStream() {
  // Individual selectors — avoids re-renders from unrelated store ticks
  const current_hint     = useOverlayStore((s) => s.current_hint);
  const streaming_buffer = useOverlayStore((s) => s.streaming_buffer);
  const hint_state       = useOverlayStore((s) => s.hint_state);
  const hint_style       = useOverlayStore((s) => s.hint_style);
  const error_message    = useOverlayStore((s) => s.error_message);

  const text = hint_state === "streaming" ? streaming_buffer : current_hint;

  // Compose hint only when text or style changes
  const composed = useMemo(
    () => composeHint(text || "", hint_style),
    [text, hint_style]
  );

  const isStreaming  = hint_state === "streaming";
  const isGenerating = hint_state === "generating";

  // Idle / waiting state
  if (hint_state === "idle" || hint_state === "listening") {
    return (
      <div className="py-4 text-xs italic text-muted-foreground/40">
        Waiting for question detection…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Error banner */}
      {error_message && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error_message}
        </div>
      )}

      {/* Generating banner */}
      {isGenerating && (
        <div
          className="flex items-center gap-2 py-2 text-xs text-brand-300"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating…
        </div>
      )}

      {/* Content */}
      {composed?.lines?.length ? (
        <div className="space-y-1 text-sm text-foreground/80">
          {composed.lines.map((line, i) => {
            if (line.type === "blank") {
              return <div key={`blank-${i}`} className="h-1.5" />;
            }
            if (line.type === "header") {
              return (
                <p key={`hdr-${i}`} className="text-sm font-semibold text-foreground">
                  {line.content}
                </p>
              );
            }
            if (line.type === "keyword") {
              return (
                <span
                  key={`kw-${i}`}
                  className="mr-1.5 mb-1 inline-block rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-300"
                >
                  {line.content}
                </span>
              );
            }
            if (line.type === "bullet") {
              return (
                <div
                  key={`bul-${i}`}
                  className="flex gap-1.5 text-sm text-foreground/80"
                  style={{ paddingLeft: (line.indent ?? 0) * 12 }}
                >
                  <span className="shrink-0 text-brand-400">•</span>
                  <span>{line.content}</span>
                </div>
              );
            }
            // default paragraph
            return (
              <p
                key={`p-${i}`}
                className={cn(
                  "text-sm leading-relaxed",
                  line.bold && "font-semibold"
                )}
              >
                {line.content}
              </p>
            );
          })}
          {isStreaming && <span className="stream-cursor text-sm" />}
        </div>
      ) : (
        // Fallback if composed is empty but we're in a non-idle state
        !isGenerating &&
        !error_message && (
          <div className="py-2 text-xs text-muted-foreground/60">
            No hint generated yet.
          </div>
        )
      )}
    </div>
  );
}
