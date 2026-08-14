// src/components/overlay/OverlayHintPanel.tsx
import { memo, useMemo, useState, useCallback, useEffect } from "react";
import type { HintStyle } from "@/types/user.types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { answerBankDB } from "@/lib/supabase/database";
import { markFirstHint } from "@/lib/analytics/uxMetrics";
import {
  Loader2,
  Copy,
  Check,
  BookmarkPlus,
  FileText,
  Pin,
  Sparkles,
  Zap,
  AlignLeft,
  ChevronRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { OverlayAnswerStrength } from "./OverlayAnswerStrength";
import { checkCreditsForAction, SERVER_AI_CREDIT_COSTS } from "@/lib/billing/creditsManager";
import { toast } from "sonner";
import { composeHint, splitInlineCode } from "@/lib/overlay/overlayCompositor";
import { copyTextToClipboard, extractCodeFromAnswer } from "@/lib/overlay/answerTextUtils";
import { structureForMode } from "@/lib/overlay/responseFormatters";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { feedbackDB } from "@/lib/supabase/database";
import type { HintState } from "@/store/overlayStore";
import { useIsMobile } from "@/hooks/use-mobile";

const LISTENING_NO_SPEECH_MS = 12_000;

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

interface OverlayHintPanelProps {
  text: string;
  hintStyle: HintStyle;
  hintState: HintState;
  errorMessage: string | null;
  screenshotHint: string | null;
  isScreenshotLoading: boolean;
  /** Called when user clicks "Quick Hints" or "Full Answer" toggle button */
  onRequestModeChange?: (mode: HintStyle) => void;
  /** Retry AI generation after an error */
  onRetry?: () => void;
  onRegenerate?: () => void;
  onShorten?: () => void;
  onExpand?: () => void;
}

function OverlayHintPanelInner({
  text,
  hintStyle,
  hintState,
  errorMessage,
  screenshotHint,
  isScreenshotLoading,
  onRequestModeChange,
  onRetry,
  onRegenerate,
  onShorten,
  onExpand,
}: OverlayHintPanelProps) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<"up" | "down" | null>(null);

  const fontSize = useOverlayStore((s) => s.font_size);

  const historyLen = useOverlayStore((s) => s.hint_history.length);
  const historyIndex = useOverlayStore((s) => s.hint_history_index);
  const captureHistory = useOverlayStore((s) => s.capture_answer_history);
  const captureHistoryIndex = useOverlayStore((s) => s.capture_answer_index);
  const viewedQuestion = useOverlayStore((s) => s.viewed_question);
  const pinnedHints = useOverlayStore((s) => s.pinned_hints);
  const currentQ = useOverlayStore((s) => s.current_question);

  const safeText = (text ?? "").toString();
  const isPinned = safeText ? pinnedHints.some((p) => p.hint === safeText) : false;
  const isViewingHistory = historyLen > 1 && historyIndex < historyLen - 1;

  const isStreaming = hintState === "streaming";
  const isGenerating = hintState === "generating";
  const isIdle = hintState === "idle" || hintState === "listening";
  const isOffline = hintState === "offline_fallback";
  const isError = hintState === "error" || Boolean(errorMessage);

  const isHintMode = hintStyle === "short_hints" || hintStyle === "keywords_only";
  const isFullAnswerMode = hintStyle === "full_answer";

  const streamingBuffer = useOverlayStore((s) => s.streaming_buffer);
  const liveText = isStreaming && streamingBuffer.trim().length > 0 ? streamingBuffer : safeText;
  const hasContent = liveText.trim().length > 0;
  const codeExtract = useMemo(() => extractCodeFromAnswer(liveText), [liveText]);

  useEffect(() => {
    if (hasContent) markFirstHint();
  }, [hasContent]);

  const textForCompose = useMemo(() => {
    if (!liveText) return "";
    if (isHintMode) {
      return liveText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join("\n");
    }
    return liveText;
  }, [liveText, isHintMode]);

  const composed = useMemo(() => composeHint(textForCompose, hintStyle), [textForCompose, hintStyle]);
  const showCopyActions = hasContent && hintState !== "generating";

  /* ── HANDLERS ────────────────────────────────────────────────────────── */

  const handleCopy = useCallback(async () => {
    if (!liveText.trim()) return;
    const ok = await copyTextToClipboard(liveText);
    if (!ok) {
      toast.error("Could not copy — check browser permissions.");
      return;
    }
    setCopied(true);
    toast.success("Answer copied");
    setTimeout(() => setCopied(false), 2000);
  }, [liveText]);

  const handleCopyCode = useCallback(async () => {
    const code = codeExtract || liveText;
    if (!code.trim()) return;
    const ok = await copyTextToClipboard(code);
    if (!ok) {
      toast.error("Could not copy code — check browser permissions.");
      return;
    }
    setCodeCopied(true);
    toast.success("Code copied");
    setTimeout(() => setCodeCopied(false), 2000);
  }, [codeExtract, liveText]);

  const handleSaveToBank = useCallback(async () => {
    if (!safeText) return;
    const question = useOverlayStore.getState().current_question ?? "Untitled Question";
    const userId = useAuthStore.getState().profile?.id;

    if (userId) {
      try {
        await answerBankDB.create(userId, {
          question_text: question,
          answer_text: safeText,
        });
        toast.success("Saved to answer bank");
      } catch (err) {
        console.error("[OverlayHintPanel] save to bank failed:", err);
        const existing = JSON.parse(localStorage.getItem("clarify:answer_bank") ?? "[]") as unknown[];
        localStorage.setItem(
          "clarify:answer_bank",
          JSON.stringify([...existing, { question, answer: safeText, saved_at: new Date().toISOString() }])
        );
        toast.warning("Saved locally — will sync when online.");
      }
    } else {
      // Not logged in — save only to localStorage
      const existing = JSON.parse(localStorage.getItem("clarify:answer_bank") ?? "[]") as unknown[];
      localStorage.setItem(
        "clarify:answer_bank",
        JSON.stringify([...existing, { question, answer: safeText, saved_at: new Date().toISOString() }])
      );
      toast.message("Saved locally.");
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [safeText]);

  const handleModeSwitch = useCallback(
    (mode: HintStyle) => {
      if (mode === hintStyle) return;
      onRequestModeChange?.(mode);
    },
    [hintStyle, onRequestModeChange]
  );

  const handleRetry = useCallback(() => {
    useOverlayStore.getState().setError(null);
    useOverlayStore.getState().setHintState("idle");
    onRetry?.();
  }, [onRetry]);

  const handleHintFeedback = useCallback(
    async (rating: "up" | "down") => {
      if (!safeText.trim()) return;

      const sessionId = useSessionStore.getState().session_id;
      const userId = useAuthStore.getState().profile?.id;
      const payload = {
        rating,
        question: currentQ,
        hint: safeText.slice(0, 500),
        timestamp: new Date().toISOString(),
        session_id: sessionId,
      };

      try {
        if (userId && sessionId) {
          await feedbackDB.create({
            user_id: userId,
            session_id: sessionId,
            rating: rating === "up" ? 5 : 1,
            category: "hint_feedback",
            content: JSON.stringify(payload),
          });
        } else {
          throw new Error("No session context");
        }
        toast.success("Thanks for your feedback!");
      } catch {
        const key = "clarify:hint_feedback";
        const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
        localStorage.setItem(key, JSON.stringify([...existing, payload]));
        toast.message("Feedback saved locally.");
      }

      setFeedbackSent(rating);
    },
    [safeText, currentQ],
  );

  /* ─── RENDER ─────────────────────────────────────────────────────────── */

  return (
    <div
      className="scroll-container min-h-[120px] max-h-[min(52vh,480px)] overflow-y-auto overflow-x-hidden px-3.5 py-3 flex flex-col gap-2.5"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* ── Mode Toggle ───────────────────────────────────────────────── */}
      {onRequestModeChange && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 p-0.5 bg-white/[0.05] rounded-xl border border-white/[0.07]">
            <ModeToggleButton
              active={isHintMode}
              onClick={() => handleModeSwitch("short_hints")}
              icon={<Zap className="w-3 h-3" />}
              label="Quick Hints"
              title="Get 3 short bullet-point hints"
              creditCost={SERVER_AI_CREDIT_COSTS.hint}
            />
            <ModeToggleButton
              active={isFullAnswerMode}
              onClick={() => handleModeSwitch("full_answer")}
              icon={<AlignLeft className="w-3 h-3" />}
              label="Full Answer"
              title="Generate a complete STAR-format answer"
              creditCost={SERVER_AI_CREDIT_COSTS.fullAnswer}
            />
          </div>
          <p className="text-[10px] text-white/30 text-center">
            Costs apply when you generate · Hints {SERVER_AI_CREDIT_COSTS.hint} cr · Full answer{" "}
            {SERVER_AI_CREDIT_COSTS.fullAnswer} cr
          </p>
        </div>
      )}

      {/* ── Capture answer history (last 3 screen captures) ─────────── */}
      {captureHistory.length > 0 && (
        <CaptureAnswerHistoryBar
          entries={captureHistory}
          activeIndex={captureHistoryIndex}
        />
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {errorMessage && (
        <div
          className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 flex items-start gap-2"
          role="alert"
          aria-live="assertive"
        >
          <span className="text-red-400 mt-0.5 shrink-0" aria-hidden>⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-red-400 leading-snug">{errorMessage}</p>
            {onRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-300 hover:text-red-200 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Screenshot loading ────────────────────────────────────────── */}
      {isScreenshotLoading && (
        <div
          className="flex items-center gap-2.5 rounded-xl bg-sky-500/[0.08] border border-sky-500/15 px-3 py-2.5"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400 shrink-0" aria-hidden />
          <span className="text-[12px] text-sky-300/80">Capturing problem — drag a box around the question…</span>
        </div>
      )}

      {/* ── Screenshot hint ───────────────────────────────────────────── */}
      {/* Legacy screenshot analysis — hidden when full answer is shown */}
      {screenshotHint && !isScreenshotLoading && !hasContent && !isStreaming && (
        <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/10 to-indigo-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px]">📸</span>
            <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-widest">Coding Analysis</p>
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">{screenshotHint}</p>
        </div>
      )}

      {/* ── Generating state ──────────────────────────────────────────── */}
      {isGenerating && (
        <div
          className="flex items-center gap-3 py-2 animate-fade-in"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center gap-1" aria-hidden>
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-[12px] text-white/45">{isFullAnswerMode ? "Generating full answer…" : "Generating hints…"}</span>
        </div>
      )}

      {/* ── Idle state ────────────────────────────────────────────────── */}
      {isIdle && !isError && !screenshotHint && !hasContent && <IdleStateContent />}

      {/* ── Offline badge ─────────────────────────────────────────────── */}
      {isOffline && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 px-2.5 py-1.5">
          <span className="text-[11px] text-amber-400">⚡</span>
          <p className="font-mono text-[11px] text-amber-400/70">OFFLINE TEMPLATE — real answer queued</p>
        </div>
      )}

      {/* ── History context ───────────────────────────────────────────── */}
      {isViewingHistory && viewedQuestion && (
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] px-2.5 py-1.5">
          <p className="text-[11px] text-white/30 italic truncate">Q: {viewedQuestion}</p>
        </div>
      )}

      {/* ── Answer / Hint content ─────────────────────────────────────── */}
      {isStreaming && liveText.trim().length > 0 && (composed?.lines?.length ?? 0) === 0 && (
        <div className="space-y-1 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-indigo-100/90">
            {liveText}
            <span className="stream-cursor text-[13px]" aria-hidden="true" />
          </p>
        </div>
      )}

      {((composed?.lines?.length ?? 0) > 0 || (isStreaming && liveText.trim().length > 0)) && (
        <div className="space-y-0">
          {!isGenerating && (hasContent || isStreaming) && (
            <div className="flex items-center gap-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[12px] font-bold text-white/70 uppercase tracking-widest">
                  {isFullAnswerMode ? "Full Answer" : "Quick Hints"}
                </span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-indigo-500/20 to-transparent" />
            </div>
          )}

          <div className="space-y-1.5">
            {(composed?.lines ?? []).map((line: any, i: number) => {
              if (line.type === "blank") return <div key={`blank-${i}`} className="h-1.5" />;

              if (line.type === "header") {
                return (
                  <p key={`hdr-${i}`} className="mt-2.5 mb-1 text-[13px] font-bold text-white/90 leading-snug">
                    {line.content}
                  </p>
                );
              }

              if (line.type === "keyword") {
                return (
                  <span
                    key={`kw-${i}`}
                    className="mr-1.5 mb-1.5 inline-block rounded-lg border border-indigo-500/25 bg-indigo-500/[0.12] px-2.5 py-1 text-[12px] font-semibold text-indigo-300"
                  >
                    {line.content}
                  </span>
                );
              }

              if (line.type === "code") {
                return (
                  <div key={`code-${i}`} className="relative my-2 group">
                    <pre className="rounded-xl bg-black/70 border border-indigo-500/20 px-3.5 py-3 font-mono text-[12px] leading-relaxed text-emerald-100/95 overflow-x-auto max-h-[280px] overflow-y-auto shadow-inner whitespace-pre">
                      {line.content}
                    </pre>
                    <button
                      type="button"
                      onClick={() => void copyTextToClipboard(line.content).then((ok) => {
                        if (ok) toast.success("Code block copied");
                        else toast.error("Copy failed");
                      })}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/80 transition-opacity"
                      title="Copy this code block"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                );
              }

              if (line.type === "bullet") {
                return (
                  <div
                    key={`bul-${i}`}
                    className="flex gap-2.5 text-[13px] leading-relaxed text-white/80"
                    style={{ paddingLeft: (line.indent ?? 0) * 14 }}
                  >
                    <span className="shrink-0 text-indigo-400/70 mt-1.5 text-[7px]">●</span>
                    <span>
                      {splitInlineCode(line.content).map((part, j) =>
                        part.isCode ? (
                          <code
                            key={`bulcode-${i}-${j}`}
                            className="rounded-md bg-black/50 border border-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] text-indigo-200"
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

              return (
                <p
                  key={`p-${i}`}
                  className={cn("text-[13px] leading-relaxed text-white/80", line.bold && "font-semibold text-white/90")}
                >
                  {splitInlineCode(line.content).map((part, j) =>
                    part.isCode ? (
                      <code
                        key={`pcode-${i}-${j}`}
                        className="rounded-md bg-black/50 border border-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] text-indigo-200"
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

            {isStreaming && <span className="stream-cursor text-[13px]" aria-hidden="true" />}
          </div>
        </div>
      )}

      {/* ── Mode upsell ─────────────────────────────────────────────── */}
      {hasContent && isHintMode && !isStreaming && !isGenerating && onRequestModeChange && (
        <button
          type="button"
          onClick={() => handleModeSwitch("full_answer")}
          className="flex items-center gap-2 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 px-3 py-2 text-[12px] text-indigo-300/70 hover:bg-indigo-500/10 hover:text-indigo-300 transition-all w-full text-left mt-1"
        >
          <AlignLeft className="w-3.5 h-3.5 shrink-0" />
          <span>Want a complete answer instead?</span>
          <ChevronRight className="w-3 h-3 ml-auto shrink-0" />
        </button>
      )}

      {/* ── Structure frameworks (no credit charge) ───────────────────── */}
      {!!currentQ && !isStreaming && !isGenerating && (
        <div className="flex items-center gap-1 flex-wrap pt-1">
          <ActionButton
            onClick={() =>
              useOverlayStore
                .getState()
                .setOfflineFallback(structureForMode("star", currentQ))
            }
            title="Show STAR structure (framework only — no invented stories)"
            icon={<Sparkles className="w-3 h-3" />}
            label="STAR"
            touchSafe={isMobile}
          />
          <ActionButton
            onClick={() =>
              useOverlayStore
                .getState()
                .setOfflineFallback(structureForMode("technical", currentQ))
            }
            title="Show technical answer structure"
            icon={<AlignLeft className="w-3 h-3" />}
            label="Technical"
            touchSafe={isMobile}
          />
          <ActionButton
            onClick={() =>
              useOverlayStore
                .getState()
                .setOfflineFallback(structureForMode("coding", currentQ))
            }
            title="Show coding approach structure"
            icon={<FileText className="w-3 h-3" />}
            label="Coding"
            touchSafe={isMobile}
          />
        </div>
      )}

      {/* ── Action bar ────────────────────────────────────────────────── */}
      {showCopyActions && (
        <div className="mt-1 pt-2.5 border-t border-white/[0.06] sticky bottom-0 bg-[#0b0b18]/95 backdrop-blur-sm">
          <div className="mb-2.5">
            <OverlayAnswerStrength />
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {(onRegenerate || onShorten || onExpand) && (
              <>
                {onRegenerate && (
                  <ActionButton
                    onClick={onRegenerate}
                    title="Regenerate a different answer"
                    icon={<RefreshCw className="w-3 h-3" />}
                    label="Regenerate"
                    touchSafe={isMobile}
                  />
                )}
                {onShorten && (
                  <ActionButton
                    onClick={onShorten}
                    title="Shorten this answer"
                    icon={<Minimize2 className="w-3 h-3" />}
                    label="Shorten"
                    touchSafe={isMobile}
                  />
                )}
                {onExpand && (
                  <ActionButton
                    onClick={onExpand}
                    title="Expand with more detail"
                    icon={<Maximize2 className="w-3 h-3" />}
                    label="Expand"
                    touchSafe={isMobile}
                  />
                )}
              </>
            )}

            <ActionButton
              onClick={() => void handleCopy()}
              title="Copy full answer"
              icon={copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              label={copied ? "Copied!" : "Copy all"}
              active={copied}
              touchSafe={isMobile}
            />

            {(codeExtract.length > 0 || composed?.hasCode) && (
              <ActionButton
                onClick={() => void handleCopyCode()}
                title="Copy solution code only"
                icon={codeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                label={codeCopied ? "Code copied!" : "Copy code"}
                active={codeCopied}
                touchSafe={isMobile}
              />
            )}

            <ActionButton
              onClick={handleSaveToBank}
              title="Save to answer bank"
              icon={saved ? <Check className="w-3 h-3 text-emerald-400" /> : <BookmarkPlus className="w-3 h-3" />}
              label={saved ? "Saved!" : "Save"}
              active={saved}
              touchSafe={isMobile}
            />

            <ActionButton
              onClick={() => useOverlayStore.getState().togglePinHint(safeText, currentQ)}
              title={isPinned ? "Unpin hint" : "Pin hint for quick access"}
              icon={<Pin className={cn("w-3 h-3", isPinned && "fill-indigo-300 text-indigo-300")} />}
              label={isPinned ? "Pinned" : "Pin"}
              active={isPinned}
              touchSafe={isMobile}
            />

            <ActionButton
              onClick={() => void handleHintFeedback("up")}
              title="Helpful answer"
              icon={<ThumbsUp className={cn("w-3 h-3", feedbackSent === "up" && "text-emerald-400")} />}
              label="Helpful"
              active={feedbackSent === "up"}
              touchSafe={isMobile}
            />

            <ActionButton
              onClick={() => void handleHintFeedback("down")}
              title="Not helpful"
              icon={<ThumbsDown className={cn("w-3 h-3", feedbackSent === "down" && "text-red-400")} />}
              label="Not helpful"
              active={feedbackSent === "down"}
              touchSafe={isMobile}
            />

            {historyLen > 1 && (
              <div className="flex items-center gap-0.5 ml-auto">
                <NavBtn
                  disabled={historyIndex <= 0}
                  onClick={() => useOverlayStore.getState().navigateHintHistory("prev")}
                  label="←"
                  title="Previous hint"
                />
                <span className="text-[11px] font-mono text-white/25 px-1">
                  {historyIndex + 1}/{historyLen}
                </span>
                <NavBtn
                  disabled={historyIndex >= historyLen - 1}
                  onClick={() => useOverlayStore.getState().navigateHintHistory("next")}
                  label="→"
                  title="Next hint"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SUB-COMPONENTS ────────────────────────────────────────────────────── */

function ModeToggleButton({
  active,
  onClick,
  icon,
  label,
  title,
  creditCost,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  creditCost?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={creditCost != null ? `${title} (${creditCost} credit${creditCost === 1 ? "" : "s"})` : title}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
        active
          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
          : "text-white/35 hover:text-white/60 hover:bg-white/[0.04] border border-transparent"
      )}
    >
      {icon}
      {label}
      {creditCost != null && (
        <span className="text-[9px] font-bold opacity-70 tabular-nums">{creditCost} cr</span>
      )}
    </button>
  );
}

function ActionButton({
  onClick,
  title,
  icon,
  label,
  active,
  touchSafe = false,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  touchSafe?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex items-center justify-center gap-1.5 text-[11px] font-semibold rounded-lg transition-all border",
        touchSafe ? "min-h-11 min-w-11 px-3 py-2" : "px-2.5 py-1",
        active
          ? "text-emerald-400 bg-emerald-500/[0.12] border-emerald-500/20"
          : "text-white/35 hover:text-white/75 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07]"
      )}
    >
      {icon}
      {!touchSafe && label}
      {touchSafe && <span className="sr-only">{label}</span>}
    </button>
  );
}

function NavBtn({
  disabled,
  onClick,
  label,
  title,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-6 h-6 flex items-center justify-center rounded-lg text-[12px] transition-all",
        disabled ? "text-white/[0.12] cursor-not-allowed" : "text-white/35 hover:text-white hover:bg-white/10"
      )}
    >
      {label}
    </button>
  );
}

export const OverlayHintPanel = memo(OverlayHintPanelInner);

function IdleStateContent() {
  const resumeCtx = useOverlayStore((s) => s.resume_context) as any;
  const resumePoints = useOverlayStore((s) => s.resume_talking_points) as any;
  const networkColor = useOverlayStore((s) => s.network_color);

  const isOffline = networkColor === "red";
  const hintCredits = checkCreditsForAction("hint");
  const answerCredits = checkCreditsForAction("fullAnswer");
  const isAIUnavailable =
    isOffline || (!hintCredits.canProceed && !answerCredits.canProceed);

  if (isOffline) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[12px] text-amber-400/90">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span>Offline — AI and screen capture paused until connection returns</span>
        </div>
        {resumePoints ? (
          <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">
            {resumePoints.intro}
          </p>
        ) : (
          <>
            <p className="text-[12px] text-white/25 italic">Listening for questions…</p>
            <ListeningTimeoutHelp />
          </>
        )}
      </div>
    );
  }

  if (isAIUnavailable && resumePoints) {
    const reason = !answerCredits.canProceed ? "No credits — top up to use AI" : "AI unavailable";
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[12px] text-amber-400/80">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>{reason} — showing your resume talking points</span>
        </div>
        <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">
          {resumePoints.intro}
        </p>
        {Array.isArray(resumePoints.experience_points) && resumePoints.experience_points.length > 0 && (
          <div className="space-y-1">
            {resumePoints.experience_points.slice(0, 2).map((pt: string, i: number) => (
              <div key={i} className="flex gap-2 text-[13px] text-white/70">
                <span className="shrink-0 text-indigo-400">•</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => useOverlayStore.getState().setActiveTab("resume")}
          className="text-[12px] text-indigo-300 hover:text-indigo-200 transition-colors font-medium"
        >
          View full resume notes →
        </button>
      </div>
    );
  }

  if (resumeCtx) {
    const skillsCount = resumeCtx.skills_count ?? resumeCtx.skillsCount ?? 0;
    const expCount = resumeCtx.experience_count ?? resumeCtx.experienceCount ?? 0;
    const totalYears = resumeCtx.total_years ?? resumeCtx.totalYears ?? null;

    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[12px] text-white/30 italic">Listening for questions…</p>
        </div>
        <button
          type="button"
          onClick={() => useOverlayStore.getState().setActiveTab("resume")}
          className="flex items-center gap-2 rounded-xl bg-indigo-500/[0.08] border border-indigo-500/15 px-3 py-2 text-[12px] text-indigo-300/75 hover:bg-indigo-500/[0.12] hover:text-indigo-300 transition-all w-full text-left"
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>
            Resume loaded — {skillsCount} skills, {expCount} roles
            {totalYears ? `, ${totalYears}+ yrs` : ""}
          </span>
        </button>
        <ListeningTimeoutHelp />
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-pulse" />
        <p className="text-[12px] text-white/25 italic">Listening for questions…</p>
      </div>
      <p className="text-[11px] text-white/30">
        Hints {SERVER_AI_CREDIT_COSTS.hint} cr · Full answer {SERVER_AI_CREDIT_COSTS.fullAnswer} cr · Capture{" "}
        {SERVER_AI_CREDIT_COSTS.screenshotAnswer} cr
      </p>
      <ListeningTimeoutHelp />
    </div>
  );
}

function ListeningTimeoutHelp() {
  const [showMicHelp, setShowMicHelp] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setShowMicHelp(true), LISTENING_NO_SPEECH_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="space-y-1.5">
      {showMicHelp && (
        <p className="text-[11px] text-white/40 leading-relaxed">
          No speech detected. Check microphone permission, selected device, and that you are speaking clearly.
        </p>
      )}
      <button
        type="button"
        onClick={() => useOverlayStore.getState().setActiveTab("chat")}
        className="text-[12px] text-indigo-300 hover:text-indigo-200 transition-colors font-medium text-left"
      >
        Type a question instead
      </button>
    </div>
  );
}

function CaptureAnswerHistoryBar({
  entries,
  activeIndex,
}: {
  entries: Array<{
    id: string;
    question: string;
    answer: string;
    thumbnail_base64?: string;
    captured_at: number;
  }>;
  activeIndex: number;
}) {
  return (
    <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.06] px-2.5 py-2 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/70">
        Recent captures ({entries.length}/3)
      </p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {entries.map((entry, index) => {
          const isActive = index === activeIndex;
          const label = entry.question.slice(0, 36) || `Capture ${index + 1}`;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => useOverlayStore.getState().selectCaptureAnswer(index)}
              className={cn(
                "shrink-0 flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-left min-w-[88px] max-w-[120px] transition-all",
                isActive
                  ? "border-sky-400/40 bg-sky-500/15 ring-1 ring-sky-400/20"
                  : "border-white/10 bg-black/20 hover:border-sky-500/25 hover:bg-sky-500/10",
              )}
              title={entry.question || "Screen capture answer"}
            >
              {entry.thumbnail_base64 ? (
                <img
                  src={entry.thumbnail_base64}
                  alt=""
                  className="h-8 w-full rounded object-cover object-left-top opacity-80"
                />
              ) : (
                <span className="h-8 w-full rounded bg-white/5 flex items-center justify-center text-[10px] text-white/30">
                  #{index + 1}
                </span>
              )}
              <span className="text-[10px] text-white/55 truncate">{label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyTextToClipboard(entry.answer).then((ok) => {
                    if (ok) toast.success("Capture answer copied");
                    else toast.error("Copy failed");
                  });
                }}
                aria-label="Copy capture answer"
                className="inline-flex items-center justify-center min-h-11 min-w-11 -mx-2 text-[10px] font-semibold text-sky-300/70 hover:text-sky-200"
              >
                Copy
              </button>
            </button>
          );
        })}
      </div>
    </div>
  );
}
