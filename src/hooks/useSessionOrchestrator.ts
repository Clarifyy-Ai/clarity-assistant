import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/store/sessionStore";
import { useCoachStore } from "@/store/coachStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/userStore";
import { useGamificationStore } from "@/store/gamificationStore";
import { buildCoachingContext } from "@/lib/ai/contextEnvelopeBuilder";
import { routeHint } from "@/lib/ai/modelRouter";
import { checkCredits, deductCredits } from "@/lib/billing/creditsManager";
import { useOverlayStore } from "@/store/overlayStore";
import { generateId } from "@/lib/utils";
import type { SessionConfig } from "@/types/session.types";
import type { SessionQuestion } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// useSessionOrchestrator
// Top-level session lifecycle management hook.
// Coordinates: config → question loading → hint routing
//              → credit deduction → XP + gamification → scorecard nav
// ─────────────────────────────────────────────────────────────────

export function useSessionOrchestrator() {
  const navigate     = useNavigate();
  const sessionStore = useSessionStore();
  const coachStore   = useCoachStore();
  const overlayStore = useOverlayStore();
  const { profile }  = useAuthStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const hintRequestIdRef   = useRef<string | null>(null);

  // ── Initialise session ────────────────────────────────────────

  const initSession = useCallback(async (config: SessionConfig) => {
    if (!profile) return;

    const sessionId = generateId();
    sessionStore.setSessionId(sessionId);
    sessionStore.setMode("mock");
    sessionStore.setConfig(config);
    sessionStore.setStatus("setting_up");

    // Build coaching context
    const { active_context } = useDocumentStore.getState();
    const context = buildCoachingContext(profile, config, active_context);
    coachStore.initContext(context);

    // Load questions from Edge Function
    try {
      const questions = await fetchQuestions(config, sessionId);
      sessionStore.setQuestions(questions);
      sessionStore.setStatus("in_progress");
    } catch (err) {
      sessionStore.setStatus("error" as any);
    }
  }, [profile]);

  // ── Request a hint ─────────────────────────────────────────────

  const requestHint = useCallback(async (question: string) => {
    if (!profile) return;

    const context = coachStore.getContext();
    if (!context) return;

    const preferredModel = profile.preferred_model;
    const interviewType  = context.session_type;

    // Credit check
    const creditCheck = checkCredits(preferredModel);
    if (!creditCheck.canProceed) {
      overlayStore.setError(creditCheck.reason ?? "Insufficient credits");
      return;
    }

    // Abort any in-flight request
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
      preferredModel,
      interviewType,
      isLive:         false,
      sessionId:      session_id ?? "unknown",
      questionId:     requestId,
      onChunk:        (chunk) => {
        // Only apply if this is still the current request
        if (hintRequestIdRef.current === requestId) {
          overlayStore.appendStreamChunk(chunk);
        }
      },
      onDone:         async (fullText) => {
        if (hintRequestIdRef.current !== requestId) return;
        overlayStore.commitStreamedHint();

        // Deduct credits after successful response
        await deductCredits(preferredModel, session_id ?? "unknown");
        sessionStore.consumeCredit(creditCheck.creditsRequired);

        // Update coaching context with answer summary
        coachStore.incrementQuestionNumber();
      },
      onError:        (error) => {
        if (hintRequestIdRef.current === requestId) {
          overlayStore.setError(error.message);
        }
      },
      signal:         controller.signal,
    });
  }, [profile]);

  // ── Advance to next question ───────────────────────────────────

  const nextQuestion = useCallback(() => {
    overlayStore.clearHint();
    coachStore.incrementQuestionNumber();
    sessionStore.advanceQuestion();
  }, []);

  // ── Complete session ───────────────────────────────────────────

  const completeSession = useCallback(async () => {
    abortControllerRef.current?.abort();
    sessionStore.setStatus("completed");

    const { session_id } = useSessionStore.getState();
    if (!session_id) return;

    // Award XP
    try {
      const { awardXP } = await import("@/lib/gamification/xpEngine");
      await awardXP("mock_session_complete", session_id);
    } catch { /* non-fatal */ }

    // Navigate to scorecard
    navigate(`/scorecard/${session_id}`);
  }, [navigate]);

  // ── Abort current hint ─────────────────────────────────────────

  const abortHint = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    overlayStore.clearHint();
  }, []);

  // ── Reset session ─────────────────────────────────────────────

  const resetSession = useCallback(() => {
    abortHint();
    sessionStore.resetSession();
    coachStore.clearContext();
    overlayStore.clearHint();
  }, []);

  return {
    initSession,
    requestHint,
    nextQuestion,
    completeSession,
    abortHint,
    resetSession,
    status:              sessionStore.status,
    currentQuestion:     sessionStore.current_question,
    currentIndex:        sessionStore.current_question_index,
    totalQuestions:      sessionStore.questions.length,
    creditsConsumed:     sessionStore.credits_consumed,
    elapsedSeconds:      sessionStore.elapsed_seconds,
  };
}

// ─────────────────────────────────────────────────────────────────
// Fetch questions from Edge Function
// ─────────────────────────────────────────────────────────────────

async function fetchQuestions(
  config: SessionConfig,
  sessionId: string
): Promise<SessionQuestion[]> {
  const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const response = await fetch(`${EDGE_BASE}/generate-questions`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      interview_type:   config.interview_type,
      experience_level: config.experience_level,
      company:          config.company ?? null,
      role:             config.role ?? null,
      question_count:   config.question_count ?? 5,
      difficulty:       config.difficulty ?? "medium",
      session_id:       sessionId,
      resume_context:   useDocumentStore.getState().active_context.resume_version?.parsed_data ?? null,
      jd_context:       useDocumentStore.getState().active_context.jd?.parsed_data ?? null,
    }),
  });

  if (!response.ok) throw new Error(`Question fetch failed: ${response.status}`);

  const data = await response.json();
  return (data.questions as SessionQuestion[]).map((q, i) => ({
    ...q,
    id:             q.id ?? generateId(),
    order_index:    i,
    is_answered:    false,
    time_taken_sec: null,
  }));
}
