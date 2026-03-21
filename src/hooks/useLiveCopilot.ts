import { useCallback, useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useCoachStore } from "@/store/coachStore";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAudioSession } from "./useAudioSession";
import { buildCoachingContext } from "@/lib/ai/contextEnvelopeBuilder";
import { routeHint } from "@/lib/ai/modelRouter";
import { checkCredits, deductCredits } from "@/lib/billing/creditsManager";
import { hotkeyManager } from "@/lib/overlay/hotkeys";
import { createDragHandler } from "@/lib/overlay/stealthMouse";
import { generateId } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// useLiveCopilot
// Master hook for live AI co-pilot sessions.
//
// Pattern:  reactive state → individual selectors
//           store actions  → useXxxStore.getState() inside callbacks
// This prevents the full-store-object anti-pattern that causes
// re-render loops when audio/session state ticks every second.
// ─────────────────────────────────────────────────────────────────

interface UseLiveCopilotOptions {
  config:     LiveSessionConfig;
  overlayRef: React.RefObject<HTMLDivElement>;
}

export function useLiveCopilot({ config, overlayRef }: UseLiveCopilotOptions) {
  // ── Reactive state: individual selectors only ──────────────────
  const { profile }        = useAuthStore();
  const sessionStatus      = useSessionStore((s) => s.status);
  const elapsedSeconds     = useSessionStore((s) => s.elapsed_seconds);
  const creditsConsumed    = useSessionStore((s) => s.credits_consumed);

  // ── Non-reactive stores accessed via ref to keep callbacks stable
  const coachStore  = useCoachStore();

  // ── Refs ───────────────────────────────────────────────────────
  const abortRef        = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const dragCleanupRef  = useRef<(() => void) | null>(null);
  const sessionIdRef    = useRef<string>(generateId());

  // ── Audio session ──────────────────────────────────────────────
  const audio = useAudioSession({
    enableSystemAudio: config.stealth_mode ?? false,
    micDeviceId:       null,
    onQuestionDetected: handleQuestionDetected,
    onFillerDetected:   (count: number) => {
      useSessionStore.getState().setCurrentWPM(count);
    },
    onWPMUpdate: (wpm: number) => {
      useSessionStore.getState().setCurrentWPM(wpm);
    },
  });

  // ── Initialise session ─────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;

    const { active_context } = useDocumentStore.getState();
    const context = buildCoachingContext(profile, config, active_context);
    coachStore.initContext(context);

    const sessionStore = useSessionStore.getState();
    sessionStore.setSessionId(sessionIdRef.current);
    sessionStore.setMode("live");
    sessionStore.setConfig(config);
    sessionStore.setStatus("active");

    hotkeyManager.register();
    return () => { hotkeyManager.unregister(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Overlay drag ───────────────────────────────────────────────
  useEffect(() => {
    if (!overlayRef.current) return;

    dragCleanupRef.current = createDragHandler(
      overlayRef.current,
      (pos) => useOverlayStore.getState().setPosition(pos)
    );

    return () => { dragCleanupRef.current?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session ticker ─────────────────────────────────────────────
  useEffect(() => {
    if (sessionStatus !== "active") return;

    const tick = setInterval(() => {
      // getState() avoids stale closure — always calls the live action
      useSessionStore.getState().tickElapsed();
    }, 1000);

    return () => clearInterval(tick);
  }, [sessionStatus]);

  // ── Handle detected question ───────────────────────────────────
  function handleQuestionDetected(question: string): void {
    if (question === lastQuestionRef.current) return;
    lastQuestionRef.current = question;
    requestLiveHint(question);
  }

  // ── Request live hint ──────────────────────────────────────────
  const requestLiveHint = useCallback(async (question: string) => {
    if (!profile) return;

    const context = coachStore.getContext();
    if (!context) return;

    const creditCheck = checkCredits(profile.preferred_model);
    if (!creditCheck.canProceed) {
      useOverlayStore.getState().setError(creditCheck.reason ?? "Out of credits");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = generateId();
    const overlay = useOverlayStore.getState();
    overlay.setCurrentQuestion(question);
    overlay.setHintState("generating");

    await routeHint({
      question,
      context,
      preferredModel: profile.preferred_model,
      interviewType:  context.session_type,
      isLive:         true,
      sessionId:      sessionIdRef.current,
      questionId:     requestId,
      onChunk:  (chunk) => useOverlayStore.getState().appendStreamChunk(chunk),
      onDone:   async (_fullText) => {
        useOverlayStore.getState().commitStreamedHint();
        await deductCredits(profile.preferred_model, sessionIdRef.current);
        useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
      },
      onError:  (error) => useOverlayStore.getState().setError(error.message),
      signal:   controller.signal,
    });
  }, [profile, coachStore]);

  const submitManualQuestion = useCallback((question: string) => {
    lastQuestionRef.current = question;
    requestLiveHint(question);
  }, [requestLiveHint]);

  const startLiveSession = useCallback(async () => {
    useOverlayStore.getState().showOverlay();
    await audio.start();
  }, [audio.start]);

  const endLiveSession = useCallback(async () => {
    abortRef.current?.abort();
    audio.stop();
    useSessionStore.getState().setStatus("completed");
    useOverlayStore.getState().hideOverlay();
  }, [audio.stop]);

  const toggleProctorSafe = useCallback(() => {
    const { is_proctor_safe, setProctorSafe } = useOverlayStore.getState();
    setProctorSafe(!is_proctor_safe);
  }, []);

  return {
    startLiveSession,
    endLiveSession,
    toggleMute:     audio.toggleMute,
    reconnectAudio: audio.reconnect,
    isCapturing:    audio.isCapturing,
    isMuted:        audio.isMuted,
    deepgramStatus: audio.deepgramStatus,
    currentLevel:   audio.currentLevel,
    isSpeaking:     audio.isSpeaking,
    streamError:    audio.streamError,
    requestLiveHint,
    submitManualQuestion,
    abortHint: () => {
      abortRef.current?.abort();
      useOverlayStore.getState().clearHint();
    },
    toggleProctorSafe,
    hotkeyHelp:     hotkeyManager.getHelpItems(),
    elapsedSeconds,
    creditsConsumed,
    status: sessionStatus,
  };
}
