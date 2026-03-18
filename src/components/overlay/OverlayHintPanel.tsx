import { useMemo } from "react";
import { composeHint, splitInlineCode, truncateForStealth } from "@/lib/overlay/overlayCompositor";
import type { HintState } from "@/store/overlayStore";
import type { HintStyle } from "@/types/user.types";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface OverlayHintPanelProps {
  text: string;
  hintStyle: HintStyle;
  hintState: HintState;
  errorMessage: string | null;
  screenshotHint: string | null;
  isScreenshotLoading: boolean;
}

export function OverlayHintPanel({
  text,
  hintStyle,
  hintState,
  errorMessage,
  screenshotHint,
  isScreenshotLoading,
}: OverlayHintPanelProps) {
  const composed = useMemo(
    () => composeHint(text || "", hintStyle),
    [text, hintStyle]
  );

  const isStreaming = hintState === "streaming";
  const isGenerating = hintState === "generating";
  const isIdle = hintState === "idle" || hintState === "listening";
  const isOffline = hintState === "offline_fallback";

  return (
    <div className="flex-1 overflow-y-auto scroll-container px-4 py-3 min-h-[60px] max-h-[380px]">
      {/* Error */}
      {errorMessage && (
        <div className="text-xs text-destructive/80 bg-destructive/10 rounded-lg px-3 py-2 mb-2">
          {errorMessage}
        </div>
      )}

      {/* Screenshot loading */}
      {isScreenshotLoading && (
        <div className="flex items-center gap-2 text-xs text-brand-300/70 mb-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Analysing coding problem…
        </div>
      )}

      {/* Screenshot hint */}
      {screenshotHint && !isScreenshotLoading && (
        <div className="mb-3 p-2.5 rounded-lg bg-brand-500/10 border border-brand-500/20">
          <p className="text-[10px] text-brand-300 font-semibold mb-1">📸 Coding Analysis</p>
          <p className="text-xs text-overlay-text whitespace-pre-wrap">{screenshotHint}</p>
        </div>
      )}

      {/* Generating spinner */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-xs text-brand-300/60 animate-fade-in">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
          <span>Generating{hintStyle === "full_answer" ? " answer" : " hints"}…</span>
        </div>
      )}

      {/* Idle state */}
      {isIdle && !errorMessage && !screenshotHint && (
        <p className="text-xs text-muted-foreground/40 italic">
          Listening for questions…
        </p>
      )}

      {/* Offline badge */}
      {isOffline && (
        <div className="text-[9px] text-warning/60 font-mono mb-2">
          ⚡ OFFLINE TEMPLATE — real answer queued
        </div>
      )}

      {/* Hint content */}
      {composed.lines.length > 0 && (
        <div className="space-y-1">
          {composed.lines.map((line, i) => {
            if (line.type === "blank") return <div key={i} className="h-2" />;

            if (line.type === "header") {
              return (
                <p key={i} className="text-xs font-semibold text-overlay-text mt-1">
                  {line.content}
                </p>
              );
            }

            if (line.type === "keyword") {
              return (
                <span
                  key={i}
                  className="inline-block mr-1.5 mb-1 px-2 py-0.5 text-[11px] font-medium text-brand-300 bg-brand-500/15 border border-brand-500/20 rounded-md"
                >
                  {line.content}
                </span>
              );
            }

            if (line.type === "code") {
              return (
                <pre key={i} className="text-[11px] font-mono text-brand-200 bg-black/30 rounded px-2 py-0.5">
                  {line.content}
                </pre>
              );
            }

            if (line.type === "bullet") {
              return (
                <div key={i} className="flex gap-1.5 text-xs text-overlay-text" style={{ paddingLeft: line.indent * 12 }}>
                  <span className="text-brand-400 shrink-0">•</span>
                  <span>
                    {splitInlineCode(line.content).map((part, j) =>
                      part.isCode ? (
                        <code key={j} className="text-[11px] px-1 py-0.5 bg-black/30 rounded font-mono text-brand-200">
                          {part.text}
                        </code>
                      ) : (
                        <span key={j}>{part.text}</span>
                      )
                    )}
                  </span>
                </div>
              );
            }

            // text
            return (
              <p key={i} className={cn("text-xs text-overlay-text leading-relaxed", line.bold && "font-semibold")}>
                {splitInlineCode(line.content).map((part, j) =>
                  part.isCode ? (
                    <code key={j} className="text-[11px] px-1 py-0.5 bg-black/30 rounded font-mono text-brand-200">
                      {part.text}
                    </code>
                  ) : (
                    <span key={j}>{part.text}</span>
                  )
                )}
              </p>
            );
          })}

          {/* Streaming cursor */}
          {isStreaming && <span className="stream-cursor text-xs" />}
        </div>
      )}
    </div>
  );
}
