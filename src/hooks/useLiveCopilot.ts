import { useCallback, useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useCoachStore } from "@/store/coachStore";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAudioSession } from "./useAudioSession";
import { useAudioStore } from "@/store/audioStore";
import { routeHint } from "@/lib/ai/modelRouter";
import { checkCredits, deductCredits } from "@/lib/billing/creditsManager";
import { buildResumeContext, generateResumeTalkingPoints, formatTalkingPointsAsHint } from "@/lib/ai/resumeFallback";
import { hotkeyManager } from "@/lib/overlay/hotkeys";
import { createDragHandler } from "@/lib/overlay/stealthMouse";
import { generateId } from "@/lib/utils";
import { sessionsDB } from "@/lib/supabase/database";
import { supabase } from "@/lib/supabase/client";
import { toDbModel } from "@/lib/ai/modelMapping";
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
  overlayRef?: React.RefObject<HTMLDivElement> | null;
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
    enableSystemAudio: config.enable_system_audio ?? false,
    micDeviceId:       null,
    onQuestionDetected: handleQuestionDetected,
    onFillerDetected:   (count: number) => {
      useSessionStore.getState().setFillerCount(count);
    },
    onWPMUpdate: (wpm: number) => {
      useSessionStore.getState().setCurrentWPM(wpm);
    },
  });

  const configRef = useRef(config);
  configRef.current = config;

  const initSessionFromConfig = useCallback(() => {
    if (!profile) return;
    const cfg = configRef.current;

    const { active_context } = useDocumentStore.getState();

    // FIX: active_context shape is { resume: { content }, jd: {...} }
    // The old field `resume_version?.parsed_data` no longer exists.
    const parsed = (active_context?.resume as any)?.content ?? null;
    const resumeCtx = buildResumeContext(parsed);
    const talkingPoints = generateResumeTalkingPoints(parsed, {
      company: cfg.company,
      role: cfg.role,
      interview_type: cfg.interview_type as any,
    });
    const overlay = useOverlayStore.getState();
    overlay.setResumeContext(resumeCtx);
    overlay.setResumeTalkingPoints(talkingPoints);

    if (cfg.simple_language !== undefined) {
      overlay.setSimpleLanguage(cfg.simple_language);
    }
    if (cfg.save_transcript !== undefined) {
      overlay.setSaveTranscript(cfg.save_transcript);
    }
    if (cfg.session_call_type !== undefined) {
      overlay.setSessionCallType(cfg.session_call_type);
    }
    const liveConfig = cfg as LiveSessionConfig;
    if (liveConfig.language) {
      overlay.setSessionLanguage(liveConfig.language);
    }

    const sessionStore = useSessionStore.getState();
    sessionStore.setSessionId(sessionIdRef.current);
    sessionStore.setMode("live");
    sessionStore.setConfig(cfg);
    sessionStore.setStatus("active");
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    hotkeyManager.register();
    return () => { hotkeyManager.unregister(); };
  }, []);

  // ── Overlay drag ───────────────────────────────────────────────
  useEffect(() => {
    if (!overlayRef?.current) return;

    dragCleanupRef.current = createDragHandler(
      overlayRef.current,
      (pos) => useOverlayStore.getState().setPosition(pos)
    );

    return () => { dragCleanupRef.current?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Session ticker handled by LiveSessionController to avoid double-increment

  // ── Handle detected question ───────────────────────────────────
  function handleQuestionDetected(question: string): void {
    if (question === lastQuestionRef.current) return;
    lastQuestionRef.current = question;
    useOverlayStore.getState().setCurrentQuestion(question);
    if (useOverlayStore.getState().auto_generate) {
      requestLiveHint(question);
    }
  }

  // ── Generate full answer via generate-answer edge function ──────
  async function requestFullAnswer(
    question: string,
    sessionId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const overlay = useOverlayStore.getState();
    overlay.setHintState("generating");

    const resumeCtx = overlay.resume_context;
    const cfg = configRef.current;

    const { data, error } = await supabase.functions.invoke("generate-answer", {
      body: {
        question,
        transcript:     "",
        resume_context: resumeCtx?.summary ?? "",
        interview_type: cfg.interview_type ?? "behavioral",
        target_company: cfg.company ?? "",
        session_id:     sessionId,
      },
    });

    if (error) {
      useOverlayStore.getState().setError(
        error.message || "Failed to generate full answer"
      );
      return;
    }

    // The edge function returns SSE via streaming.
    // supabase.functions.invoke returns the full response body as text/json
    // when Content-Type is text/event-stream, we need to parse SSE lines.
    if (typeof data === "string") {
      // Parse SSE data
      const lines = data.split("\n");
      let fullText = "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.text) {
            fullText += parsed.text;
            useOverlayStore.getState().appendStreamChunk(parsed.text);
          }
        } catch {
          // skip malformed chunks
        }
      }
      if (fullText) {
        useOverlayStore.getState().commitStreamedHint();
      }
    } else if (data?.error) {
      useOverlayStore.getState().setError(data.error);
    }
  }

  // ── Request live hint ──────────────────────────────────────────
  const requestLiveHint = useCallback(async (question: string) => {
    if (!profile) return;

    // Rebuild context from current document store state (supports mid-session doc changes)
    const currentDocContext = useDocumentStore.getState().active_context;

    const context = coachStore.getContext();
    if (!context) return;

    const selectedModel = useOverlayStore.getState().active_model;
    const creditCheck = checkCredits(selectedModel);
    if (!creditCheck.canProceed) {
      const overlay = useOverlayStore.getState();
      const tp = overlay.resume_talking_points;
      if (tp) {
        overlay.setOfflineFallback(formatTalkingPointsAsHint(tp));
      } else {
        overlay.setError(creditCheck.reason ?? "Out of credits");
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = generateId();
    const overlay = useOverlayStore.getState();
    overlay.setCurrentQuestion(question);
    overlay.setHintState("generating");

    // ── Check answer_mode to decide which path to take ──
    const answerMode = useOverlayStore.getState().answer_mode;

    if (answerMode === "full_answer") {
      // Full STAR answer via dedicated edge function
      try {
        await requestFullAnswer(question, sessionIdRef.current, controller.signal);
        // Credits are deducted server-side in generate-answer edge function
        // FIX: use creditCheck.creditsRequired instead of hardcoded 2
        // so the local session counter stays in sync with the credit model.
        useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
      } catch (err) {
        if (!controller.signal.aborted) {
          useOverlayStore.getState().setError(
            err instanceof Error ? err.message : "Full answer generation failed"
          );
        }
      }
    } else {
      // Hint mode — use routeHint as before
      await routeHint({
        question,
        context,
        preferredModel: selectedModel,
        interviewType:  context.session_type,
        isLive:         true,
        sessionId:      sessionIdRef.current,
        questionId:     requestId,
        simpleLanguage: useOverlayStore.getState().simple_language,
        callType:       useOverlayStore.getState().session_call_type,
        language:       useOverlayStore.getState().session_language,
        answerMode:     "hint",
        onChunk:  (chunk) => useOverlayStore.getState().appendStreamChunk(chunk),
        onDone:   async (_fullText) => {
          useOverlayStore.getState().commitStreamedHint();
          const result = await deductCredits(selectedModel, sessionIdRef.current);
          if (result.success) {
            useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
          }
        },
        onError:  (error) => useOverlayStore.getState().setError(error.message),
        signal:   controller.signal,
      });
    }
  }, [profile, coachStore]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitManualQuestion = useCallback(async (question: string) => {
    if (!profile) return;

    // Rebuild context from current document store state (supports mid-session doc changes)
    const currentDocContext = useDocumentStore.getState().active_context;

    const context = coachStore.getContext();
    if (!context) return;

    useOverlayStore.getState().addChatMessage({
      role: "user",
      text: question,
      timestamp: Date.now(),
    });

    const selectedModel = useOverlayStore.getState().active_model;
    const creditCheck = checkCredits(selectedModel);
    if (!creditCheck.canProceed) {
      const overlay = useOverlayStore.getState();
      const tp = overlay.resume_talking_points;
      useOverlayStore.getState().addChatMessage({
        role: "assistant",
        text: tp ? formatTalkingPointsAsHint(tp) : (creditCheck.reason ?? "Out of credits"),
        timestamp: Date.now(),
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = generateId();
    useOverlayStore.getState().setChatGenerating(true);

    let chatBuffer = "";

    await routeHint({
      question,
      context,
      preferredModel: selectedModel,
      interviewType: context.session_type,
      isLive: true,
      sessionId: sessionIdRef.current,
      questionId: requestId,
      simpleLanguage: useOverlayStore.getState().simple_language,
      callType:       useOverlayStore.getState().session_call_type,
      language:       useOverlayStore.getState().session_language,
      onChunk: (chunk) => { chatBuffer += chunk; },
      onDone: async () => {
        if (chatBuffer) {
          useOverlayStore.getState().addChatMessage({
            role: "assistant",
            text: chatBuffer,
            timestamp: Date.now(),
          });
        } else {
          useOverlayStore.getState().setChatGenerating(false);
        }
        const result = await deductCredits(selectedModel, sessionIdRef.current);
        if (result.success) {
          useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
        }
      },
      onError: (error) => {
        useOverlayStore.getState().setChatGenerating(false);
        useOverlayStore.getState().addChatMessage({
          role: "assistant",
          text: `Error: ${error.message}`,
          timestamp: Date.now(),
        });
      },
      signal: controller.signal,
    });
  }, [profile, coachStore]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLiveSession = useCallback(async () => {
    sessionIdRef.current = generateId();
    initSessionFromConfig();
    useOverlayStore.getState().showOverlay();

    const userId = profile?.id;
    if (userId) {
      try {
        await sessionsDB.create({
          id:         sessionIdRef.current,
          user_id:    userId,
          type:       "live",
          status:     "active",
          started_at: new Date().toISOString(),
          model_used: toDbModel(useOverlayStore.getState().active_model) as any,
        });
      } catch (err) {
        console.error("[useLiveCopilot] Failed to create session record:", err);
      }
    }

    await audio.start();
  }, [audio.start, initSessionFromConfig, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const endLiveSession = useCallback(async () => {
    abortRef.current?.abort();
    audio.stop();

    const session  = useSessionStore.getState();
    const overlay  = useOverlayStore.getState();
    const userId   = profile?.id;

    if (userId && session.session_id) {
      try {
        const audioState = useAudioStore.getState();
        const fullTranscript = audioState.transcript?.full_transcript ?? "";
        const utterances = audioState.transcript?.utterances ?? [];
        const questionCount = utterances.filter((u) => u.is_interviewer_question).length;

        const dbModel = toDbModel(overlay.active_model);
        const saveTranscript = useOverlayStore.getState().save_transcript;

        await sessionsDB.update(session.session_id, {
          status:            "completed",
          credits_used:      session.credits_consumed,
          model_used:        dbModel as any,
          ended_at:          new Date().toISOString(),
          filler_words:      session.filler_count,
          avg_wpm:           session.current_wpm,
          hints_used:        overlay.hint_history.length,
          answers_generated: overlay.hint_history.length,
          questions_asked:   questionCount,
          notes:             (saveTranscript && fullTranscript) ? fullTranscript : null,
        });

        if (fullTranscript && userId && saveTranscript) {
          try {
            await supabase.from("session_transcripts").insert({
              session_id: session.session_id,
              user_id:    userId,
              content:    fullTranscript,
              speaker:    "combined",
              is_final:   true,
            });
          } catch {
            // silently ignore transcript save failure
          }
        }

        for (const hint of overlay.hint_history) {
          try {
            await (supabase.from("session_ai_interactions") as any).insert({
              session_id: session.session_id,
              user_id:    userId,
              type:       "hint",
              prompt:     hint.question,
              response:   hint.hint,
              model:      dbModel,
            });
          } catch {
            // silently ignore interaction save failure
          }
        }
      } catch (err) {
        console.error("[useLiveCopilot] Failed to persist session:", err);
      }
    }

    useSessionStore.getState().setStatus("completed");
    useOverlayStore.getState().hideOverlay();
  }, [audio.stop, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProctorSafe = useCallback(() => {
    const { is_proctor_safe, setProctorSafe } = useOverlayStore.getState();
    setProctorSafe(!is_proctor_safe);
  }, []);

  const toggleSystemAudio = useCallback(async () => {
    await audio.toggleSystemAudio();
  }, [audio.toggleSystemAudio]);

  return {
    startLiveSession,
    endLiveSession,
    toggleMute:        audio.toggleMute,
    toggleSystemAudio,
    reconnectAudio:    audio.reconnect,
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
