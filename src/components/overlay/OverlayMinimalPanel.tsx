// Compact Practice Coach pill — primary controls without stacked chrome.
import type { ReactNode } from "react";
import { Loader2, Maximize2, Mic, MicOff, Pause, Play, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayStore } from "@/store/overlayStore";
import { SessionContextChip } from "@/components/session/SessionContextChip";
import { OverlayAudioStatusBar } from "./OverlayAudioStatusBar";

interface OverlayMinimalPanelProps {
  onToggleMic?: () => void;
  onGenerate?: () => void;
  onEndSession?: () => void;
  onPauseSession?: () => void;
  onResumeSession?: () => void;
  isMuted: boolean;
  isCapturing: boolean;
  isGenerating: boolean;
  isSessionActive: boolean;
  isSessionPaused: boolean;
  isSessionLive: boolean;
  currentQuestion: string;
  displayText: string;
  errorMessage: string | null;
}

export function OverlayMinimalPanel({
  onToggleMic,
  onGenerate,
  onEndSession,
  onPauseSession,
  onResumeSession,
  isMuted,
  isCapturing,
  isGenerating,
  isSessionActive,
  isSessionPaused,
  isSessionLive,
  currentQuestion,
  displayText,
  errorMessage,
}: OverlayMinimalPanelProps) {
  const hintPreview = displayText.trim();
  const questionPreview = currentQuestion.trim();

  return (
    <div className="px-3 pb-3 pt-2 space-y-2.5 shrink-0" data-no-drag>
      {errorMessage ? (
        <p
          className="text-[11px] leading-snug text-red-200/90 bg-red-500/10 border border-red-500/25 rounded-xl px-2.5 py-2 line-clamp-3"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <SessionContextChip compact className="w-full max-w-full" />

      {(questionPreview || hintPreview) && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
          {questionPreview ? (
            <p className="text-[10px] uppercase tracking-wide text-white/35 mb-0.5">
              Question
            </p>
          ) : null}
          <p className="text-[11px] text-white/75 line-clamp-2 leading-snug">
            {questionPreview ? (
              <span className="text-white/55">{questionPreview.slice(0, 120)}</span>
            ) : null}
            {questionPreview && hintPreview ? " · " : null}
            {hintPreview}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {isSessionPaused && onResumeSession ? (
          <IconButton
            onClick={() => void onResumeSession()}
            label="Resume session"
            className="border-emerald-500/25 bg-emerald-500/15 text-emerald-400"
          >
            <Play className="w-3.5 h-3.5" />
          </IconButton>
        ) : isSessionActive && onPauseSession ? (
          <IconButton
            onClick={onPauseSession}
            label="Pause session"
            className="border-amber-500/25 bg-amber-500/15 text-amber-400"
          >
            <Pause className="w-3.5 h-3.5" />
          </IconButton>
        ) : null}

        {onToggleMic ? (
          <IconButton
            onClick={onToggleMic}
            label={isMuted ? "Unmute microphone" : "Mute microphone"}
            pressed={!isMuted}
            className={cn(
              isCapturing && !isMuted
                ? "border-red-500/25 bg-red-500/15 text-red-400"
                : isMuted
                  ? "border-white/10 bg-white/5 text-white/35"
                  : "border-white/10 bg-white/5 text-white/50",
            )}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </IconButton>
        ) : null}

        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className={cn(
            "flex-1 min-w-0 flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all",
            "bg-gradient-to-r from-indigo-600 to-primary hover:from-indigo-500 hover:to-primary/90",
            "text-white shadow-md shadow-indigo-500/20 disabled:opacity-70 disabled:cursor-not-allowed",
            "border border-white/10 py-2 text-[12px]",
            isGenerating && "overlay-fab-glow",
          )}
          title="Get AI Answer (Ctrl+Shift+A)"
          aria-label={isGenerating ? "Generating answer" : "Get AI answer"}
          aria-busy={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
              <span className="truncate">Generating…</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="truncate">Get AI Answer</span>
            </>
          )}
        </button>

        {onEndSession && isSessionLive ? (
          <IconButton
            onClick={onEndSession}
            label="End session"
            className="border-red-500/20 bg-red-600/15 text-red-400"
          >
            <Square className="w-3 h-3 fill-current" />
          </IconButton>
        ) : null}

        <button
          type="button"
          onClick={() => useOverlayStore.getState().setMinimalMode(false)}
          aria-label="Expand overlay for full tools"
          title="Expand"
          className="inline-flex items-center gap-1 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-2 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/15 shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" aria-hidden />
          <span className="hidden sm:inline">More</span>
        </button>
      </div>

      <OverlayAudioStatusBar compact />
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  className,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "w-9 h-9 flex items-center justify-center rounded-xl border transition-all shrink-0",
        className,
      )}
    >
      {children}
    </button>
  );
}
