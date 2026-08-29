import { useCallback } from "react";
import { useCoachStore } from "@/store/coachStore";
import { useAuthStore } from "@/store/authStore";
import { useDocumentStore } from "@/store/documentStore";
import { buildCoachingContext, serialiseContextForPrompt } from "@/lib/ai/contextEnvelopeBuilder";
import type { CoachingContext } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// useSessionContext
// Builds, reads, and updates the shared coaching context object
// that is attached to every AI call.
// ─────────────────────────────────────────────────────────────────

export function useSessionContext() {
  const coachStore  = useCoachStore();
  const authStore   = useAuthStore();
  const docStore    = useDocumentStore();

  // ── Build fresh context for session start ─────────────────────

  const initContext = useCallback((overrides?: Partial<CoachingContext>): void => {
    const profile = authStore.profile as
      | (NonNullable<typeof authStore.profile> & {
          experience_level?: CoachingContext["experience_level"];
          preferred_model?: string;
          hint_style?: CoachingContext["hint_style"];
        })
      | null;
    if (!profile) return;

    const { active_context } = docStore;

    const context = buildCoachingContext(profile, {
      company: overrides?.target_company ?? null,
      role: overrides?.role ?? null,
      experience_level: profile.experience_level ?? "mid",
      interview_type: overrides?.session_type ?? "mixed",
      question_count: overrides?.total_questions ?? 5,
      time_per_question_seconds: 180,
      model: profile.preferred_model,
      hint_style: profile.hint_style ?? "short_hints",
      include_warmup: false,
      resume_id: null,
      jd_id: null,
      focus_areas: [],
    } as Parameters<typeof buildCoachingContext>[1], active_context, overrides);

    coachStore.initContext(context);
  }, [authStore.profile, docStore]);

  // ── Record an answer summary after each question ──────────────

  const recordAnswer = useCallback((params: {
    questionText: string;
    answerSummary: string;
    score: number;
    fillerCount: number;
  }): void => {
    coachStore.addAnswerSummary({
      question: params.questionText,
      score:    params.score,
      key_weakness: params.fillerCount > 5 ? "Too many filler words" : null,
    });

    if (params.score < 50) {
      coachStore.addWeakArea(params.questionText.slice(0, 40));
    }
    if (params.score >= 75) {
      coachStore.addStrongArea(params.questionText.slice(0, 40));
    }
  }, [coachStore]);

  // ── Set session goal ──────────────────────────────────────────

  const setGoal = useCallback((goal: string): void => {
    const ctx = coachStore.getContext();
    if (ctx) {
      coachStore.setSessionGoals([...ctx.session_goals, goal]);
    }
  }, [coachStore]);

  // ── Get full envelope for an AI call ─────────────────────────

  const getEnvelope = useCallback((question: string): Record<string, unknown> => {
    const ctx = coachStore.getContext();
    if (!ctx) return { question };
    return {
      question,
      context_summary: serialiseContextForPrompt(ctx),
    };
  }, [coachStore]);

  return {
    context:      coachStore.context,
    initContext,
    recordAnswer,
    setGoal,
    getEnvelope,
    clearContext: coachStore.clearContext,
  };
}
