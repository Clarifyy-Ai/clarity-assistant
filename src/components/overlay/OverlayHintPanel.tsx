import { useMemo } from "react";
import { composeHint, splitInlineCode } from "@/lib/overlay/overlayCompositor";
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
  const composed = useMemo(() => composeHint(text || "", hintStyle), [text, hintStyle]);

  const isStreaming = hintState === "streaming";
  const isGenerating = hintState === "generating";
  const isIdle = hintState === "idle" || hintState === "listening";
  const isOffline = hintState === "offline_fallback";

  return (
    <div className="scroll-container min-h-[60px] max-h-[380px] flex-1 overflow-y-auto px-4 py-3">
      {/* Error */}
      {errorMessage && (
        <div
          className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive/80"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {/* Screenshot loading */}
      {isScreenshotLoading && (
        <div
          className="mb-2 flex items-center gap-2 text-xs text-brand-300/70"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Analysing coding problem…
        </div>
      )}

      {/* Screenshot hint */}
      {screenshotHint && !isScreenshotLoading && (
        <div className="mb-3 rounded-lg border border-brand-500/20 bg-brand-500/10 p-2.5">
          <p className="mb-1 text-[10px] font-semibold text-brand-300">📸 Coding Analysis</p>
          <p className="whitespace-pre-wrap text-xs text-overlay-text">{screenshotHint}</p>
        </div>
      )}

      {/* Generating spinner */}
      {isGenerating && (
        <div
          className="animate-fade-in flex items-center gap-2 text-xs text-brand-300/60"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
          <span>Generating{hintStyle === "full_answer" ? " answer" : " hints"}…</span>
        </div>
      )}

      {/* Idle state */}
      {isIdle && !errorMessage && !screenshotHint && (
        <p className="text-xs italic text-muted-foreground/40">Listening for questions…</p>
      )}

      {/* Offline badge */}
      {isOffline && (
        <div className="mb-2 font-mono text-[9px] text-warning/60">
          ⚡ OFFLINE TEMPLATE — real answer queued
        </div>
      )}

      {/* Hint content */}
      {!!composed?.lines?.length && (
        <div className="space-y-1">
          {composed.lines.map((line, i) => {
            if (line.type === "blank") return <div key={`blank-${i}`} className="h-2" />;

            if (line.type === "header") {
              return (
                <p key={`hdr-${i}`} className="mt-1 text-xs font-semibold text-overlay-text">
                  {line.content}
                </p>
              );
            }

            if (line.type === "keyword") {
              return (
                <span
                  key={`kw-${i}`}
                  className="mr-1.5 mb-1 inline-block rounded-md border border-brand-500/20 bg-brand-500/15 px-2 py-0.5 text-[11px] font-medium text-brand-300"
                >
                  {line.content}
                </span>
              );
            }

            if (line.type === "code") {
              return (
                <pre
                  key={`code-${i}`}
                  className="rounded bg-black/30 px-2 py-0.5 font-mono text-[11px] text-brand-200"
                >
                  {line.content}
                </pre>
              );
            }

            if (line.type === "bullet") {
              return (
                <div
                  key={`bul-${i}`}
                  className="flex gap-1.5 text-xs text-overlay-text"
                  style={{ paddingLeft: (line.indent ?? 0) * 12 }}
                >
                  <span className="shrink-0 text-brand-400">•</span>
                  <span>
                    {splitInlineCode(line.content).map((part, j) =>
                      part.isCode ? (
                        <code
                          key={`bulcode-${i}-${j}`}
                          className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-brand-200"
                        >
                          {part.text}
                        </code>
                      ) : (
                        <span key={`bultxt-${i}-${j}`}>{part.text}</span>
                      )
                    )}
                  </span>
                </div>
              );
            }

            // default text
            return (
              <p
                key={`p-${i}`}
                className={cn(
                  "text-xs leading-relaxed text-overlay-text",
                  line.bold && "font-semibold"
                )}
              >
                {splitInlineCode(line.content).map((part, j) =>
                  part.isCode ? (
                    <code
                      key={`pcode-${i}-${j}`}
                      className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-brand-200"
                    >
                      {part.text}
                    </code>
                  ) : (
                    <span key={`ptxt-${i}-${j}`}>{part.text}</span>
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
