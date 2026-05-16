// src/hooks/useLiveCopilot.ts — FIXED (full-answer passes model)

import { useCallback, useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useCoachStore } from "@/store/coachStore";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAudioSession } from "./useAudioSession";
import { useAudioStore } from "@/store/audioStore";
import { routeHint } from "@/lib/ai/modelRouter";
import { streamFullAnswer } from "@/lib/ai/geminiClient";
import { checkCredits, deductCredits } from "@/lib/billing/creditsManager";
import {
  buildResumeContext,
  generateResumeTalkingPoints,
  formatTalkingPointsAsHint
} from "@/lib/ai/resumeFallback";
import { hotkeyManager } from "@/lib/overlay/hotkeys";
import { createDragHandler } from "@/lib/overlay/stealthMouse";
import { generateId } from "@/lib/utils";
import { sessionsDB } from "@/lib/supabase/database";
import { getOrCreateSession, activateSession } from "@/lib/session/sessionLifecycle";
import { supabase } from "@/lib/supabase/client";
import { toDbModel } from "@/lib/ai/modelMapping";
import type { LiveSessionConfig } from "@/types/session.types";

interface UseLiveCopilotOptions {
  config: LiveSessionConfig;
  overlayRef?: React.RefObject<HTMLDivElement> | null;
  sessionType?: "live" | "mock" | "warmup" | "rehearsal";
  existingSessionId?: string | null;
}

export function useLiveCopilot({
  config,
  overlayRef,
  sessionType = "live",
  existingSessionId
}: UseLiveCopilotOptions) {
  const { profile } = useAuthStore();
  const sessionStatus = useSessionStore((s) => s.status);
  const elapsedSeconds = useSessionStore((s) => s.elapsed_seconds);
  const creditsConsumed = useSessionStore((s) => s.credits_consumed);

  const coachStore = useCoachStore();

  const abortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string>(generateId());

  const audio = useAudioSession({
    enableSystemAudio: config.enable_system_audio ?? false,
    micDeviceId: null,
    onQuestionDetected: handleQuestionDetected,
    onFillerDetected: (count: number) => {
      useSessionStore.getState().setFillerCount(count);
    },
    onWPMUpdate: (wpm: number) => {
      useSessionStore.getState().setCurrentWPM(wpm);
    },
  });

  const configRef = useRef(config);
  configRef.current = config;
  const existingSessionIdRef = useRef(existingSessionId ?? null);
  existingSessionIdRef.current = existingSessionId ?? null;

  const initSessionFromConfig = useCallback(() => {
    if (!profile) return;
    const cfg = configRef.current;

    const { active_context } = useDocumentStore.getState();
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

    if (cfg.simple_language !== undefined) overlay.setSimpleLanguage(cfg.simple_language);
    if (cfg.save_transcript !== undefined) overlay.setSaveTranscript(cfg.save_transcript);
    if (cfg.session_call_type !== undefined) overlay.setSessionCallType(cfg.session_call_type);

    const liveConfig = cfg as LiveSessionConfig;
    if (liveConfig.language) overlay.setSessionLanguage(liveConfig.language);

    const sessionStore = useSessionStore.getState();
    sessionStore.setSessionId(sessionIdRef.current);
    sessionStore.setMode("live");
    sessionStore.setConfig(cfg);
    sessionStore.setStatus("active");
  }, [profile]);

  useEffect(() => {
    hotkeyManager.register();
    return () => {
      hotkeyManager.unregister();
    };
  }, []);

  useEffect(() => {
    if (!overlayRef?.current) return;

    dragCleanupRef.current = createDragHandler(
      overlayRef.current,
      (pos) => useOverlayStore.getState().setPosition(pos)
    );

    return () => {
      dragCleanupRef.current?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQuestionDetected(question: string): void {
    if (question === lastQuestionRef.current) return;
    lastQuestionRef.current = question;
    useOverlayStore.getState().setCurrentQuestion(question);
    if (useOverlayStore.getState().auto_generate) {
      requestLiveHint(question);
    }
  }

  function mapOverlayModelToGeminiModel(active: string): "gemini-2.5-flash" | "gemini-2.5-pro" {
    // If user selects Gemini Pro => stronger reasoning
    if (active === "gemini-pro") return "gemini-2.5-pro";
    // Default to flash for speed
    return "gemini-2.5-flash";
  }

  async function requestFullAnswer(question: string, signal: AbortSignal): Promise<void> {
    const overlay = useOverlayStore.getState();
    overlay.setHintState("generating");

    const resumeCtx = overlay.resume_context;
    const cfg = configRef.current;

    const context = {
      session_type: cfg.interview_type ?? "behavioral",
      target_company: cfg.company ?? "",
      last_transcript: "",
      resume_experience_summary: resumeCtx?.summary ?? "",
      hint_style: "concise",
      simple_language: false,
    } as unknown as Parameters<typeof streamFullAnswer>[0]["context"];

    const activeModel = useOverlayStore.getState().active_model as any;
    const geminiModel = mapOverlayModelToGeminiModel(activeModel);

    let fullText = "";
    await streamFullAnswer({
      question,
      context,
      model: geminiModel,
      simpleLanguage: false,
      onChunk: (chunk) => {
        fullText += chunk;
        useOverlayStore.getState().appendStreamChunk(chunk);
      },
      onDone: () => {
        if (fullText) useOverlayStore.getState().commitStreamedHint();
      },
      onError: (err) => {
        useOverlayStore.getState().setError(err.message || "Failed to generate full answer");
      },
      signal,
    });
  }

  const requestLiveHint = useCallback(async (question: string) => {
    if (!profile) return;

    const context = coachStore.getContext();
    if (!context) return;

    const selectedModel = useOverlayStore.getState().active_model;
    const creditCheck = checkCredits(selectedModel);

    if (!creditCheck.canProceed) {
      const overlay = useOverlayStore.getState();
      const tp = overlay.resume_talking_points;
      if (tp) overlay.setOfflineFallback(formatTalkingPointsAsHint(tp));
      else overlay.setError(creditCheck.reason ?? "Out of credits");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = generateId();
    const overlay = useOverlayStore.getState();
    overlay.setCurrentQuestion(question);
    overlay.setHintState("generating");

    const answerMode = useOverlayStore.getState().answer_mode;

    if (answerMode === "full_answer") {
      try {
        await requestFullAnswer(question, controller.signal);
        useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
      } catch (err) {
        if (!controller.signal.aborted) {
          useOverlayStore.getState().setError(
            err instanceof Error ? err.message : "Full answer generation failed"
          );
        }
      }
    } else {
      await routeHint({
        question,
        context,
        preferredModel: selectedModel,
        interviewType: context.session_type,
        isLive: true,
        sessionId: sessionIdRef.current,
        questionId: requestId,
        simpleLanguage: useOverlayStore.getState().simple_language,
        callType: useOverlayStore.getState().session_call_type,
        language: useOverlayStore.getState().session_language,
        answerMode: "hint",
        onChunk: (chunk) => useOverlayStore.getState().appendStreamChunk(chunk),
        onDone: async () => {
          useOverlayStore.getState().commitStreamedHint();
          const result = await deductCredits(selectedModel, sessionIdRef.current);
          if (result.success) {
            useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
          }
        },
        onError: (error) => useOverlayStore.getState().setError(error.message),
        signal: controller.signal,
      });
    }
  }, [profile, coachStore]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitManualQuestion = useCallback(async (question: string) => {
    if (!profile) return;

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
      callType: useOverlayStore.getState().session_call_type,
      language: useOverlayStore.getState().session_language,
      answerMode: "full_answer",
      onChunk: (chunk) => { chatBuffer += chunk; },
      onDone: async () => {
        useOverlayStore.getState().setChatGenerating(false);
        if (chatBuffer) {
          useOverlayStore.getState().addChatMessage({
            role: "assistant",
            text: chatBuffer,
            timestamp: Date.now(),
          });
        } else {
          useOverlayStore.getState().addChatMessage({
            role: "assistant",
            text: "No response received. Please try again.",
            timestamp: Date.now(),
          });
        }
        useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
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
    const userId = profile?.id;
    if (!userId) throw new Error("Please sign in to start a live session.");

    const cfg = configRef.current;
    try {
      const reusableSessionId = existingSessionIdRef.current;
      if (reusableSessionId) {
        sessionIdRef.current = reusableSessionId;
        await activateSession(reusableSessionId);
      } else {
        const { session } = await getOrCreateSession({
          user_id: userId,
          type: sessionType,
          title: cfg.company
            ? `${sessionType === "mock" ? "Mock" : sessionType === "warmup" ? "Warmup" : "Live"} — ${cfg.company}`
            : sessionType === "mock"
              ? "Mock interview"
              : sessionType === "warmup"
                ? "Mock warmup"
                : "Live co-pilot",
          document_id: cfg.resume_id ?? null,
          jd_id: cfg.jd_id ?? null,
          model_used: toDbModel(useOverlayStore.getState().active_model) as any,
        });
        sessionIdRef.current = session.id;
        await activateSession(session.id);
      }
    } catch (err) {
      console.error("[useLiveCopilot] Failed to create/reuse session record:", err);
      throw err instanceof Error ? err : new Error("Failed to start live session");
    }

    initSessionFromConfig();
    useOverlayStore.getState().showOverlay();
    await audio.start();
  }, [audio.start, initSessionFromConfig, profile?.id, sessionType]); // eslint-disable-line react-hooks/exhaustive-deps

  const endLiveSession = useCallback(async () => {
    abortRef.current?.abort();
    audio.stop();

    const session = useSessionStore.getState();
    const overlay = useOverlayStore.getState();
    const userId = profile?.id;

    if (userId && session.session_id) {
      try {
        const audioState = useAudioStore.getState();
        const fullTranscript = audioState.transcript?.full_transcript ?? "";
        const utterances = audioState.transcript?.utterances ?? [];
        const questionCount = utterances.filter((u) => u.is_interviewer_question).length;

        const dbModel = toDbModel(overlay.active_model);
        const saveTranscript = useOverlayStore.getState().save_transcript;

        await sessionsDB.update(session.session_id, {
          status: "completed",
          credits_used: session.credits_consumed,
          model_used: dbModel as any,
          ended_at: new Date().toISOString(),
          filler_words: session.filler_count,
          avg_wpm: session.current_wpm,
          hints_used: overlay.hint_history.length,
          answers_generated: overlay.hint_history.length,
          questions_asked: questionCount,
          notes: (saveTranscript && fullTranscript) ? fullTranscript : null,
        });

        if (fullTranscript && userId && saveTranscript) {
          try {
            await supabase.from("session_transcripts").insert({
              session_id: session.session_id,
              user_id: userId,
              content: fullTranscript,
              speaker: "combined",
              is_final: true,
            });
          } catch {
            // ignore
          }
        }

        for (const hint of overlay.hint_history) {
          try {
            await (supabase.from("session_ai_interactions") as any).insert({
              session_id: session.session_id,
              user_id: userId,
              type: "hint",
              prompt: hint.question,
              response: hint.hint,
              model: dbModel,
            });
          } catch {
            // ignore
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

  const pauseLiveSession = useCallback(() => {
    const cur = useSessionStore.getState();
    if (cur.status !== "active") return;
    try { if (!audio.isMuted) audio.toggleMute(); } catch { /* ignore */ }
    cur.setStatus("paused");
  }, [audio.isMuted, audio.toggleMute]);

  const resumeLiveSession = useCallback(() => {
    const cur = useSessionStore.getState();
    if (cur.status !== "paused") return;
    try { if (audio.isMuted) audio.toggleMute(); } catch { /* ignore */ }
    cur.setStatus("active");
  }, [audio.isMuted, audio.toggleMute]);

  return {
    startLiveSession,
    endLiveSession,
    pauseLiveSession,
    resumeLiveSession,
    toggleMute: audio.toggleMute,
    toggleSystemAudio,
    reconnectAudio: audio.reconnect,
    isCapturing: audio.isCapturing,
    isMuted: audio.isMuted,
    deepgramStatus: audio.deepgramStatus,
    currentLevel: audio.currentLevel,
    isSpeaking: audio.isSpeaking,
    streamError: audio.streamError,
    requestLiveHint,
    submitManualQuestion,
    abortHint: () => {
      abortRef.current?.abort();
      useOverlayStore.getState().clearHint();
    },
    toggleProctorSafe,
    hotkeyHelp: hotkeyManager.getHelpItems(),
    elapsedSeconds,
    creditsConsumed,
    status: sessionStatus,
  };
}
