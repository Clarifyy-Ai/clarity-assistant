// @ts-nocheck -- retained: hook returns a large object with heterogeneous inferred types; the
// Supabase generated DB row types don't match our manual schema additions (questions, sessions, etc.)
// causing ~50+ implicit-any cascade errors in callers. Full typing requires aligning all generated
// types with migration schema — tracked as a future refactor task.
import { EDGE_BASE, SUPABASE_ANON_KEY } from "@/lib/env";
import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/store/sessionStore";
import { useCoachStore } from "@/store/coachStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/userStore";
import { useGamificationStore } from "@/hooks/useGamification";
import { buildCoachingContext } from "@/lib/ai/contextEnvelopeBuilder";
import { routeHint } from "@/lib/ai/modelRouter";
import { checkCredits, deductCredits } from "@/lib/billing/creditsManager";
import { generateLocalQuestions } from "@/lib/ai/localQuestionBank";
import { useOverlayStore } from "@/store/overlayStore";
import { generateId } from "@/lib/utils";
import type { SessionConfig, InterviewType } from "@/types/session.types";
import type { SessionQuestion } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// useSessionOrchestrator
// ─────────────────────────────────────────────────────────────────

// Loose config shape accepted by createSession (from MockInterview.tsx / other pages)
interface CreateSessionInput {
  session_type?:              string;
  interview_type?:            string;
  type?:                      string;
  target_company?:            string | null;
  company?:                   string | null;
  role?:                      string | null;
  question_count?:            number;
  time_per_question?:         number;           // seconds — legacy field name
  time_per_question_seconds?: number;           // seconds — canonical field name
  experience_level?:          string | null;
  hint_style?:                string;
  model?:                     string;
  include_warmup?:            boolean;
  resume_id?:                 string | null;
  jd_id?:                     string | null;
  focus_areas?:               string[];
}

export function useSessionOrchestrator() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const coachStore  = useCoachStore(); // methods are stable — ok to subscribe

  // Reactive state — individual selectors only
  const status               = useSessionStore((s) => s.status);
  const current_question     = useSessionStore((s) => s.current_question);
  const current_question_index = useSessionStore((s) => s.current_question_index);
  const questions_length     = useSessionStore((s) => s.questions?.length ?? 0);
  const credits_consumed     = useSessionStore((s) => s.credits_consumed);
  const elapsed_seconds      = useSessionStore((s) => s.elapsed_seconds);
  const config               = useSessionStore((s) => s.config);

  const abortControllerRef = useRef<AbortController | null>(null);
  const hintRequestIdRef   = useRef<string | null>(null);

  // ── createSession — public entry point (accepts loose shape) ─────────────

  const createSession = useCallback(async (input: CreateSessionInput) => {
    if (!profile) return;

    // Normalize fields and fill defaults from profile
    const config: SessionConfig = {
      interview_type:            (input.interview_type ?? input.type ?? "behavioural") as InterviewType,
      company:                   input.target_company ?? input.company ?? null,
      role:                      input.role ?? null,
      experience_level:          input.experience_level ?? (profile as any).experience_level ?? null,
      question_count:            input.question_count ?? 5,
      time_per_question_seconds: input.time_per_question_seconds
                                   ?? input.time_per_question
                                   ?? 180,
      hint_style:                (input.hint_style as any) ?? (profile as any).hint_style ?? "short_hints",
      model:                     (input.model as any) ?? (profile as any).preferred_model ?? "gemini-flash",
      include_warmup:            input.include_warmup ?? false,
      resume_id:                 input.resume_id ?? useDocumentStore.getState().active_resume_id ?? null,
      jd_id:                     input.jd_id ?? useDocumentStore.getState().active_jd_id ?? null,
      focus_areas:               input.focus_areas ?? [],
    };

    await initSession(config);
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── initSession — canonical entry point with typed config ────────────────

  const initSession = useCallback(async (config: SessionConfig) => {
    if (!profile) return;

    const ss = useSessionStore.getState();
    const sessionId = generateId();
    ss.setSessionId(sessionId);
    ss.setMode("mock");
    ss.setConfig(config);
    ss.setStatus("warming_up");

    const { active_context } = useDocumentStore.getState();
    const context = buildCoachingContext(profile, config, active_context);
    coachStore.initContext(context);

    try {
      const questions = await fetchQuestions(config, sessionId);
      useSessionStore.getState().setQuestions(questions);
      useSessionStore.getState().setStatus("active");
    } catch (err) {
      // Edge Function unavailable or not yet deployed — use local question bank
      console.warn("[SessionOrchestrator] Edge function unavailable, using local questions:", err);
      const fallback = generateLocalQuestions(
        config.interview_type,
        config.question_count,
        config.company,
      );
      useSessionStore.getState().setQuestions(fallback);
      useSessionStore.getState().setStatus("active");
    }
  }, [profile, coachStore]);

  // ── Request a hint ─────────────────────────────────────────────

  const requestHint = useCallback(async (question: string) => {
    if (!profile) return;

    const context = coachStore.getContext();
    if (!context) return;

    const overlayModel = useOverlayStore.getState().active_model;
    const preferredModel = overlayModel || (profile as any).preferred_model || "gemini-flash";
    const interviewType  = context.session_type as InterviewType;

    const isMock = useSessionStore.getState().mode === "mock";

    if (!isMock) {
      const creditCheck = checkCredits(preferredModel as any);
      if (!creditCheck.canProceed) {
        useOverlayStore.getState().setError(creditCheck.reason ?? "Insufficient credits");
        return;
      }
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = generateId();
    hintRequestIdRef.current = requestId;

    useOverlayStore.getState().setCurrentQuestion(question);
    useOverlayStore.getState().setHintState("generating");

    const { session_id } = useSessionStore.getState();

    await routeHint({
      question,
      context,
      preferredModel:  preferredModel as any,
      interviewType,
      isLive:          false,
      sessionId:       session_id ?? "unknown",
      questionId:      requestId,
      onChunk: (chunk) => {
        if (hintRequestIdRef.current === requestId) {
          useOverlayStore.getState().appendStreamChunk(chunk);
        }
      },
      onDone: async () => {
        if (hintRequestIdRef.current !== requestId) return;
        useOverlayStore.getState().commitStreamedHint();
        if (!isMock) {
          await deductCredits(preferredModel as any, session_id ?? "unknown");
          const creditCheck = checkCredits(preferredModel as any);
          useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
        }
        coachStore.incrementQuestionNumber();
      },
      onError: (error) => {
        if (hintRequestIdRef.current === requestId) {
          useOverlayStore.getState().setError(error.message);
        }
      },
      signal: controller.signal,
    });
  }, [profile, coachStore]);

  const nextQuestion = useCallback(() => {
    useOverlayStore.getState().clearHint();
    coachStore.incrementQuestionNumber();
    useSessionStore.getState().advanceQuestion();
  }, [coachStore]);

  const completeSession = useCallback(async () => {
    abortControllerRef.current?.abort();
    useSessionStore.getState().setStatus("completed");

    const { session_id } = useSessionStore.getState();
    if (!session_id) return;

    try {
      const gamStore = useGamificationStore.getState();
      gamStore.addXP(50);
    } catch { /* non-fatal */ }

    navigate(`/app/scorecard/${session_id}`);
  }, [navigate]);

  const abortHint = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    useOverlayStore.getState().clearHint();
  }, []);

  const resetSession = useCallback(() => {
    abortHint();
    useSessionStore.getState().resetSession();
    coachStore.clearContext();
    useOverlayStore.getState().clearHint();
  }, [abortHint, coachStore]);

  return {
    // Actions
    createSession,
    initSession,
    requestHint,
    nextQuestion,
    completeSession,
    abortHint,
    resetSession,

    // Reactive state — from individual selectors above
    status,
    currentQuestion:      current_question,
    currentIndex:         current_question_index,
    totalQuestions:       questions_length,
    creditsConsumed:      credits_consumed,
    elapsedSeconds:       elapsed_seconds,

    // Aliases used by older page code
    currentQuestionIndex: current_question_index,
    currentTimeLimit:     config?.time_per_question_seconds ?? 180,
  };
}

// ── Fetch questions from Edge Function (with 8-second timeout) ──

async function fetchQuestions(
  config: SessionConfig,
  sessionId: string
): Promise<SessionQuestion[]> {
  const anonKey = SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${EDGE_BASE}/generate-questions`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        interview_type:   config.interview_type,
        experience_level: config.experience_level,
        company:          config.company ?? null,
        role:             config.role ?? null,
        question_count:   config.question_count ?? 5,
        session_id:       sessionId,
        resume_context:   useDocumentStore.getState().active_context.resume_version?.parsed_data ?? null,
        jd_context:       useDocumentStore.getState().active_context.jd?.parsed_data ?? null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Edge function returned ${response.status}`);

    const data = await response.json();
    return (data.questions as any[]).map((q, i) => ({
      ...q,
      id:    q.id ?? generateId(),
      order: i + 1,
    })) as SessionQuestion[];
  } finally {
    clearTimeout(timeout);
  }
}
