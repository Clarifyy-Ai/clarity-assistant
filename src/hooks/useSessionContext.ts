import { useCallback } from "react";
import { useCoachStore } from "@/store/coachStore";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { buildContextEnvelope } from "@/lib/ai/contextEnvelopeBuilder";
import type { CoachContext } from "@/types/ai.types";

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

  const initContext = useCallback((overrides?: Partial<CoachContext>): void => {
    const profile = authStore.profile;
    const resume  = docStore.activeResume;
    const jd      = docStore.activeJD;

    const context: CoachContext = {
      user_id:          profile?.id ?? "",
      role:             profile?.role ?? "interview_candidate",
      domain:           profile?.domain ?? "Technology",
      experience_level: profile?.experience_level ?? "mid",
      target_company:   overrides?.target_company ?? null,
      target_role:      overrides?.target_role    ?? null,
      coach_tone:       profile?.coach_tone ?? "encouraging",
      hint_style:       profile?.hint_style ?? "short_hints",
      session_goals:    overrides?.session_goals ?? [],
      weak_areas:       profile?.weak_areas ?? [],
      strong_areas:     profile?.strong_areas ?? [],
      resume_summary:   resume?.active_version?.parsed_data?.summary ?? null,
      jd_summary:       jd?.parsed_data?.role_title
        ? `${jd.parsed_data.role_title} at ${jd.company_name ?? "target company"}`
        : null,
      recent_answers:   [],
      session_number:   (profile?.total_sessions ?? 0) + 1,
      ...overrides,
    };

    coachStore.setContext(context);
  }, [authStore.profile, docStore.activeResume, docStore.activeJD]);

  // ── Record an answer summary after each question ──────────────

  const recordAnswer = useCallback((params: {
    questionText: string;
    answerSummary: string;
    score: number;
    fillerCount: number;
  }): void => {
    coachStore.appendRecentAnswer({
      question: params.questionText,
      summary:  params.answerSummary,
      score:    params.score,
      fillers:  params.fillerCount,
    });

    // Update weak areas dynamically
    if (params.score < 50) {
      coachStore.addWeakArea(params.questionText.slice(0, 40));
    }
    if (params.score >= 75) {
      coachStore.addStrongArea(params.questionText.slice(0, 40));
    }
  }, [coachStore]);

  // ── Set session goal ──────────────────────────────────────────

  const setGoal = useCallback((goal: string): void => {
    coachStore.addSessionGoal(goal);
  }, [coachStore]);

  // ── Get full envelope for an AI call ─────────────────────────

  const getEnvelope = useCallback((question: string): Record<string, unknown> => {
    return buildContextEnvelope({
      profile:      authStore.profile ?? undefined,
      coachContext: coachStore.context,
      question,
    });
  }, [authStore.profile, coachStore.context]);

  return {
    context:      coachStore.context,
    initContext,
    recordAnswer,
    setGoal,
    getEnvelope,
    clearContext: coachStore.clearContext,
  };
}
