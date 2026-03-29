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
  FileText, Pin, Sparkles,
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
    <div className="scroll-container min-h-[60px] overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">

      {/* ── Error ────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 flex items-start gap-2" role="alert">
          <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
          <p className="text-[12px] text-red-400 leading-snug">{errorMessage}</p>
        </div>
      )}

      {/* ── Screenshot loading ─────────────────────────────────── */}
      {isScreenshotLoading && (
        <div className="flex items-center gap-2.5 rounded-xl bg-sky-500/8 border border-sky-500/15 px-3 py-2.5" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400 shrink-0" />
          <span className="text-[12px] text-sky-300/80">Analysing coding problem…</span>
        </div>
      )}

      {/* ── Screenshot hint ────────────────────────────────────── */}
      {screenshotHint && !isScreenshotLoading && (
        <div className="rounded-xl border border-brand-500/20 bg-gradient-to-b from-brand-500/10 to-brand-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px]">📸</span>
            <p className="text-[11px] font-bold text-brand-300 uppercase tracking-widest">Coding Analysis</p>
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">
            {screenshotHint}
          </p>
        </div>
      )}

      {/* ── Generating ──────────────────────────────────────────── */}
      {isGenerating && (
        <div className="flex items-center gap-3 py-2 animate-fade-in" role="status">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-[12px] text-white/45">
            Generating{hintStyle === "full_answer" ? " answer" : " hints"}…
          </span>
        </div>
      )}

      {/* ── Idle state ──────────────────────────────────────────── */}
      {isIdle && !errorMessage && !screenshotHint && <IdleStateContent />}

      {/* ── Offline badge ──────────────────────────────────────── */}
      {isOffline && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1.5">
          <span className="text-[11px] text-amber-400">⚡</span>
          <p className="font-mono text-[11px] text-amber-400/70">OFFLINE TEMPLATE — real answer queued</p>
        </div>
      )}

      {/* ── History context ─────────────────────────────────────── */}
      {isViewingHistory && viewedQuestion && (
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] px-2.5 py-1.5">
          <p className="text-[11px] text-white/30 italic truncate">Q: {viewedQuestion}</p>
        </div>
      )}

      {/* ── Answer content ──────────────────────────────────────── */}
      {!!composed?.lines?.length && (
        <div className="space-y-0">

          {/* Answer header */}
          {!isStreaming && !isGenerating && hasContent && (
            <div className="flex items-center gap-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[12px] font-bold text-white/70 uppercase tracking-widest">Answer</span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-indigo-500/20 to-transparent" />
            </div>
          )}

          <div className="space-y-1.5">
            {composed.lines.map((line, i) => {
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
                    className="mr-1.5 mb-1.5 inline-block rounded-lg border border-indigo-500/25 bg-indigo-500/12 px-2.5 py-1 text-[12px] font-semibold text-indigo-300"
                  >
                    {line.content}
                  </span>
                );
              }

              if (line.type === "code") {
                return (
                  <pre
                    key={`code-${i}`}
                    className="rounded-xl bg-black/60 border border-white/[0.08] px-3.5 py-2.5 font-mono text-[12px] text-indigo-200 overflow-x-auto my-1.5 shadow-inner"
                  >
                    {line.content}
                  </pre>
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
                  className={cn(
                    "text-[13px] leading-relaxed text-white/80",
                    line.bold && "font-semibold text-white/90"
                  )}
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

            {/* Streaming cursor */}
            {isStreaming && (
              <>
                {!hasContent && (
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[12px] font-bold text-white/70 uppercase tracking-widest">Answer</span>
                  </div>
                )}
                <span className="stream-cursor text-[13px]" />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────────── */}
      {hasContent && !isStreaming && !isGenerating && (
        <div className="mt-1 pt-2.5 border-t border-white/[0.06]">
          <div className="mb-2.5">
            <OverlayAnswerStrength />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <ActionButton
              onClick={handleCopy}
              title="Copy to clipboard"
              icon={copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              label={copied ? "Copied!" : "Copy"}
              active={copied}
            />
            <ActionButton
              onClick={handleSaveToBank}
              title="Save to answer bank"
              icon={saved ? <Check className="w-3 h-3 text-emerald-400" /> : <BookmarkPlus className="w-3 h-3" />}
              label={saved ? "Saved!" : "Save"}
              active={saved}
            />
            <ActionButton
              onClick={() => useOverlayStore.getState().togglePinHint(text, currentQ)}
              title={isPinned ? "Unpin hint" : "Pin hint for quick access"}
              icon={<Pin className={cn("w-3 h-3", isPinned && "fill-indigo-300 text-indigo-300")} />}
              label={isPinned ? "Pinned" : "Pin"}
              active={isPinned}
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
        "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all border",
        active
          ? "text-emerald-400 bg-emerald-500/12 border-emerald-500/20"
          : "text-white/35 hover:text-white/75 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07]"
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
        "w-6 h-6 flex items-center justify-center rounded-lg text-[12px] transition-all",
        disabled
          ? "text-white/12 cursor-not-allowed"
          : "text-white/35 hover:text-white hover:bg-white/10"
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
        <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">
          {resumePoints.intro}
        </p>
        {resumePoints.experience_points.length > 0 && (
          <div className="space-y-1">
            {resumePoints.experience_points.slice(0, 2).map((pt, i) => (
              <div key={i} className="flex gap-2 text-[13px] text-white/70">
                <span className="shrink-0 text-indigo-400">•</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => useOverlayStore.getState().setActiveTab("resume")}
          className="text-[12px] text-indigo-300 hover:text-indigo-200 transition-colors font-medium"
        >
          View full resume notes →
        </button>
      </div>
    );
  }

  if (resumeCtx) {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[12px] text-white/30 italic">Listening for questions…</p>
        </div>
        <button
          onClick={() => useOverlayStore.getState().setActiveTab("resume")}
          className="flex items-center gap-2 rounded-xl bg-indigo-500/8 border border-indigo-500/15 px-3 py-2 text-[12px] text-indigo-300/75 hover:bg-indigo-500/12 hover:text-indigo-300 transition-all w-full text-left"
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

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-pulse" />
      <p className="text-[12px] text-white/25 italic">Listening for questions…</p>
    </div>
  );
}
