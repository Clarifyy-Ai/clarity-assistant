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
  buildResumeContextForAI,
  loadPrimaryCoverLetterText,
} from "@/lib/documents/interviewContext";
import { parseResumeContentString } from "@/lib/documents/resumeParse";
import { getPrivateMode } from "@/hooks/usePrivateMode";
import { createDragHandler } from "@/lib/overlay/stealthMouse";
import { generateId } from "@/lib/utils";
import { questionFingerprint, hintIdempotencyKey } from "@/lib/ai/questionDetection";
import {
  sessionsDB,
  jobDescriptionsDB,
  resumesDB,
  sessionTranscriptsDB,
  answerBankDB,
  sessionAnswersDB,
} from "@/lib/supabase/database";
import { pairLiveSessionAnswers } from "@/lib/session/liveSessionAnswers";
import {
  activateSession,
  aiModeForSessionType,
  type SessionType,
} from "@/lib/session/sessionLifecycle";
import { startSession as startSessionApi } from "@/lib/api/sessions";
import { handleSessionStartError } from "@/lib/billing/sessionStartErrors";
import { toDbModel } from "@/lib/ai/modelMapping";
import { markFirstListening } from "@/lib/analytics/uxMetrics";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";
import {
  getAiUserFacingError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { noteProviderFailureFromError } from "@/lib/ai/providerAvailability";

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
  const { profile } = useAuthStore();

  const sessionStatus = useSessionStore((s) => s.status);
  const elapsedSeconds = useSessionStore((s) => s.elapsed_seconds);
  const creditsConsumed = useSessionStore((s) => s.credits_consumed);

  const coachStore = useCoachStore();

  const abortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string>(generateId());
  const pendingCaptureMetaRef = useRef<{
    question: string;
    thumbnail?: string;
  } | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  const existingSessionIdRef = useRef(existingSessionId ?? null);
  existingSessionIdRef.current = existingSessionId ?? null;

  const [isPreparingSession, setIsPreparingSession] = useState(false);
  const [prepStepIndex, setPrepStepIndex] = useState(0);

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

      const resumeBlock = await buildResumeContextForAI(userId, {
        parsedResume: parsed,
        resumeContent: activeResume?.content ?? null,
        resumeSummary:
          typeof overlay.resume_context === "object"
            ? overlay.resume_context?.summary ?? null
            : String(overlay.resume_context ?? ""),
        jdSnippet: jdParts.join("\n") || null,
        instructions: cfg.instructions ?? "",
        role: cfg.role ?? null,
        company: cfg.company ?? null,
      });

      const transcript =
        useAudioStore.getState().transcript?.full_transcript ?? "";
      const lastTranscript =
        transcript.length > 2500 ? transcript.slice(-2500) : transcript;

      let jdKeywords: string[] = [];
      if (Array.isArray(base.jd_required_skills) && base.jd_required_skills.length) {
        jdKeywords = base.jd_required_skills as string[];
      }
      if (cfg.jd_id) {
        try {
          const jd = await jobDescriptionsDB.getByIdMaybe(cfg.jd_id);
          const raw = jd as Record<string, unknown> | null;
          const kw = raw?.keywords ?? raw?.required_skills ?? raw?.skills;
          if (Array.isArray(kw)) {
            jdKeywords = [
              ...new Set([
                ...jdKeywords,
                ...kw.filter((s): s is string => typeof s === "string"),
              ]),
            ];
          }
        } catch {
          /* non-fatal */
        }
      }

      let starStoriesBlock = "";
      try {
        const entries = await answerBankDB.listByUserId(userId);
        const lines = entries.slice(0, 5).map((entry) => {
          const enriched = entry as typeof entry & {
            star_situation?: string | null;
            star_task?: string | null;
            star_action?: string | null;
            star_result?: string | null;
            summary?: string | null;
          };
          const starParts = [
            enriched.star_situation,
            enriched.star_task,
            enriched.star_action,
            enriched.star_result,
          ].filter(Boolean);
          const starText =
            starParts.length > 0
              ? starParts.join(" → ")
              : (enriched.summary ?? enriched.answer_text?.slice(0, 240) ?? "");
          return `Q: ${entry.question_text}\nSTAR: ${starText}`;
        });
        if (lines.length) {
          starStoriesBlock = `\n\nRelevant saved STAR stories:\n${lines.join("\n\n")}`;
        }
      } catch {
        /* non-fatal */
      }

      const jdBlock =
        jdKeywords.length > 0
          ? `\n\nJD keywords to weave in: ${jdKeywords.join(", ")}`
          : "";

      return {
        ...base,
        resume_experience_summary: resumeBlock + jdBlock + starStoriesBlock,
        resume_skills: parsed?.skills ?? base.resume_skills,
        jd_required_skills: jdKeywords.length ? jdKeywords : base.jd_required_skills,
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
   */
  const seenQuestionFingerprintsRef = useRef<Set<string>>(new Set());

  const handleQuestionDetected = useCallback((question: string) => {
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

    const overlay = useOverlayStore.getState();
    overlay.setSessionPipelineState("question_detected");
    overlay.setCurrentQuestion(trimmed);
    overlay.setActiveTab("answer");

    if (overlay.auto_generate) {
      void requestLiveHintRef.current(trimmed);
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
  ): Promise<void> {
    const overlay = useOverlayStore.getState();
    overlay.setHintState("generating");

    const cfg = configRef.current;
    const baseContext = coachStore.getContext() ?? getSafeContext();
    const context = await enrichContextForAi(baseContext as Record<string, unknown>);

    const selectedModel = useOverlayStore.getState().active_model;
    const creditCheck = checkCreditsForAction("fullAnswer");

    if (!creditCheck.canProceed) {
      const tp = overlay.resume_talking_points;
      if (tp) overlay.setOfflineFallback(formatTalkingPointsAsHint(tp));
      else overlay.setError(creditCheck.reason ?? "Out of credits");
      overlay.setHintState("idle");
      return;
    }

    overlay.setHintState("streaming");

    await routeAnswerGeneration({
      questionText: question,
      questionTypeHint: cfg.interview_type ?? "behavioral",
      modelHint: selectedModel,
      context: context as unknown as CoachingContext,
      sessionId: sessionIdRef.current,
      mode: aiModeForSessionType(sessionType as SessionType),
      screenshotBase64: screenshotBase64 ?? null,
      onToken: (chunk) => useOverlayStore.getState().appendStreamChunk(chunk),
      onDone: async () => {
        const overlayState = useOverlayStore.getState();
        overlayState.commitStreamedHint();

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
        openUpgradeIfInsufficientCredits(err);
        noteProviderFailureFromError(err);
        useOverlayStore.getState().setError(
          getAiUserFacingError(err) || "Failed to generate full answer",
        );
        useOverlayStore.getState().setHintState("idle");
      },
      signal,
    });
  }

  const requestLiveHint = useCallback(
    async (question: string, modifier?: "regenerate" | "shorten" | "expand") => {
      const overlayHome = useOverlayStore.getState();
      overlayHome.setActiveTab("answer");
      overlayHome.setMinimalMode(false);
      overlayHome.showOverlay();

      if (!profile) return;

      // Prefer coach context; fallback if not initialized
      const baseContext = coachStore.getContext() ?? getSafeContext();
      if (!baseContext) return;
      let context = await enrichContextForAi(baseContext as Record<string, unknown>);

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

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const requestId = hintIdempotencyKey(sessionIdRef.current, question);
      const overlay = useOverlayStore.getState();
      overlay.setCurrentQuestion(question);
      overlay.setHintState("generating");

      try {
        if (answerMode === "full_answer") {
          await requestFullAnswer(question, controller.signal);
          return;
        }

        await routeHint({
          question,
          context: context as unknown as CoachingContext,
          preferredModel: selectedModel,
          interviewType: String(context.session_type ?? "behavioral") as InterviewType,
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
            const remaining = await refreshCredits();
            if (remaining !== null) {
              useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
            }
          },
          onError: (error) => {
            openUpgradeIfInsufficientCredits(error);
            noteProviderFailureFromError(error);
            useOverlayStore.getState().setError(getAiUserFacingError(error));
          },
          signal: controller.signal,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          openUpgradeIfInsufficientCredits(err);
          noteProviderFailureFromError(err);
          useOverlayStore.getState().setError(
            getAiUserFacingError(err) || "Hint generation failed",
          );
        }
      }
    },
    [profile, coachStore, getSafeContext, enrichContextForAi],
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
      if (!profile) return;

      const baseContext = coachStore.getContext() ?? getSafeContext();
      if (!baseContext) return;
      const context = await enrichContextForAi(baseContext as Record<string, unknown>);

      useOverlayStore.getState().addChatMessage({
        role: "user",
        text: question,
        timestamp: Date.now(),
      });

      const selectedModel = useOverlayStore.getState().active_model;
      const creditCheck = checkCreditsForAction("fullAnswer");

      if (!creditCheck.canProceed) {
        const overlay = useOverlayStore.getState();
        const tp = overlay.resume_talking_points;
        useOverlayStore.getState().addChatMessage({
          role: "assistant",
          text: tp ? formatTalkingPointsAsHint(tp) : creditCheck.reason ?? "Out of credits",
          timestamp: Date.now(),
        });
        return;
      }

      // Dedicated chat abort — do NOT cancel the auto-hint pipeline
      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const requestId = generateId();
      useOverlayStore.getState().setChatGenerating(true);

      let chatBuffer = "";

      try {
        await routeHint({
          question,
          context: context as unknown as CoachingContext,
          preferredModel: selectedModel,
          interviewType: String(context.session_type ?? "behavioral") as InterviewType,
          isLive: true,
          sessionId: sessionIdRef.current,
          questionId: requestId,
          simpleLanguage: useOverlayStore.getState().simple_language,
          callType: useOverlayStore.getState().session_call_type,
          language: useOverlayStore.getState().session_language,
          answerMode: "full_answer",
          onChunk: (chunk) => {
            chatBuffer += chunk;
          },
          onDone: async () => {
            const remaining = await refreshCredits();
            if (remaining !== null) {
              useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
            }
          },
          onError: (error) => {
            throw error;
          },
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          useOverlayStore.getState().addChatMessage({
            role: "assistant",
            text: chatBuffer || "No response received. Please try again.",
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          openUpgradeIfInsufficientCredits(err);
          noteProviderFailureFromError(err);
          const msg = getAiUserFacingError(err) || "Chat generation failed";
          useOverlayStore.getState().addChatMessage({
            role: "assistant",
            text: `Error: ${msg}`,
            timestamp: Date.now(),
          });
          useOverlayStore.getState().setError(msg);
        }
      } finally {
        if (chatAbortRef.current === controller) chatAbortRef.current = null;
        useOverlayStore.getState().setChatGenerating(false);
      }
    },
    [profile, coachStore, getSafeContext, enrichContextForAi],
  );  

  useEffect(() => {
    submitManualQuestionRef.current = submitManualQuestion;
  }, [submitManualQuestion]);

  const startLiveSession = useCallback(async () => {
    const userId = profile?.id;
    if (!userId) throw new Error("Please sign in to start a live session.");

    const cfg = configRef.current;
    setIsPreparingSession(true);
    setPrepStepIndex(0);

    try {
      const privateMode = getPrivateMode();
      const reusableSessionId = existingSessionIdRef.current;
      if (reusableSessionId && !privateMode) {
        sessionIdRef.current = reusableSessionId;
        await activateSession(reusableSessionId);
      } else if (!privateMode) {
        const apiSessionType = sessionType === "live" ? "rehearsal" : sessionType;

        const result = await startSessionApi({
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
        });
        sessionIdRef.current = result.session_id;
      } else {
        sessionIdRef.current = generateId();
      }

      seenQuestionFingerprintsRef.current.clear();
      lastQuestionRef.current = "";
      await initSessionFromConfig();
      setPrepStepIndex(2);
      useOverlayStore.getState().showOverlay();
      useOverlayStore.getState().setSessionPipelineState("connecting");
      await audio.start();
      useSessionStore.getState().setStatus("active");
      markFirstListening();
    } catch (err) {
      console.error("[useLiveCopilot] Failed to start live session:", err);
      audio.stop();
      useSessionStore.getState().resetSession();
      useOverlayStore.getState().hideOverlay();
      useOverlayStore.getState().resetSessionState();
      if (!handleSessionStartError(err)) {
        throw err instanceof Error ? err : new Error("Failed to start live session");
      }
    } finally {
      setIsPreparingSession(false);
      setPrepStepIndex(0);
    }
  }, [audio, initSessionFromConfig, profile?.id, sessionType]);

  const endLiveSession = useCallback(async (): Promise<{ answersRecorded: number }> => {
    abortRef.current?.abort();
    useOverlayStore.getState().setSessionPipelineState("session_ending");
    audio.stop();

    const session = useSessionStore.getState();
    const overlay = useOverlayStore.getState();
    const userId = profile?.id;
    let answersRecorded = 0;

    if (userId && session.session_id && !getPrivateMode()) {
      try {
        const audioState = useAudioStore.getState();
        const fullTranscript = audioState.transcript?.full_transcript ?? "";
        const utterances = audioState.transcript?.utterances ?? [];
        const questionCount = utterances.filter((u) => u.is_interviewer_question).length;
        const pairs = pairLiveSessionAnswers(utterances);

        const dbModel = toDbModel(overlay.active_model);
        const saveTranscript = useOverlayStore.getState().save_transcript;

        await sessionsDB.updateForUser(session.session_id, userId, {
          status: "completed",
          credits_used: session.credits_consumed,
          model_used: dbModel as any,
          ended_at: new Date().toISOString(),
          filler_words: session.filler_count,
          avg_wpm: session.current_wpm,
          hints_used: overlay.hint_history.length,
          answers_generated: pairs.length,
          questions_asked: Math.max(questionCount, pairs.length),
          notes: saveTranscript && fullTranscript ? fullTranscript : null,
        });

        if (pairs.length > 0) {
          await sessionAnswersDB.createMany(
            pairs.map((p) => ({
              session_id: session.session_id!,
              user_id: userId,
              question: p.question,
              answer: p.answer,
              duration_ms: p.duration_ms,
            })),
          );
          answersRecorded = pairs.length;
        }

        if (fullTranscript && saveTranscript) {
          try {
            await sessionTranscriptsDB.create({
              session_id: session.session_id,
              user_id: userId,
              transcript: fullTranscript,
              utterances,
            });
          } catch (err) {
            console.error("[useLiveCopilot] Failed to save transcript:", err);
          }
        }
      } catch (err) {
        console.error("[useLiveCopilot] Failed to finalize session:", err);
        toast.error("Session ended, but the summary could not be saved. Your practice still ran.");
        answersRecorded = 0;
      }
    }

    useSessionStore.getState().setStatus("idle");
    useOverlayStore.getState().hideOverlay();
    return { answersRecorded };
  }, [audio, profile?.id]);

  const pauseLiveSession = useCallback(() => {
    audio.stop();
    useSessionStore.getState().setStatus("paused");
  }, [audio]);

  const resumeLiveSession = useCallback(async () => {
    await audio.start();
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
