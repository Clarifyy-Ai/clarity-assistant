// src/pages/app/live/LiveOverlay.tsx — PRODUCTION READY
import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useCallSession } from "@/hooks/useCallSession";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";

import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { WindowVisibilityManager } from "@/components/overlay/WindowVisibilityManager";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import { Button } from "@/components/ui/Button";

import { ClipboardCheck, AlertTriangle, RefreshCw, Eye, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import type { LiveSessionConfig } from "@/types/session.types";
import { notifyOverlayVisibilityOnMobile } from "@/lib/overlay/overlayVisibilityNotice";
import { useIsMobile } from "@/hooks/use-mobile";
import { setGenerateAnswerHandler } from "@/lib/overlay/hotkeys";
import { isElectronApp } from "@/lib/platform/isElectron";
import { openInBrowser } from "@/lib/platform/openInBrowser";
import {
  initDesktopOverlayWindow,
  teardownDesktopOverlayWindow,
} from "@/lib/platform/electronWindowManager";
import {
  consumePendingPracticeSetup,
  peekPendingPracticeSetup,
  saveLastPracticeSetup,
} from "@/lib/session/lastPracticeSetup";
import { saveLastSessionSummary } from "@/lib/session/lastSessionSummary";
import { resolveQuestionFromTranscript } from "@/lib/session/liveQuestionFromTranscript";

const PREP_LABELS = [
  "Analysing your profile…",
  "Loading resume & interview context…",
  "Starting audio capture…",
] as const;

const DEFAULT_CONFIG: LiveSessionConfig = {
  company: null,
  role: null,
  hint_style: "short_hints",
  model: "gemini-flash",
  smart_routing: false,
  stealth_mode: false,
  resume_id: null,
  jd_id: null,
  interview_type: "behavioral",
  instructions: "",
  enable_system_audio: true,
};

const IS_ELECTRON = isElectronApp();

export default function LiveOverlay() {
  return <LiveOverlaySession />;
}

function LiveOverlaySession() {
  const navigate = useNavigate();
  const sessionStatus = useSessionStore((s) => s.status);
  const isMobile = useIsMobile();

  const skipWizardRef = useRef(Boolean(peekPendingPracticeSetup()));
  const [phase, setPhase] = useState<"setup" | "starting" | "active">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);

  const hasStartedRef = useRef(false);
  const didEndRef = useRef(false);

  useEffect(() => {
    const prefs = useOverlayStore.getState();
    void initDesktopOverlayWindow({ alwaysOnTop: prefs.always_on_top });
    return () => {
      void teardownDesktopOverlayWindow();
    };
  }, []);

  useEffect(() => {
    const unsubAot = useOverlayStore.subscribe(
      (s) => s.always_on_top,
      (enabled) => {
        void import("@/lib/overlay/applyOverlayWindowPrefs").then((m) =>
          m.applyAlwaysOnTopPreference(enabled),
        );
      },
    );
    const unsubPres = useOverlayStore.subscribe(
      (s) => s.presentation_safe_mode,
      (enabled) => {
        void import("@/lib/overlay/applyOverlayWindowPrefs").then((m) =>
          m.applyPresentationSafePreference(enabled),
        );
      },
    );
    return () => {
      unsubAot();
      unsubPres();
    };
  }, []);

  const call = useCallSession({
    config,
    sessionType: "rehearsal",
  });
  const copilot = call.copilot;

  const isActive = sessionStatus === "active";
  const isPaused = sessionStatus === "paused"; // safe if you add pause later
  const overlayVisible = useOverlayStore((s) => s.is_visible);

  // Stable ref for cleanup
  const endSessionRef = useRef(copilot.endLiveSession);
  endSessionRef.current = copilot.endLiveSession;

  // Normalize stream error to a message
  const streamError = copilot.streamError;
  const streamErrorMessage: string | null = streamError
    ? typeof streamError === "string"
      ? streamError
      : (streamError as { message?: string }).message ??
        "Microphone stream error. Please check your audio settings."
    : null;

  // ── Setup ────────────────────────────────────────────────────────────────
  const handleSetup = useCallback((sessionConfig: LiveSessionConfig) => {
    saveLastPracticeSetup(sessionConfig);
    useSessionStore.getState().resetSession();
    useOverlayStore.getState().resetSessionState();

    useOverlayStore.getState().setStealthMode(!!sessionConfig.stealth_mode);
    useOverlayStore.getState().setProctorSafe(false);

    useOverlayStore.getState().setActiveModel(sessionConfig.model);
    useOverlayStore.getState().setHintStyle(sessionConfig.hint_style);

    hasStartedRef.current = false;
    didEndRef.current = false;

    setLastSessionId(null);
    setConfig(sessionConfig);
    setPhase("starting");
  }, []);

  // Auto-start when redirected from /app/live with a stashed config
  useEffect(() => {
    const pending = consumePendingPracticeSetup();
    if (pending) handleSetup(pending);
    else skipWizardRef.current = false;
  }, [handleSetup]);

  // ── Start live session (creation handled by start-session edge via useLiveCopilot) ──
  useEffect(() => {
    if (phase !== "starting" || hasStartedRef.current) return;

    hasStartedRef.current = true;

    call
      .startSession()
      .then(() => {
        setPhase("active");
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to start live session";
        toast.error(message);
        hasStartedRef.current = false;
        useSessionStore.getState().resetSession();
        useOverlayStore.getState().hideOverlay();
        setPhase("setup");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Ensure overlay is visible in active phase by default
  useEffect(() => {
    if (phase !== "active") return;
    useOverlayStore.getState().showOverlay();
  }, [phase]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hasStartedRef.current && !didEndRef.current) {
        endSessionRef.current();
      }
      useOverlayStore.getState().hideOverlay();
      useOverlayStore.getState().resetSessionState();
    };
  }, []);

  // ── Stop session ─────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    didEndRef.current = true;

    // Snapshot ids/duration before ending — store reset may clear them.
    // Answer count comes from persist so the summary does not offer a dead scorecard.
    const sessionId = useSessionStore.getState().session_id;
    const durationSeconds = useSessionStore.getState().elapsed_seconds;
    const hintsUsed = useOverlayStore.getState().hint_history.length;

    const ended = await copilot.endLiveSession();

    if (sessionId) {
      saveLastSessionSummary({
        sessionId,
        durationSeconds,
        questionsDetected: ended?.answersRecorded ?? 0,
        hintsUsed,
        endedAt: Date.now(),
      });
    }
    setLastSessionId(sessionId);

    // Return to /app/live summary (never leave users on an empty mid-session page)
    if (sessionId) {
      if (IS_ELECTRON) {
        openInBrowser(`/app/live?ended=${sessionId}`);
      } else {
        navigate(`/app/live?ended=${sessionId}`, { replace: true });
      }
    }
  }, [copilot, navigate]);

  // ── Generate hint ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(() => {
    const store = useOverlayStore.getState();
    store.setActiveTab("answer");
    store.setMinimalMode(false);
    store.showOverlay();

    const utterances = useAudioStore.getState().transcript?.utterances ?? [];
    const question = resolveQuestionFromTranscript(utterances, store.current_question);
    if (question) {
      store.setCurrentQuestion(question);
      void copilot.requestLiveHint(question);
      return;
    }

    store.setSessionPipelineState("listening");
    toast.info(
      "Listening for the interviewer. Share tab audio, or type the question in Chat.",
    );
  }, [copilot]);

  const handleManualQuestion = useCallback(
    (question: string) => copilot.submitManualQuestion(question),
    [copilot]
  );

  useEffect(() => {
    setGenerateAnswerHandler(handleGenerate);
    return () => setGenerateAnswerHandler(null);
  }, [handleGenerate]);

  // ── Setup screen ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "setup") notifyOverlayVisibilityOnMobile();
  }, [phase]);

  if (phase === "setup" && !skipWizardRef.current) {
    return (
      <div className="relative min-h-screen bg-background">
        <header className="sticky top-0 z-[300] flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => {
              if (IS_ELECTRON) openInBrowser("/app/dashboard");
              else navigate("/app/dashboard");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {IS_ELECTRON ? "Open web app" : "Dashboard"}
          </button>
          <span className="text-sm font-semibold text-foreground">Overlay practice mode</span>
          {IS_ELECTRON ? (
            <button
              type="button"
              onClick={() => openInBrowser("/app/guide/practice-coach")}
              className="ml-auto text-[10px] font-medium text-primary hover:underline"
            >
              Install guide
            </button>
          ) : (
            <Link
              to="/app/guide/practice-coach"
              className="ml-auto text-[10px] font-medium text-primary hover:underline"
            >
              Install guide
            </Link>
          )}
        </header>
        <PreSessionSetupWizard onStart={handleSetup} sessionType="live" />
      </div>
    );
  }

  if (phase === "starting" || (phase === "setup" && skipWizardRef.current)) {
    const prepLabel =
      PREP_LABELS[Math.min(copilot.prepStepIndex, PREP_LABELS.length - 1)] ??
      "Preparing session…";

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
        <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm font-medium text-foreground text-center">{prepLabel}</p>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-24 w-full rounded-xl" />
        {copilot.isPreparingSession && (
          <p className="text-xs text-muted-foreground text-center">
            Session will start when context and audio are ready.
          </p>
        )}
      </div>
    );
  }

  // ── Active / ended screen ────────────────────────────────────────────────
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-[300] flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            const goBack = () => {
              if (IS_ELECTRON) openInBrowser("/app/dashboard");
              else navigate("/app/dashboard");
            };
            if (isActive || isPaused) {
              void handleStop().then(goBack);
            } else {
              goBack();
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {IS_ELECTRON ? "Open web app" : "Dashboard"}
        </button>
        <span className="text-xs text-muted-foreground truncate">
          {isActive ? "Session active" : "Session ended"}
        </span>
      </header>

      <LiveSessionController isActive={isActive} onAutoEnd={handleStop} />

      <OverlayKeyboardHandler
        enabled={isActive || isPaused}
        onToggleMute={copilot.toggleMute}
        onCaptureCoding={() => void copilot.captureCodingAnswer()}
        onGenerate={handleGenerate}
      />

      <WindowVisibilityManager
        autoHideOnBlur={false}
        trackIdleTime={false}
      />

      <OverlayWindow
        onToggleMic={copilot.toggleMute}
        onToggleSystemAudio={copilot.toggleSystemAudio}
        onGenerate={handleGenerate}
        onRegenerate={() => copilot.requestAnswerModification("regenerate")}
        onShorten={() => copilot.requestAnswerModification("shorten")}
        onExpand={() => copilot.requestAnswerModification("expand")}
        onCaptureCoding={() => void copilot.captureCodingAnswer()}
        onAdjustRegion={() => void copilot.adjustRegionCodingAnswer()}
        onEndSession={handleStop}
        onManualQuestion={handleManualQuestion}
        onStartSession={handleSetup}
        onSetupNewSession={() => setPhase("setup")}
        onReconnectAudio={() => void copilot.reconnectAudio?.()}
        lastSessionId={lastSessionId}
        isPreparingSession={copilot.isPreparingSession}
        prepStepIndex={copilot.prepStepIndex}
        interviewType={config.interview_type}
      />

      {/* Recovery pill — visible when overlay is hidden during an active/paused session */}
      {(isActive || isPaused) && !overlayVisible && (
        <button
          onClick={() => {
            const store = useOverlayStore.getState();
            if (store.is_peek_active) {
              store.restoreOverlay?.();
            } else {
              store.showOverlay();
            }
          }}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity"
        >
          <Eye className="w-4 h-4" />
          Restore Overlay
        </button>
      )}

      {/* Stream error banner */}
      {streamErrorMessage && !overlayVisible && (
        <div className="mx-auto max-w-md mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{streamErrorMessage}</span>
          <button
            type="button"
            onClick={() => void copilot.reconnectAudio?.()}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Centre content */}
      <div className="flex items-center justify-center min-h-[60vh] pt-14 px-4">
        <div className="text-center space-y-3">
          {isActive ? (
            <>
              <p className="text-lg font-semibold text-foreground">Overlay Mode Active</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {isMobile
                  ? "Live overlay shortcuts and floating desktop overlay are limited on phones. Use a desktop browser or the Clarify desktop app for Ctrl+Shift+H / Ctrl+Shift+P."
                  : (
                    <>
                      The overlay is floating on your screen. Use{" "}
                      <kbd className="hotkey-badge">Ctrl+Shift+H</kbd> to toggle visibility/minimize.
                    </>
                  )}
              </p>
              {!isMobile && (
                <p className="text-xs text-muted-foreground/60">
                  Press <kbd className="hotkey-badge">Ctrl+Shift+P</kbd> for calm coaching steps
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-foreground">Session Ended</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Review your results or start a new session.
              </p>
              <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
                {lastSessionId && (
                  <Link
                    to={`/app/scorecard/${lastSessionId}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 text-sm font-medium rounded-xl transition-all"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    View Scorecard
                  </Link>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  onClick={() => setPhase("setup")}
                >
                  Start New Session
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

