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
  const navigate     = useNavigate();
  const sessionStore = useSessionStore();
  const coachStore   = useCoachStore();
  const overlayStore = useOverlayStore();
  const { profile }  = useAuthStore();

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

    const sessionId = generateId();
    sessionStore.setSessionId(sessionId);
    sessionStore.setMode("mock");
    sessionStore.setConfig(config);
    sessionStore.setStatus("warming_up");

    const { active_context } = useDocumentStore.getState();
    const context = buildCoachingContext(profile, config, active_context);
    coachStore.initContext(context);

    try {
      const questions = await fetchQuestions(config, sessionId);
      sessionStore.setQuestions(questions);
      sessionStore.setStatus("active");
    } catch (err) {
      // Edge Function unavailable or not yet deployed — use local question bank
      console.warn("[SessionOrchestrator] Edge function unavailable, using local questions:", err);
      const fallback = generateLocalQuestions(
        config.interview_type,
        config.question_count,
        config.company,
      );
      sessionStore.setQuestions(fallback);
      sessionStore.setStatus("active");
    }
  }, [profile]);

  // ── Request a hint ─────────────────────────────────────────────

  const requestHint = useCallback(async (question: string) => {
    if (!profile) return;

    const context = coachStore.getContext();
    if (!context) return;

    const preferredModel = (profile as any).preferred_model ?? "gemini-flash";
    const interviewType  = context.session_type as InterviewType;

    const creditCheck = checkCredits(preferredModel as any);
    if (!creditCheck.canProceed) {
      overlayStore.setError(creditCheck.reason ?? "Insufficient credits");
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = generateId();
    hintRequestIdRef.current = requestId;

    overlayStore.setCurrentQuestion(question);
    overlayStore.setHintState("generating");

    const { session_id } = useSessionStore.getState();

    await routeHint({
      question,
      context,
      preferredModel:  preferredModel as any,
      interviewType,
      isLive:          false,
      sessionId:       session_id ?? "unknown",
      questionId:      requestId,
      onChunk:         (chunk) => {
        if (hintRequestIdRef.current === requestId) {
          overlayStore.appendStreamChunk(chunk);
        }
      },
      onDone:          async () => {
        if (hintRequestIdRef.current !== requestId) return;
        overlayStore.commitStreamedHint();
        await deductCredits(preferredModel as any, session_id ?? "unknown");
        sessionStore.consumeCredit(creditCheck.creditsRequired);
        coachStore.incrementQuestionNumber();
      },
      onError:         (error) => {
        if (hintRequestIdRef.current === requestId) {
          overlayStore.setError(error.message);
        }
      },
      signal:          controller.signal,
    });
  }, [profile]);

  const nextQuestion = useCallback(() => {
    overlayStore.clearHint();
    coachStore.incrementQuestionNumber();
    sessionStore.advanceQuestion();
  }, []);

  const completeSession = useCallback(async () => {
    abortControllerRef.current?.abort();
    sessionStore.setStatus("completed");

    const { session_id } = useSessionStore.getState();
    if (!session_id) return;

    // Award XP
    try {
      const gamStore = useGamificationStore.getState();
      gamStore.addXP(50);
    } catch { /* non-fatal */ }

    navigate(`/app/scorecard/${session_id}`);
  }, [navigate]);

  const abortHint = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    overlayStore.clearHint();
  }, []);

  const resetSession = useCallback(() => {
    abortHint();
    sessionStore.resetSession();
    coachStore.clearContext();
    overlayStore.clearHint();
  }, []);

  const config = sessionStore.config;

  return {
    // Actions
    createSession,
    initSession,
    requestHint,
    nextQuestion,
    completeSession,
    abortHint,
    resetSession,

    // State — canonical names
    status:              sessionStore.status,
    currentQuestion:     sessionStore.current_question,
    currentIndex:        sessionStore.current_question_index,
    totalQuestions:      sessionStore.questions.length,
    creditsConsumed:     sessionStore.credits_consumed,
    elapsedSeconds:      sessionStore.elapsed_seconds,

    // Aliases used by older page code
    currentQuestionIndex: sessionStore.current_question_index,
    currentTimeLimit:     config?.time_per_question_seconds ?? 180,
  };
}

// ── Fetch questions from Edge Function (with 8-second timeout) ──

async function fetchQuestions(
  config: SessionConfig,
  sessionId: string
): Promise<SessionQuestion[]> {
  const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const anonKey   =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
