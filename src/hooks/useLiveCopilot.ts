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
// The full live interview co-pilot hook.
// Combines: audio session + question detection + streaming hints
//           + hotkeys + drag + credit gating + stealth mode
// ─────────────────────────────────────────────────────────────────

interface UseLiveCopilotOptions {
  config:      LiveSessionConfig;
  overlayRef:  React.RefObject<HTMLDivElement>;
}

export function useLiveCopilot({ config, overlayRef }: UseLiveCopilotOptions) {
  const overlayStore = useOverlayStore();
  const sessionStore = useSessionStore();
  const coachStore   = useCoachStore();
  const { profile }  = useAuthStore();

  const abortRef      = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const dragCleanupRef  = useRef<(() => void) | null>(null);
  const sessionIdRef    = useRef<string>(generateId());

  // ── Audio session ─────────────────────────────────────────────

  const audio = useAudioSession({
    enableSystemAudio: config.enable_system_audio,
    micDeviceId:       config.mic_device_id,
    onQuestionDetected: handleQuestionDetected,
    onFillerDetected:   (count) => sessionStore.setCurrentWPM(count),
    onWPMUpdate:        (wpm)   => sessionStore.setCurrentWPM(wpm),
  });

  // ── Initialise ────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return;

    // Build coaching context
    const { active_context } = useDocumentStore.getState();
    const context = buildCoachingContext(profile, config, active_context);
    coachStore.initContext(context);

    // Init session state
    sessionStore.setSessionId(sessionIdRef.current);
    sessionStore.setMode("live");
    sessionStore.setConfig(config);
    sessionStore.setStatus("in_progress");

    // Register hotkeys
    hotkeyManager.register();

    return () => {
      hotkeyManager.unregister();
    };
  }, []);

  // ── Overlay drag ──────────────────────────────────────────────

  useEffect(() => {
    if (!overlayRef.current) return;

    dragCleanupRef.current = createDragHandler(
      overlayRef.current,
      (pos) => overlayStore.setPosition(pos)
    );

    return () => {
      dragCleanupRef.current?.();
    };
  }, [overlayRef.current]);

  // ── Session ticker ────────────────────────────────────────────

  useEffect(() => {
    if (sessionStore.status !== "in_progress") return;

    const tick = setInterval(() => {
      sessionStore.tickElapsed();
    }, 1000);

    return () => clearInterval(tick);
  }, [sessionStore.status]);

  // ── Handle detected question ──────────────────────────────────

  function handleQuestionDetected(question: string): void {
    // Deduplicate — don't re-trigger for same question
    if (question === lastQuestionRef.current) return;
    lastQuestionRef.current = question;

    requestLiveHint(question);
  }

  // ── Request live hint ─────────────────────────────────────────

  const requestLiveHint = useCallback(async (question: string) => {
    if (!profile) return;

    const context = coachStore.getContext();
    if (!context) return;

    // Credit check
    const creditCheck = checkCredits(profile.preferred_model);
    if (!creditCheck.canProceed) {
      overlayStore.setError(creditCheck.reason ?? "Out of credits");
      return;
    }

    // Abort previous
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = generateId();

    overlayStore.setCurrentQuestion(question);
    overlayStore.setHintState("generating");

    await routeHint({
      question,
      context,
      preferredModel: profile.preferred_model,
      interviewType:  context.session_type,
      isLive:         true,
      sessionId:      sessionIdRef.current,
      questionId:     requestId,
      onChunk:        (chunk) => overlayStore.appendStreamChunk(chunk),
      onDone:         async (fullText) => {
        overlayStore.commitStreamedHint();
        await deductCredits(profile.preferred_model, sessionIdRef.current);
        sessionStore.consumeCredit(creditCheck.creditsRequired);
      },
      onError:        (error) => overlayStore.setError(error.message),
      signal:         controller.signal,
    });
  }, [profile]);

  // ── Manual question override ──────────────────────────────────
  // User can type a question manually if auto-detect misses it

  const submitManualQuestion = useCallback((question: string) => {
    lastQuestionRef.current = question;
    requestLiveHint(question);
  }, [requestLiveHint]);

  // ── Start live session ────────────────────────────────────────

  const startLiveSession = useCallback(async () => {
    overlayStore.showOverlay();
    await audio.start();
  }, [audio.start]);

  // ── End live session ──────────────────────────────────────────

  const endLiveSession = useCallback(async () => {
    abortRef.current?.abort();
    audio.stop();
    sessionStore.setStatus("completed");
    overlayStore.hideOverlay();
  }, [audio.stop]);

  // ── Toggle proctor safe mode ──────────────────────────────────

  const toggleProctorSafe = useCallback(() => {
    const { is_proctor_safe, setProctorSafe } = useOverlayStore.getState();
    setProctorSafe(!is_proctor_safe);

    if (!is_proctor_safe && overlayRef.current) {
      const { getProctorSafePosition } = require("@/lib/overlay/stealthMouse");
      const pos = getProctorSafePosition(
        overlayRef.current.offsetWidth,
        overlayRef.current.offsetHeight
      );
      overlayStore.setPosition(pos);
    }
  }, []);

  return {
    // Audio
    startLiveSession,
    endLiveSession,
    toggleMute:        audio.toggleMute,
    reconnectAudio:    audio.reconnect,
    isCapturing:       audio.isCapturing,
    isMuted:           audio.isMuted,
    deepgramStatus:    audio.deepgramStatus,
    currentLevel:      audio.currentLevel,
    isSpeaking:        audio.isSpeaking,
    streamError:       audio.streamError,

    // Hint
    requestLiveHint,
    submitManualQuestion,
    abortHint:         () => {
      abortRef.current?.abort();
      overlayStore.clearHint();
    },

    // Overlay
    toggleProctorSafe,
    hotkeyHelp:        hotkeyManager.getHelpItems(),

    // Session
    elapsedSeconds:    sessionStore.elapsed_seconds,
    creditsConsumed:   sessionStore.credits_consumed,
    status:            sessionStore.status,
  };
}
