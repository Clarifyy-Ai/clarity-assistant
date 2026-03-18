import { useMemo } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { composeHint, splitInlineCode } from "@/lib/overlay/overlayCompositor";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// LiveAnswerStream
// In-page (non-overlay) streaming answer display for the
// LiveRehearsal page. Shows same content as overlay hint panel.
// ─────────────────────────────────────────────────────────────────

export function LiveAnswerStream() {
  const {
    current_hint,
    streaming_buffer,
    hint_state,
    hint_style,
    error_message,
  } = useOverlayStore();

  const text = hint_state === "streaming" ? streaming_buffer : current_hint;
  const composed = useMemo(() => composeHint(text || "", hint_style), [text, hint_style]);
  const isStreaming = hint_state === "streaming";
  const isGenerating = hint_state === "generating";

  if (hint_state === "idle" || hint_state === "listening") {
    return (
      <div className="text-xs text-muted-foreground/40 italic py-4">
        Waiting for question detection…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error_message && (
        <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          {error_message}
        </div>
      )}

      {isGenerating && (
        <div className="flex items-center gap-2 text-xs text-brand-300 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating…
        </div>
      )}

      {composed.lines.length > 0 && (
        <div className="space-y-1 text-sm text-foreground/80">
          {composed.lines.map((line, i) => {
            if (line.type === "blank") return <div key={i} className="h-1.5" />;
            if (line.type === "header") return <p key={i} className="text-sm font-semibold text-foreground">{line.content}</p>;
            if (line.type === "keyword") return (
              <span key={i} className="inline-block mr-1.5 mb-1 px-2 py-0.5 text-xs font-medium text-brand-300 bg-brand-500/10 rounded-md">
                {line.content}
              </span>
            );
            if (line.type === "bullet") return (
              <div key={i} className="flex gap-1.5 text-sm text-foreground/80" style={{ paddingLeft: line.indent * 12 }}>
                <span className="text-brand-400 shrink-0">•</span>
                <span>{line.content}</span>
              </div>
            );
            return <p key={i} className={cn("text-sm leading-relaxed", line.bold && "font-semibold")}>{line.content}</p>;
          })}
          {isStreaming && <span className="stream-cursor text-sm" />}
        </div>
      )}
    </div>
  );
}
