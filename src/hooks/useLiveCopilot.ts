// src/hooks/useLiveCopilot.ts — PRODUCTION FIXED
// Fixes:
// - Stable question detection callback (no stale closure issues)
// - Fallback context if coachStore has not initialized (prevents silent no-op)
// - Chat generation always clears "generating" state (try/finally)
// - Chat path deductCredits consistency
// - Full-answer path deductCredits consistency (same as hint path)
// - Uses selected mic id from audioStore when available

import { useCallback, useRef, useEffect, useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useCoachStore } from "@/store/coachStore";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAudioSession } from "./useAudioSession";
import { useAudioStore } from "@/store/audioStore";
import { routeHint, routeAnswerGeneration } from "@/lib/ai/modelRouter";
import type { CoachingContext } from "@/types/ai.types";
import type { InterviewType } from "@/types/session.types";
import { checkCreditsForAction, refreshCredits } from "@/lib/billing/creditsManager";
import { captureCodingQuestionAndGenerateAnswer } from "@/lib/audio/screenshotCapture";
import { assertOnlineForCapture } from "@/lib/overlay/captureGating";
import {
  buildResumeContext,
  generateResumeTalkingPoints,
  formatTalkingPointsAsHint,
} from "@/lib/ai/resumeFallback";
import {
  loadPrimaryCoverLetterText,
} from "@/lib/documents/interviewContext";
import {
  getOrBuildSessionAiContext,
  lastTranscriptSlice,
} from "@/lib/ai/sessionAiContext";
import { parseResumeContentString } from "@/lib/documents/resumeParse";
import { getPrivateMode } from "@/hooks/usePrivateMode";
import { parsePrivacyPrefs } from "@/lib/privacy/privacyPrefs";
import { createDragHandler } from "@/lib/overlay/stealthMouse";
import { generateId } from "@/lib/utils";
import {
  questionFingerprint,
  hintIdempotencyKey,
  beginAutoHintIfIdle,
} from "@/lib/ai/questionDetection";
import { createLiveHintOperationId } from "@/lib/audio/liveQuestionGate";
import {
  jobDescriptionsDB,
  resumesDB,
} from "@/lib/supabase/database";
import { pairLiveSessionAnswers } from "@/lib/session/liveSessionAnswers";
import {
  clearLiveSessionCheckpoint,
  loadLiveSessionCheckpoint,
  saveLiveSessionCheckpoint,
} from "@/lib/session/liveSessionCheckpoint";
import { notifySessionsChanged } from "@/lib/session/sessionReuse";
import {
  activateSession,
  aiModeForSessionType,
  normalizeSessionLifecycleError,
  type SessionType,
} from "@/lib/session/sessionLifecycle";
import {
  startSession as startSessionApi,
  finalizeSession as finalizeSessionApi,
  endSession as endSessionApi,
  restoreOwnedSession,
} from "@/lib/api/sessions";
import { ApiClientError } from "@/lib/api/apiClient";
import { toDbModel } from "@/lib/ai/modelMapping";
import { markFirstListening, startAnswerLatencySpan, markAnswerLatency } from "@/lib/analytics/uxMetrics";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";
import {
  getAiUserFacingError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { noteProviderFailureFromError } from "@/lib/ai/providerAvailability";
import {
  beginOverlayProductSession,
  bindOverlayProductSessionId,
  markOverlayProductSessionActive,
  markOverlayProductSessionReady,
  markOverlayProductSessionTerminal,
  teardownOverlayProductSession,
} from "@/lib/session/overlayProductSession";
import { practiceCoachStartIdempotencyKey } from "@/lib/network/idempotency";
import { getOverlaySessionAuthority } from "@/store/overlaySessionAuthorityStore";

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
  existingSessionId,
}: UseLiveCopilotOptions) {
  const { profile, user } = useAuthStore();

  const sessionStatus = useSessionStore((s) => s.status);
  const elapsedSeconds = useSessionStore((s) => s.elapsed_seconds);
  const creditsConsumed = useSessionStore((s) => s.credits_consumed);

  const coachStore = useCoachStore();

  const abortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string>(generateId());
  /** Authoritative overlay generation for this live ownership. */
  const overlayGenerationRef = useRef<number>(0);
  /** When true, ignore late question / transcript / hint events. */
  const sessionEndedRef = useRef(false);
  const hintOperationIdRef = useRef<string | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const pendingCaptureMetaRef = useRef<{
    question: string;
    thumbnail?: string;
  } | null>(null);
  const screenshotRequestInFlightRef = useRef(false);

  const configRef = useRef(config);
  configRef.current = config;

  const existingSessionIdRef = useRef(existingSessionId ?? null);
  existingSessionIdRef.current = existingSessionId ?? null;
  /** Shared across double-click; cleared when the session ends so Start New Session is a new row. */
  const startAttemptKeyRef = useRef<string | null>(null);
  const startInFlightRef = useRef(false);

  const [isPreparingSession, setIsPreparingSession] = useState(false);
  const [prepStepIndex, setPrepStepIndex] = useState(0);

  const checkpointLiveSession = useCallback(() => {
    const sid = sessionIdRef.current;
    if (
      !sid ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sid)
    ) {
      return;
    }
    if (sessionEndedRef.current || getPrivateMode()) return;
    const overlay = useOverlayStore.getState();
    const audioState = useAudioStore.getState();
    saveLiveSessionCheckpoint({
      v: 1,
      session_id: sid,
      saved_at: Date.now(),
      full_transcript: audioState.transcript?.full_transcript ?? "",
      utterances: audioState.transcript?.utterances ?? [],
      hint_history: overlay.hint_history ?? [],
      current_question: overlay.current_question ?? "",
      current_hint: overlay.current_hint ?? "",
      elapsed_seconds: useSessionStore.getState().elapsed_seconds ?? 0,
    });
  }, []);

  // Periodic + visibility checkpoint so refresh can restore transcript/hints.
  useEffect(() => {
    if (sessionStatus !== "active") return;
    const tick = () => checkpointLiveSession();
    tick();
    const id = window.setInterval(tick, 8_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") tick();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", tick);
    };
  }, [sessionStatus, checkpointLiveSession]);

  // ✅ Use selected mic if present (setup wizard / device selection)
  const selectedMicId = useAudioStore((s) => s.setup?.selected_mic_id ?? null);

  /**
   * Fallback context builder — prevents silent failures when coach context isn't ready.
   * We keep the shape loose (as any) because routeHint expects your internal context structure.
   */
  const getSafeContext = useCallback((): any => {
    const cfg = configRef.current;
    const overlay = useOverlayStore.getState();
    const audioState = useAudioStore.getState();

    const transcript = audioState.transcript?.full_transcript ?? "";
    const lastTranscript = transcript.length > 2500 ? transcript.slice(-2500) : transcript;

    const summary =
      typeof overlay.resume_context === "string"
        ? overlay.resume_context
        : overlay.resume_context?.summary ?? "";

    return {
      user_id: profile?.id ?? "",
      full_name: profile?.full_name ?? null,
      role: cfg.role ?? (profile as any)?.target_role ?? null,
      domain: profile?.domain ?? null,
      experience_level: (profile?.experience_level as any) ?? null,
      years_of_experience: profile?.experience_years ?? null,
      target_company: cfg.company ?? "",
      coach_tone: ((profile as any)?.coach_tone as any) ?? "supportive",
      hint_style: (cfg.hint_style as any) ?? "short_hints",
      resume_skills: overlay.resume_context?.top_skills ?? [],
      resume_projects: [],
      resume_experience_summary: summary || null,
      jd_required_skills: [],
      jd_seniority_signals: [],
      gap_skills: [],
      session_goals: [],
      filler_words_to_watch: [],
      current_filler_count: 0,
      current_wpm: 0,
      session_type: cfg.interview_type ?? "behavioral",
      last_transcript: lastTranscript,
    };
  }, [profile]);

  /** Merge resume, JD, instructions, and live transcript into AI context. */
  const enrichContextForAi = useCallback(
    async (base: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const cfg = configRef.current;
      const userId = profile?.id;
      if (!userId) return base;

      const overlay = useOverlayStore.getState();
      const activeResume = useDocumentStore.getState().active_context.resume as
        | { content?: string | null }
        | null;
      const parsed = parseResumeContentString(activeResume?.content ?? null);

      const jdParts: string[] = [];
      if (Array.isArray(base.jd_required_skills) && base.jd_required_skills.length) {
        jdParts.push(`Required skills: ${(base.jd_required_skills as string[]).join(", ")}`);
      }
      if (cfg.role) jdParts.push(`Role: ${cfg.role}`);
      if (cfg.company) jdParts.push(`Company: ${cfg.company}`);

      const cached = await getOrBuildSessionAiContext({
        userId,
        resumeId: cfg.resume_id,
        jdId: cfg.jd_id,
        instructions: cfg.instructions,
        role: cfg.role,
        company: cfg.company,
        parsedResume: parsed,
        resumeContent: activeResume?.content ?? null,
        resumeSummary:
          typeof overlay.resume_context === "object"
            ? overlay.resume_context?.summary ?? null
            : String(overlay.resume_context ?? ""),
        jdSnippet: jdParts.join("\n") || null,
      });

      const resumeBlock = cached.resumeBlock;

      const lastTranscript = lastTranscriptSlice(
        useAudioStore.getState().transcript?.full_transcript ?? "",
      );

      return {
        ...base,
        resume_experience_summary: resumeBlock || String(base.resume_experience_summary ?? ""),
        resume_skills: cached.parsedSkills.length
          ? cached.parsedSkills
          : parsed?.skills ?? base.resume_skills,
        jd_required_skills: cached.jdKeywords.length
          ? cached.jdKeywords
          : base.jd_required_skills,
        last_transcript: lastTranscript,
      };
    },
    [profile],
  );

  /**
   * Initialize overlay/session stores based on selected config & documents.
   */
  const initSessionFromConfig = useCallback(async () => {
    if (!profile) return;

    const cfg = configRef.current;
    setPrepStepIndex(0);

    const activeResume = useDocumentStore.getState().active_context.resume as
      | { content?: string | null }
      | null;
    let parsed = parseResumeContentString(activeResume?.content ?? null);

    if (!parsed && cfg.resume_id) {
      try {
        const row = await resumesDB.getByIdMaybe(cfg.resume_id);
        const content = (row as { content?: string | null } | null)?.content;
        parsed = parseResumeContentString(content ?? null);
      } catch (err) {
        console.warn("[useLiveCopilot] resume load failed:", err);
      }
    }

    setPrepStepIndex(1);

    let resumeCtx = buildResumeContext(parsed);
    const coverText = profile.id ? await loadPrimaryCoverLetterText(profile.id) : null;
    if (coverText) {
      const coverSnippet = coverText.slice(0, 2500);
      if (resumeCtx) {
        resumeCtx = {
          ...resumeCtx,
          summary: [resumeCtx.summary, `Cover letter:\n${coverSnippet}`]
            .filter(Boolean)
            .join("\n\n"),
        };
      } else {
        resumeCtx = {
          skills_count: 0,
          experience_count: 0,
          total_years: null,
          top_skills: [],
          summary: coverSnippet,
        };
      }
    }
    const talkingPoints = generateResumeTalkingPoints(parsed, {
      company: cfg.company,
      role: cfg.role,
      interview_type: cfg.interview_type as any,
    });

    let jdRequiredSkills: string[] = [];
    let jdSeniority: string[] = [];
    if (cfg.jd_id) {
      try {
        const jd = await jobDescriptionsDB.getByIdMaybe(cfg.jd_id);
        const raw = jd as Record<string, unknown> | null;
        const skills = raw?.required_skills ?? raw?.skills;
        if (Array.isArray(skills)) {
          jdRequiredSkills = skills.filter((s): s is string => typeof s === "string");
        }
        const seniority = raw?.seniority_signals ?? raw?.seniority;
        if (Array.isArray(seniority)) {
          jdSeniority = seniority.filter((s): s is string => typeof s === "string");
        }
      } catch (err) {
        console.warn("[useLiveCopilot] JD load failed:", err);
      }
    }

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
    // Status becomes "active" only after audio pipeline starts (see startLiveSession).
    sessionStore.setStatus("warming_up");

    if (profile?.id) {
      coachStore.initContext({
        user_id: profile.id,
        full_name: profile.full_name ?? null,
        role: cfg.role ?? profile.target_role ?? null,
        domain: profile.domain ?? null,
        experience_level: (profile.experience_level as any) ?? null,
        years_of_experience: profile.experience_years ?? null,
        target_company: cfg.company ?? null,
        coach_tone: ((profile as any).coach_tone as any) ?? "supportive",
        hint_style: (cfg.hint_style as any) ?? "short_hints",
        resume_skills: parsed?.skills ?? [],
        resume_projects: parsed?.projects?.map((p) => p.name).filter(Boolean) ?? [],
        resume_experience_summary:
          typeof resumeCtx === "string" ? resumeCtx : resumeCtx?.summary ?? null,
        jd_required_skills: jdRequiredSkills,
        jd_seniority_signals: jdSeniority,
        gap_skills: [],
        session_goals: [],
        filler_words_to_watch: [],
        current_filler_count: 0,
        current_wpm: 0,
        session_type: (cfg.interview_type as any) ?? "behavioral",
        last_transcript: "",
      } as any);
    }

    if (profile.id) {
      const overlayNow = useOverlayStore.getState();
      const jdParts: string[] = [];
      if (jdRequiredSkills.length) {
        jdParts.push(`Required skills: ${jdRequiredSkills.join(", ")}`);
      }
      if (cfg.role) jdParts.push(`Role: ${cfg.role}`);
      if (cfg.company) jdParts.push(`Company: ${cfg.company}`);
      void getOrBuildSessionAiContext({
        userId: profile.id,
        resumeId: cfg.resume_id,
        jdId: cfg.jd_id,
        instructions: cfg.instructions,
        role: cfg.role,
        company: cfg.company,
        parsedResume: parsed,
        resumeContent: activeResume?.content ?? null,
        resumeSummary:
          typeof overlayNow.resume_context === "object"
            ? overlayNow.resume_context?.summary ?? null
            : String(overlayNow.resume_context ?? ""),
        jdSnippet: jdParts.join("\n") || null,
      }).catch((err) => {
        console.warn("[useLiveCopilot] session AI context preload failed:", err);
      });
    }
  }, [profile, coachStore]);

  // Hotkeys: OverlayKeyboardHandler on live/mock pages (avoids duplicate Ctrl+Shift+H handlers).

  useEffect(() => {
    if (!overlayRef?.current) return;

    dragCleanupRef.current = createDragHandler(
      overlayRef.current,
      (pos) => useOverlayStore.getState().setPosition(pos),
    );

    return () => {
      dragCleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * NOTE: requestLiveHint is declared later; we keep a ref to always call latest.
   */
  const requestLiveHintRef = useRef<(q: string) => Promise<void> | void>(() => {});
  const submitManualQuestionRef = useRef<(q: string) => Promise<void> | void>(() => {});

  /**
   * Stable question detected callback (used by audio pipeline).
   * Audio session only invokes this after a finalized interviewer question
   * (never from partial transcripts). Fingerprints skip duplicate AI calls.
   */
  const seenQuestionFingerprintsRef = useRef<Set<string>>(new Set());
  const autoHintInflightFingerprintsRef = useRef<Set<string>>(new Set());

  const handleQuestionDetected = useCallback((question: string) => {
    if (sessionEndedRef.current) return;
    const auth = getOverlaySessionAuthority();
    if (
      !auth.matchesGeneration(overlayGenerationRef.current) ||
      !auth.canAcceptSessionMutations() ||
      auth.mode !== "live"
    ) {
      return;
    }

    const sessionStatusNow = useSessionStore.getState().status;
    if (sessionStatusNow !== "active" && sessionStatusNow !== "paused") return;

    const trimmed = question.trim();
    if (!trimmed) return;
    const fingerprint = questionFingerprint(trimmed);
    if (
      fingerprint &&
      seenQuestionFingerprintsRef.current.has(fingerprint)
    ) {
      return;
    }
    if (trimmed === lastQuestionRef.current) return;
    if (fingerprint) seenQuestionFingerprintsRef.current.add(fingerprint);
    lastQuestionRef.current = trimmed;

    // Newest question wins — abort prior hint stream before swapping.
    abortRef.current?.abort();
    abortRef.current = null;
    hintOperationIdRef.current = null;
    useOverlayStore.getState().clearPendingHintOperation();

    const overlay = useOverlayStore.getState();
    overlay.setSessionPipelineState("question_detected");
    overlay.setCurrentQuestion(trimmed);
    overlay.setActiveTab("answer");

    if (overlay.auto_generate) {
      const autoFp = fingerprint || trimmed;
      if (beginAutoHintIfIdle(autoHintInflightFingerprintsRef, autoFp)) {
        void requestLiveHintRef.current(trimmed);
      }
    }
  }, []);

  const audio = useAudioSession({
    enableSystemAudio: config.enable_system_audio ?? false,
    micDeviceId: selectedMicId,
    onQuestionDetected: handleQuestionDetected,
    onFillerDetected: (count: number) => {
      useSessionStore.getState().setFillerCount(count);
    },
    onWPMUpdate: (wpm: number) => {
      useSessionStore.getState().setCurrentWPM(wpm);
    },
  });

  async function requestFullAnswer(
    question: string,
    signal: AbortSignal,
    screenshotBase64?: string | null,
    idempotencyKey?: string,
    operationId?: string,
  ): Promise<void> {
    if (sessionEndedRef.current) return;
    if (screenshotBase64 && screenshotRequestInFlightRef.current) return;
    if (screenshotBase64) screenshotRequestInFlightRef.current = true;
    const overlay = useOverlayStore.getState();
    const opId = operationId ?? hintOperationIdRef.current;
    try {
      overlay.setHintState("generating");

    const cfg = configRef.current;
    const baseContext = coachStore.getContext() ?? getSafeContext();
    const context = await enrichContextForAi(baseContext as Record<string, unknown>);

    const selectedModel = useOverlayStore.getState().active_model;
    await refreshCredits().catch(() => undefined);
    const creditCheck = checkCreditsForAction("fullAnswer");

    if (!creditCheck.canProceed) {
      const tp = overlay.resume_talking_points;
      if (tp) overlay.setOfflineFallback(formatTalkingPointsAsHint(tp));
      else overlay.setError(creditCheck.reason ?? "Out of credits");
      overlay.setHintState("idle");
      return;
    }

    overlay.setHintState("streaming");

    const answerKey =
      idempotencyKey ??
      hintIdempotencyKey(sessionIdRef.current, question);

    await routeAnswerGeneration({
      questionText: question,
      questionTypeHint: cfg.interview_type ?? "behavioral",
      modelHint: selectedModel,
      context: context as unknown as CoachingContext,
      sessionId: sessionIdRef.current,
      mode: aiModeForSessionType(sessionType as SessionType),
      screenshotBase64: screenshotBase64 ?? null,
      idempotencyKey: answerKey,
      onToken: (chunk) => {
        if (sessionEndedRef.current) return;
        useOverlayStore.getState().appendStreamChunk(chunk, opId ?? undefined);
      },
      onDone: async () => {
        if (sessionEndedRef.current) return;
        const overlayState = useOverlayStore.getState();
        overlayState.commitStreamedHint(opId ?? undefined);
        checkpointLiveSession();

        const pendingCapture = pendingCaptureMetaRef.current;
        if (screenshotBase64 && pendingCapture) {
          overlayState.pushCaptureAnswer({
            question: pendingCapture.question,
            answer: overlayState.current_hint,
            thumbnail_base64: pendingCapture.thumbnail,
          });
          pendingCaptureMetaRef.current = null;
        }

        const remaining = await refreshCredits();
        if (remaining !== null) {
          useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
        }
      },
      onError: (err) => {
        if (sessionEndedRef.current) return;
        openUpgradeIfInsufficientCredits(err);
        noteProviderFailureFromError(err);
        useOverlayStore.getState().setError(
          getAiUserFacingError(err) || "AI Help is temporarily unavailable. Please try again.",
        );
        useOverlayStore.getState().setHintState("idle");
        void refreshCredits().catch(() => undefined);
      },
      signal,
    });
    } finally {
      if (screenshotBase64) screenshotRequestInFlightRef.current = false;
    }
  }

  const requestLiveHint = useCallback(
    async (question: string, modifier?: "regenerate" | "shorten" | "expand") => {
      if (sessionEndedRef.current) return;
      const gen = overlayGenerationRef.current;
      if (!getOverlaySessionAuthority().matchesGeneration(gen)) return;

      const overlayHome = useOverlayStore.getState();
      overlayHome.setActiveTab("answer");
      overlayHome.setMinimalMode(false);
      overlayHome.showOverlay();

      if (!profile) return;

      // Prefer coach context; fallback if not initialized
      const baseContext = coachStore.getContext() ?? getSafeContext();
      if (!baseContext) return;
      let context = await enrichContextForAi(baseContext as Record<string, unknown>);
      if (!getOverlaySessionAuthority().matchesGeneration(gen)) return;
      if (sessionEndedRef.current) return;

      if (modifier === "shorten") {
        context = {
          ...context,
          resume_experience_summary: `${String(context.resume_experience_summary ?? "")}\n\nInstruction: Rewrite the answer to be significantly shorter (about half the length) while keeping STAR structure.`,
        };
      } else if (modifier === "expand") {
        context = {
          ...context,
          resume_experience_summary: `${String(context.resume_experience_summary ?? "")}\n\nInstruction: Expand the answer with more specific detail, metrics, and context while staying conversational.`,
        };
      } else if (modifier === "regenerate") {
        context = {
          ...context,
          resume_experience_summary: `${String(context.resume_experience_summary ?? "")}\n\nInstruction: Provide a fresh alternative answer with different examples.`,
        };
      }

      const selectedModel = useOverlayStore.getState().active_model;
      const answerMode = useOverlayStore.getState().answer_mode;
      await refreshCredits().catch(() => undefined);
      const creditCheck = checkCreditsForAction(
        answerMode === "full_answer" ? "fullAnswer" : "hint",
      );

      if (!creditCheck.canProceed) {
        const overlay = useOverlayStore.getState();
        overlay.setSessionPipelineState("insufficient_credits");
        const tp = overlay.resume_talking_points;
        if (tp) overlay.setOfflineFallback(formatTalkingPointsAsHint(tp));
        else overlay.setError(creditCheck.reason ?? "Out of credits");
        return;
      }

      const sessionStatus = useSessionStore.getState().status;
      if (sessionStatus !== "active" && sessionStatus !== "paused") {
        useOverlayStore.getState().setError(
          "Session is not ready yet. Start the Practice Coach session first.",
        );
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      startAnswerLatencySpan("live_hint");

      const questionId = hintIdempotencyKey(sessionIdRef.current, question);
      const operationId = createLiveHintOperationId(sessionIdRef.current, questionId);
      hintOperationIdRef.current = operationId;

      useOverlayStore.getState().beginHintOperation({
        operationId,
        sessionId: sessionIdRef.current,
        questionId,
        question,
      });
      markAnswerLatency("t1", { feature: "live_hint" });

      const stillCurrent = () =>
        !sessionEndedRef.current &&
        hintOperationIdRef.current === operationId &&
        getOverlaySessionAuthority().matchesGeneration(gen) &&
        getOverlaySessionAuthority().canAcceptSessionMutations();

      try {
        markAnswerLatency("t3", { feature: "live_hint" });
        if (answerMode === "full_answer") {
          await requestFullAnswer(
            question,
            controller.signal,
            null,
            questionId,
            operationId,
          );
          return;
        }

        await routeHint({
          question,
          context: context as unknown as CoachingContext,
          preferredModel: selectedModel,
          interviewType: String(context.session_type ?? "behavioral") as InterviewType,
          isLive: true,
          sessionId: sessionIdRef.current,
          questionId,
          simpleLanguage: useOverlayStore.getState().simple_language,
          callType: useOverlayStore.getState().session_call_type,
          language: useOverlayStore.getState().session_language,
          answerMode: "hint",
          onChunk: (chunk) => {
            if (!stillCurrent()) return;
            markAnswerLatency("t5", { feature: "live_hint" });
            useOverlayStore.getState().appendStreamChunk(chunk, operationId);
          },
          onDone: async () => {
            if (!stillCurrent()) return;
            markAnswerLatency("t6", { feature: "live_hint" });
            useOverlayStore.getState().commitStreamedHint(operationId);
            checkpointLiveSession();
            const remaining = await refreshCredits();
            if (remaining !== null && stillCurrent()) {
              useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
            }
          },
          onError: (error) => {
            if (!stillCurrent()) return;
            openUpgradeIfInsufficientCredits(error);
            noteProviderFailureFromError(error);
            useOverlayStore.getState().setError(getAiUserFacingError(error));
            void refreshCredits().catch(() => undefined);
          },
          signal: controller.signal,
        });
      } catch (err) {
        if (!controller.signal.aborted && stillCurrent()) {
          openUpgradeIfInsufficientCredits(err);
          noteProviderFailureFromError(err);
          useOverlayStore.getState().setError(
            getAiUserFacingError(err) || "Hint generation failed",
          );
          void refreshCredits().catch(() => undefined);
        }
      } finally {
        const fp = questionFingerprint(question);
        if (fp) autoHintInflightFingerprintsRef.current.delete(fp);
        const overlay = useOverlayStore.getState();
        if (overlay.hint_state === "generating") {
          overlay.setHintState("idle");
        }
      }
    },
    [profile, coachStore, getSafeContext, enrichContextForAi, checkpointLiveSession],
  );

  const requestAnswerModification = useCallback(
    (modifier: "regenerate" | "shorten" | "expand") => {
      const store = useOverlayStore.getState();
      const question =
        store.current_question?.trim() ||
        store.hint_history[store.hint_history_index]?.question?.trim() ||
        "";
      if (!question) {
        toast.error("No question to modify — generate an answer first.");
        return;
      }
      void requestLiveHint(question, modifier);
    },
    [requestLiveHint],
  );

  // keep latest ref for audio callback usage
  useEffect(() => {
    requestLiveHintRef.current = requestLiveHint;
  }, [requestLiveHint]);

  const submitManualQuestion = useCallback(
    async (question: string) => {
      if (!profile) return false;

      const sessionId = sessionIdRef.current;
      if (
        !sessionId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          sessionId,
        )
      ) {
        toast.error("Start a practice session before chatting with your coach.");
        return false;
      }

      const baseContext = coachStore.getContext() ?? getSafeContext();
      if (!baseContext) return false;
      const context = await enrichContextForAi(baseContext as Record<string, unknown>);

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      try {
        const { submitCoachChatMessage } = await import("@/lib/ai/coachChatSession");
        return submitCoachChatMessage({
          message: question,
          sessionId,
          currentQuestion:
            useOverlayStore.getState().current_question?.trim() ||
            String(context.session_type ?? "behavioral"),
          recentTranscript: String(context.last_transcript ?? ""),
          resumeContext: String(context.resume_experience_summary ?? ""),
          jobDescription: Array.isArray(context.jd_required_skills)
            ? (context.jd_required_skills as string[]).join(", ")
            : "",
          recentAnswers: Array.isArray(context.last_3_answer_summaries)
            ? (context.last_3_answer_summaries as Array<{ summary?: string }>)
                .map((s) => s.summary ?? "")
                .filter(Boolean)
            : [],
          signal: controller.signal,
        });
      } finally {
        if (chatAbortRef.current === controller) chatAbortRef.current = null;
      }
    },
    [profile, coachStore, getSafeContext, enrichContextForAi],
  );  

  useEffect(() => {
    submitManualQuestionRef.current = submitManualQuestion;
  }, [submitManualQuestion]);

  const startLiveSession = useCallback(async () => {
    if (startInFlightRef.current) return;
    if (sessionEndedRef.current) return;

    const userId = profile?.id || user?.id;
    if (!userId) throw new Error("Please sign in to start a live session.");

    startInFlightRef.current = true;
    const cfg = configRef.current;
    setIsPreparingSession(true);
    setPrepStepIndex(0);

    abortRef.current?.abort();
    chatAbortRef.current?.abort();
    startAbortRef.current?.abort();
    const startController = new AbortController();
    startAbortRef.current = startController;
    sessionEndedRef.current = false;
    hintOperationIdRef.current = null;

    const reusableSessionId = cfg.practice_context_id
      ? null
      : existingSessionIdRef.current;
    const willRestore =
      Boolean(reusableSessionId) && !getPrivateMode();

    const { generation } = beginOverlayProductSession({
      mode: "live",
      sessionId: willRestore ? reusableSessionId! : undefined,
      resetStores: !willRestore,
    });
    overlayGenerationRef.current = generation;

    /** Fresh server session to cancel if client init fails after start-session succeeds. */
    let cancelSessionOnFailure: string | null = null;

    try {
      const privateMode = getPrivateMode();
      if (reusableSessionId && !privateMode) {
        sessionIdRef.current = reusableSessionId;
        await activateSession(reusableSessionId);
      } else if (!privateMode) {
        const apiSessionType = sessionType === "live" ? "rehearsal" : sessionType;
        if (!startAttemptKeyRef.current) {
          try {
            startAttemptKeyRef.current = crypto.randomUUID().slice(0, 8);
          } catch {
            startAttemptKeyRef.current = `${Date.now().toString(36)}`.slice(0, 8);
          }
        }

        const result = await startSessionApi(
          {
            session_type: apiSessionType,
            type: apiSessionType,
            is_practice: sessionType === "live" ? true : undefined,
            interview_type: (cfg.interview_type as string) ?? "behavioral",
            company: cfg.company ?? null,
            role: cfg.role ?? null,
            resume_id: cfg.resume_id ?? null,
            jd_id: cfg.jd_id ?? null,
            model: useOverlayStore.getState().active_model,
            duration_minutes: cfg.duration_minutes ?? 30,
            practice_context_id: cfg.practice_context_id ?? null,
            source_type: cfg.source_type ?? null,
            session_call_type: cfg.session_call_type ?? null,
          },
          {
            idempotencyKey: practiceCoachStartIdempotencyKey(userId, {
              practice_context_id: cfg.practice_context_id,
              resume_id: cfg.resume_id,
              role: cfg.role,
              company: cfg.company,
              interview_type: cfg.interview_type,
              attemptNonce: startAttemptKeyRef.current,
            }),
            signal: startController.signal,
          },
        ).catch(async (startErr) => {
          const code =
            startErr instanceof ApiClientError ? startErr.code : "";
          if (code !== "SESSION_STATE_CONFLICT" && (startErr as { status?: number }).status !== 409) {
            throw startErr;
          }
          const restored = await restoreOwnedSession({ session_type: apiSessionType });
          if (!restored.session_id) throw startErr;
          return { ...restored, reused: true };
        });
        const reusedTerminal =
          result.reused === true &&
          (result.status === "completed" ||
            result.status === "abandoned" ||
            result.lifecycle_status === "COMPLETED" ||
            result.lifecycle_status === "EXPIRED" ||
            result.lifecycle_status === "CANCELLED");
        if (reusedTerminal || !result.session_id) {
          startAttemptKeyRef.current = null;
          throw new ApiClientError({
            message: "Could not start your session. Please try again in a moment.",
            status: 409,
            code: "SESSION_NOT_AVAILABLE",
          });
        }
        if (result.reused !== true) {
          cancelSessionOnFailure = result.session_id;
        }
        sessionIdRef.current = result.session_id;
      } else {
        sessionIdRef.current = generateId();
      }

      if (startController.signal.aborted || sessionEndedRef.current) {
        return;
      }

      if (!getOverlaySessionAuthority().matchesGeneration(generation)) {
        return;
      }

      bindOverlayProductSessionId(sessionIdRef.current, generation);

      const restoringExisting =
        Boolean(reusableSessionId) &&
        sessionIdRef.current === reusableSessionId &&
        !getPrivateMode();

      if (!restoringExisting) {
        seenQuestionFingerprintsRef.current.clear();
        lastQuestionRef.current = "";
      }
      await initSessionFromConfig();
      if (!getOverlaySessionAuthority().matchesGeneration(generation)) {
        return;
      }

      setPrepStepIndex(2);
      markOverlayProductSessionReady(generation);
      useOverlayStore.getState().showOverlay();
      useOverlayStore.getState().setSessionPipelineState("connecting");
      await audio.start({ restore: restoringExisting });
      if (!getOverlaySessionAuthority().matchesGeneration(generation)) {
        audio.stop();
        return;
      }
      markOverlayProductSessionActive(generation);
      markFirstListening();
      cancelSessionOnFailure = null;

      if (restoringExisting) {
        const checkpoint = loadLiveSessionCheckpoint(reusableSessionId!);
        if (checkpoint) {
          // Hydrate before clearing chat/audio so refresh keeps context.
          useAudioStore.getState().restoreTranscript({
            utterances: checkpoint.utterances,
            full_transcript: checkpoint.full_transcript,
            last_question: checkpoint.current_question || null,
          });
          useOverlayStore.getState().restoreHintHistory(checkpoint.hint_history, {
            current_question: checkpoint.current_question,
            current_hint: checkpoint.current_hint,
          });
          if (checkpoint.elapsed_seconds > 0) {
            useSessionStore.getState().setElapsedSeconds(checkpoint.elapsed_seconds);
          }
          if (checkpoint.current_question) {
            lastQuestionRef.current = checkpoint.current_question;
          }
          for (const u of checkpoint.utterances) {
            const text = (u.text ?? "").trim();
            if (!text) continue;
            if (u.is_interviewer_question || u.speaker === "interviewer") {
              const fp = questionFingerprint(text);
              if (fp) seenQuestionFingerprintsRef.current.add(fp);
            }
          }
        }
        // Keep coach chat; do not wipe mid-session restore.
      } else {
        useOverlayStore.getState().clearChatHistory();
      }

      const sid = sessionIdRef.current;
      if (
        sid &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          sid,
        ) &&
        !getPrivateMode()
      ) {
        void import("@/lib/ai/coachChatSession").then(({ loadCoachChatHistory }) =>
          loadCoachChatHistory(sid),
        );
      }
      checkpointLiveSession();
    } catch (err) {
      if (startController.signal.aborted || sessionEndedRef.current) {
        return;
      }
      const normalized = normalizeSessionLifecycleError(err);
      const code = normalized instanceof ApiClientError ? normalized.code : "";
      if (code === "SESSION_STATE_CONFLICT" || code === "SESSION_NOT_AVAILABLE") {
        console.warn("[useLiveCopilot] Session start conflict:", code);
      } else {
        console.warn("[useLiveCopilot] Failed to start live session:", normalized.message);
      }
      if (cancelSessionOnFailure && !getPrivateMode()) {
        void endSessionApi({
          session_id: cancelSessionOnFailure,
          terminal_reason: "CANCELLED",
        }).catch((cancelErr) => {
          console.warn(
            "[useLiveCopilot] could not cancel session after init failure:",
            cancelErr,
          );
        });
      }
      audio.stop();
      markOverlayProductSessionTerminal(generation, "FAILED");
      teardownOverlayProductSession(generation);
      throw normalized;
    } finally {
      startInFlightRef.current = false;
      setIsPreparingSession(false);
      setPrepStepIndex(0);
    }
  }, [audio, checkpointLiveSession, initSessionFromConfig, profile?.id, user?.id, sessionType]);

  useEffect(() => {
    return () => {
      startAbortRef.current?.abort();
    };
  }, []);

  const endLiveSession = useCallback(async (): Promise<{ answersRecorded: number }> => {
    const gen = overlayGenerationRef.current;
    sessionEndedRef.current = true;
    startAttemptKeyRef.current = null;
    hintOperationIdRef.current = null;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    abortRef.current?.abort();
    chatAbortRef.current?.abort();
    abortRef.current = null;
    chatAbortRef.current = null;
    useOverlayStore.getState().clearPendingHintOperation();

    // Snapshot while stores are still mutable, then freeze against late updates.
    const session = useSessionStore.getState();
    const overlay = useOverlayStore.getState();
    const audioState = useAudioStore.getState();
    const userId = profile?.id;
    let answersRecorded = 0;

    useOverlayStore.getState().setSessionPipelineState("session_ending");
    markOverlayProductSessionTerminal(gen, "USER_ENDED");
    // STT / mic teardown must never block session history persistence.
    try {
      audio.stop({ releaseToken: true });
    } catch (stopErr) {
      console.warn("[useLiveCopilot] audio stop during end (non-fatal):", stopErr);
    }
    try {
      useAudioStore.getState().setPipelineStatus("ended");
    } catch {
      /* non-fatal */
    }
    if (session.session_id) {
      try {
        clearLiveSessionCheckpoint(session.session_id);
      } catch {
        /* non-fatal */
      }
    }

    if (userId && session.session_id && !getPrivateMode()) {
      try {
        const fullTranscript = audioState.transcript?.full_transcript ?? "";
        const utterances = audioState.transcript?.utterances ?? [];
        const questionCount = utterances.filter((u) => u.is_interviewer_question).length;
        const pairs = pairLiveSessionAnswers(utterances);

        const dbModel = toDbModel(overlay.active_model);
        const saveTranscript =
          overlay.save_transcript &&
          parsePrivacyPrefs(profile?.privacy_prefs).store_transcripts;

        // Mark coach conversation closed (history rows retained for the session).
        try {
          const { supabase } = await import("@/lib/supabase/client");
          await supabase
            .from("coach_conversations")
            .update({ status: "closed", updated_at: new Date().toISOString() })
            .eq("session_id", session.session_id)
            .eq("user_id", userId);
        } catch {
          /* non-fatal — finalization below is the source of truth for history */
        }

        const result = await finalizeSessionApi({
          session_id: session.session_id,
          terminal_reason: "USER_ENDED",
          answers: pairs.map((p, index) => ({
            question_index: index,
            question: p.question,
            answer: p.answer,
            duration_ms: p.duration_ms,
          })),
          transcript:
            fullTranscript && saveTranscript
              ? { content: fullTranscript, utterances }
              : null,
          metrics: {
            credits_used: session.credits_consumed,
            model_used: dbModel,
            filler_words: session.filler_count,
            avg_wpm: session.current_wpm,
            hints_used: overlay.hint_history.length,
            answers_generated: pairs.length,
            questions_asked: Math.max(questionCount, pairs.length),
            notes: saveTranscript && fullTranscript ? fullTranscript : null,
          },
        });
        answersRecorded = result.already_terminal ? 0 : pairs.length;

        toast.success("Session saved");
        notifySessionsChanged();
      } catch (err) {
        console.error("[useLiveCopilot] Failed to finalize session:", err);
        toast.error("We couldn't finish saving your session. Please retry.");
        answersRecorded = 0;
      }
    }

    useOverlayStore.getState().setSessionPipelineState("session_saved");
    teardownOverlayProductSession(gen);
    return { answersRecorded };
  }, [audio, profile?.id]);

  const pauseLiveSession = useCallback(() => {
    audio.pause();
    useSessionStore.getState().setStatus("paused");
  }, [audio]);

  const resumeLiveSession = useCallback(async () => {
    await audio.resume();
    useSessionStore.getState().setStatus("active");
  }, [audio]);

  const captureCodingAnswer = useCallback(async () => {
    if (!profile) return;
    if (!assertOnlineForCapture()) return;

    const creditCheck = checkCreditsForAction("screenshotAnswer");
    if (!creditCheck.canProceed) {
      useOverlayStore.getState().setError(creditCheck.reason ?? "Out of credits");
      return;
    }

    const overlay = useOverlayStore.getState();
    overlay.setAnswerMode("full_answer");
    overlay.setHintStyle("full_answer");
    overlay.setActiveTab("answer");
    overlay.setScreenshotHint(null);
    overlay.showOverlay();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    await captureCodingQuestionAndGenerateAnswer({
      mode: "new_capture",
      onGenerate: async ({ question, screenshot }) => {
        pendingCaptureMetaRef.current = {
          question,
          thumbnail: screenshot.base64,
        };
        await requestFullAnswer(question, controller.signal, screenshot.dataOnly);
      },
    });
  }, [profile]);

  const adjustRegionCodingAnswer = useCallback(async () => {
    if (!profile) return;
    if (!assertOnlineForCapture()) return;

    const creditCheck = checkCreditsForAction("screenshotAnswer");
    if (!creditCheck.canProceed) {
      useOverlayStore.getState().setError(creditCheck.reason ?? "Out of credits");
      return;
    }

    const overlay = useOverlayStore.getState();
    overlay.setAnswerMode("full_answer");
    overlay.setHintStyle("full_answer");
    overlay.setActiveTab("answer");
    overlay.setScreenshotHint(null);
    overlay.showOverlay();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    await captureCodingQuestionAndGenerateAnswer({
      mode: "adjust_region",
      onGenerate: async ({ question, screenshot }) => {
        pendingCaptureMetaRef.current = {
          question,
          thumbnail: screenshot.base64,
        };
        await requestFullAnswer(question, controller.signal, screenshot.dataOnly);
      },
    });
  }, [profile]);

  useEffect(() => {
    const store = useOverlayStore.getState();
    store.setCaptureCodingHandler(() => {
      void captureCodingAnswer();
    });
    store.setAdjustRegionHandler(() => {
      void adjustRegionCodingAnswer();
    });
    return () => {
      useOverlayStore.getState().setCaptureCodingHandler(null);
      useOverlayStore.getState().setAdjustRegionHandler(null);
    };
  }, [captureCodingAnswer, adjustRegionCodingAnswer]);

  return {
    sessionStatus,
    elapsedSeconds,
    creditsConsumed,
    isPreparingSession,
    prepStepIndex,
    streamError: audio.streamError,
    isMuted: audio.isMuted,
    toggleMute: audio.toggleMute,
    toggleSystemAudio: audio.toggleSystemAudio,
    reconnectAudio: audio.reconnect,
    requestLiveHint,
    requestAnswerModification,
    submitManualQuestion,
    startLiveSession,
    endLiveSession,
    pauseLiveSession,
    resumeLiveSession,
    captureCodingAnswer,
    adjustRegionCodingAnswer,
  };
}
