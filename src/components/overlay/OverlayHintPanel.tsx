// @ts-nocheck
// src/components/overlay/OverlayHintPanel.tsx
import { useMemo, useState, useCallback } from "react";
import { composeHint, splitInlineCode } from "@/lib/overlay/overlayCompositor";
import { useOverlayStore } from "@/store/overlayStore";
import type { HintState } from "@/store/overlayStore";
import type { HintStyle } from "@/types/user.types";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import {
  Loader2, Copy, Check, BookmarkPlus,
  FileText, Pin,
} from "lucide-react";
import { OverlayAnswerStrength } from "./OverlayAnswerStrength";
import { checkCredits } from "@/lib/billing/creditsManager";

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
  const [saved,  setSaved]  = useState(false);

  const historyLen     = useOverlayStore((s) => s.hint_history.length);
  const historyIndex   = useOverlayStore((s) => s.hint_history_index);
  const viewedQuestion = useOverlayStore((s) => s.viewed_question);
  const pinnedHints    = useOverlayStore((s) => s.pinned_hints);
  const currentQ       = useOverlayStore((s) => s.current_question);
  const isPinned       = text ? pinnedHints.some((p) => p.hint === text) : false;
  const isViewingHistory = historyLen > 1 && historyIndex < historyLen - 1;

  const isStreaming  = hintState === "streaming";
  const isGenerating = hintState === "generating";
  const isIdle       = hintState === "idle" || hintState === "listening";
  const isOffline    = hintState === "offline_fallback";
  const hasContent   = !!text;

  const handleCopy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const handleSaveToBank = useCallback(async () => {
    if (!text) return;
    const question = useOverlayStore.getState().current_question ?? "Untitled";
    const userId   = useAuthStore.getState().profile?.id;
    const entry    = { question, answer: text, saved_at: new Date().toISOString() };

    if (userId) {
      try {
        await supabase.from("answer_bank").insert({
          user_id:       userId,
          question_text: question,
          answer_text:   text,
        });
      } catch {
        const existing = JSON.parse(localStorage.getItem("clarify:answer_bank") ?? "[]");
        localStorage.setItem("clarify:answer_bank", JSON.stringify([...existing, entry]));
      }
    } else {
      const existing = JSON.parse(localStorage.getItem("clarify:answer_bank") ?? "[]");
      localStorage.setItem("clarify:answer_bank", JSON.stringify([...existing, entry]));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [text]);

  return (
    <div className="scroll-container min-h-[60px] overflow-y-auto px-4 py-3 flex flex-col gap-2">

      {/* ── Error ───────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-[12px] text-red-400" role="alert">
          {errorMessage}
        </div>
      )}

      {/* ── Screenshot loading ───────────────────────────────────── */}
      {isScreenshotLoading && (
        <div className="flex items-center gap-2 text-[12px] text-brand-300/70" role="status" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analysing coding problem…
        </div>
      )}

      {/* ── Screenshot hint ──────────────────────────────────────── */}
      {screenshotHint && !isScreenshotLoading && (
        <div className="rounded-lg border border-brand-500/20 bg-brand-500/8 p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-brand-300 uppercase tracking-wider">
            📸 Coding Analysis
          </p>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">
            {screenshotHint}
          </p>
        </div>
      )}

      {/* ── Generating spinner ───────────────────────────────────── */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-[13px] text-white/50 animate-fade-in" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
          <span>Generating{hintStyle === "full_answer" ? " answer" : " hints"}…</span>
        </div>
      )}

      {/* ── Idle ─────────────────────────────────────────────────── */}
      {isIdle && !errorMessage && !screenshotHint && <IdleStateContent />}

      {/* ── Offline badge ────────────────────────────────────────── */}
      {isOffline && (
        <p className="font-mono text-[11px] text-amber-400/60">
          ⚡ OFFLINE TEMPLATE — real answer queued
        </p>
      )}

      {/* ── History context ──────────────────────────────────────── */}
      {isViewingHistory && viewedQuestion && (
        <div className="rounded bg-white/5 px-2.5 py-1.5 text-[11px] text-white/35 italic truncate">
          Q: {viewedQuestion}
        </div>
      )}

      {/* ── Answer content ───────────────────────────────────────── */}
      {!!composed?.lines?.length && (
        <div className="space-y-0">

          {/* ⭐ Answer: header — matches ParakeetAI reference */}
          {!isStreaming && !isGenerating && hasContent && (
            <p className="text-[13px] font-bold text-white/90 mb-2">
              ⭐ <span className="text-white/90">Answer:</span>
            </p>
          )}

          <div className="space-y-1.5">
            {composed.lines.map((line, i) => {
              if (line.type === "blank") return <div key={`blank-${i}`} className="h-1.5" />;

              if (line.type === "header") {
                return (
                  <p key={`hdr-${i}`} className="mt-2 mb-1 text-[13px] font-bold text-white/90 leading-snug">
                    {line.content}
                  </p>
                );
              }

              if (line.type === "keyword") {
                return (
                  <span
                    key={`kw-${i}`}
                    className="mr-1.5 mb-1.5 inline-block rounded-md border border-brand-500/25 bg-brand-500/15 px-2.5 py-1 text-[12px] font-semibold text-brand-300"
                  >
                    {line.content}
                  </span>
                );
              }

              if (line.type === "code") {
                return (
                  <pre
                    key={`code-${i}`}
                    className="rounded-lg bg-black/50 border border-white/8 px-3 py-2 font-mono text-[12px] text-brand-200 overflow-x-auto"
                  >
                    {line.content}
                  </pre>
                );
              }

              if (line.type === "bullet") {
                return (
                  <div
                    key={`bul-${i}`}
                    className="flex gap-2.5 text-[13px] leading-relaxed text-white/85"
                    style={{ paddingLeft: (line.indent ?? 0) * 14 }}
                  >
                    {/* Solid bullet — matches ParakeetAI */}
                    <span className="shrink-0 text-white/60 mt-[3px] text-[8px]">●</span>
                    <span>
                      {splitInlineCode(line.content).map((part, j) =>
                        part.isCode ? (
                          <code
                            key={`bulcode-${i}-${j}`}
                            className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px] text-brand-200"
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
                    "text-[13px] leading-relaxed text-white/85",
                    line.bold && "font-semibold text-white"
                  )}
                >
                  {splitInlineCode(line.content).map((part, j) =>
                    part.isCode ? (
                      <code
                        key={`pcode-${i}-${j}`}
                        className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px] text-brand-200"
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
            {isStreaming && (
              <>
                {/* Show streaming label while generating */}
                {!hasContent && (
                  <p className="text-[13px] font-bold text-white/90 mb-1">
                    ⭐ <span>Answer:</span>
                  </p>
                )}
                <span className="stream-cursor text-[13px]" />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────────────── */}
      {hasContent && !isStreaming && !isGenerating && (
        <div className="mt-1 pt-2.5 border-t border-white/6">
          <div className="mb-2">
            <OverlayAnswerStrength />
          </div>
          <div className="flex items-center gap-1 flex-wrap">

            <ActionButton
              onClick={handleCopy}
              title="Copy to clipboard"
              icon={copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              label={copied ? "Copied" : "Copy"}
              active={copied}
            />
            <ActionButton
              onClick={handleSaveToBank}
              title="Save to answer bank"
              icon={saved ? <Check className="w-3 h-3 text-emerald-400" /> : <BookmarkPlus className="w-3 h-3" />}
              label={saved ? "Saved" : "Save"}
              active={saved}
            />
            <ActionButton
              onClick={() => useOverlayStore.getState().togglePinHint(text, currentQ)}
              title={isPinned ? "Unpin hint" : "Pin hint for quick access"}
              icon={<Pin className={cn("w-3 h-3", isPinned && "fill-brand-300 text-brand-300")} />}
              label={isPinned ? "Pinned" : "Pin"}
              active={isPinned}
            />

            {/* History nav — compact, right-aligned */}
            {historyLen > 1 && (
              <div className="flex items-center gap-0.5 ml-auto">
                <NavBtn
                  disabled={historyIndex <= 0}
                  onClick={() => useOverlayStore.getState().navigateHintHistory("prev")}
                  label="←"
                  title="Previous hint"
                />
                <span className="text-[11px] font-mono text-white/30 px-1">
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

// ── Sub-components ──────────────────────────────────────────────────────────

function ActionButton({
  onClick, title, icon, label, active,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all border",
        active
          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          : "text-white/40 hover:text-white/80 bg-white/4 hover:bg-white/8 border-white/6"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function NavBtn({
  disabled, onClick, label, title,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-6 h-6 flex items-center justify-center rounded text-[12px] transition-all",
        disabled
          ? "text-white/15 cursor-not-allowed"
          : "text-white/40 hover:text-white hover:bg-white/8"
      )}
    >
      {label}
    </button>
  );
}

function IdleStateContent() {
  const resumeCtx    = useOverlayStore((s) => s.resume_context);
  const resumePoints = useOverlayStore((s) => s.resume_talking_points);
  const networkColor = useOverlayStore((s) => s.network_color);
  const activeModel  = useOverlayStore((s) => s.active_model);
  const isOffline    = networkColor === "red";
  const creditCheck  = checkCredits(activeModel);
  const isAIUnavailable = isOffline || !creditCheck.canProceed;

  if (isAIUnavailable && resumePoints) {
    const reason = isOffline ? "Offline" : "No credits available";
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[12px] text-amber-400/80">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>{reason} — showing your resume talking points</span>
        </div>
        <p className="text-[13px] text-white/80 leading-relaxed whitespace-pre-wrap">
          {resumePoints.intro}
        </p>
        {resumePoints.experience_points.length > 0 && (
          <div className="space-y-1">
            {resumePoints.experience_points.slice(0, 2).map((pt, i) => (
              <div key={i} className="flex gap-2 text-[13px] text-white/75">
                <span className="shrink-0 text-brand-400">•</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => useOverlayStore.getState().setActiveTab("resume")}
          className="text-[12px] text-brand-300 hover:text-brand-200 transition-colors"
        >
          View full resume notes →
        </button>
      </div>
    );
  }

  if (resumeCtx) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] italic text-white/30">Listening for questions…</p>
        <button
          onClick={() => useOverlayStore.getState().setActiveTab("resume")}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500/8 border border-brand-500/15 px-3 py-2 text-[12px] text-brand-300/80 hover:bg-brand-500/15 transition-colors w-full text-left"
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>
            Resume loaded — {resumeCtx.skills_count} skills, {resumeCtx.experience_count} roles
            {resumeCtx.total_years ? `, ${resumeCtx.total_years}+ yrs` : ""}
          </span>
        </button>
      </div>
    );
  }

  return <p className="text-[12px] italic text-white/30">Listening for questions…</p>;
}
