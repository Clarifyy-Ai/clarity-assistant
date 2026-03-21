import { useMemo, useState, useCallback } from "react";
import { composeHint, splitInlineCode } from "@/lib/overlay/overlayCompositor";
import { useOverlayStore } from "@/store/overlayStore";
import type { HintState } from "@/store/overlayStore";
import type { HintStyle } from "@/types/user.types";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Loader2, Copy, Check, BookmarkPlus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

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
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const historyLen   = useOverlayStore((s) => s.hint_history.length);
  const historyIndex = useOverlayStore((s) => s.hint_history_index);

  const isStreaming = hintState === "streaming";
  const isGenerating = hintState === "generating";
  const isIdle = hintState === "idle" || hintState === "listening";
  const isOffline = hintState === "offline_fallback";
  const hasContent = !!text;

  const handleCopy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const handleSaveToBank = useCallback(async () => {
    if (!text) return;
    const question = useOverlayStore.getState().current_question ?? "Untitled";
    const userId = useAuthStore.getState().profile?.id;

    const entry = {
      question,
      answer: text,
      saved_at: new Date().toISOString(),
    };

    if (userId) {
      try {
        await supabase.from("answer_bank").insert({
          user_id:       userId,
          question_text: question,
          answer_text:   text,
        });
      } catch {
        const existing = JSON.parse(localStorage.getItem("clarify:answer_bank") ?? "[]");
        existing.push(entry);
        localStorage.setItem("clarify:answer_bank", JSON.stringify(existing));
      }
    } else {
      const existing = JSON.parse(localStorage.getItem("clarify:answer_bank") ?? "[]");
      existing.push(entry);
      localStorage.setItem("clarify:answer_bank", JSON.stringify(existing));
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [text]);

  return (
    <div className={cn(
      "scroll-container min-h-[60px] flex-1 overflow-y-auto px-4 py-3",
      expanded ? "max-h-none" : "max-h-[380px]"
    )}>
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

      {hasContent && !isStreaming && !isGenerating && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-white/5 pt-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground rounded-lg hover:bg-white/5 transition-all"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={handleSaveToBank}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground rounded-lg hover:bg-white/5 transition-all"
            title="Save to answer bank"
          >
            {saved ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <BookmarkPlus className="w-2.5 h-2.5" />}
            {saved ? "Saved" : "Save"}
          </button>

          {historyLen > 1 && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => useOverlayStore.getState().navigateHintHistory("prev")}
                disabled={historyIndex <= 0}
                className="p-0.5 rounded hover:bg-white/5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Previous hint"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[9px] font-mono text-muted-foreground/50 min-w-[24px] text-center">
                {historyIndex + 1}/{historyLen}
              </span>
              <button
                onClick={() => useOverlayStore.getState().navigateHintHistory("next")}
                disabled={historyIndex >= historyLen - 1}
                className="p-0.5 rounded hover:bg-white/5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Next hint"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex-1" />
          <button
            onClick={() => setExpanded((p) => !p)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground rounded-lg hover:bg-white/5 transition-all"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            {expanded ? "Less" : "More"}
          </button>
        </div>
      )}
    </div>
  );
}
