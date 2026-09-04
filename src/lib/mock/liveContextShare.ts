/**
 * Shared Resume/JD snapshot resolution for Mock + Live (Phase 2).
 */

import type { InterviewContextSnapshot } from "@/lib/mock/interviewContext";
import type { PracticeCoachContextSnapshot } from "@/lib/session/practiceCoachContext";
import type { LiveSessionConfig } from "@/types/session.types";

export type FrozenDocumentPair = {
  resume: string;
  jd: string;
  fromSnapshot: boolean;
};

type AnyContextSnapshot =
  | InterviewContextSnapshot
  | PracticeCoachContextSnapshot
  | null
  | undefined;

/** Prefer immutable interview / practice-coach snapshot texts when present. */
export function resolveFrozenDocuments(input: {
  snapshot: AnyContextSnapshot;
  liveResume?: string;
  liveJd?: string;
}): FrozenDocumentPair {
  if (input.snapshot) {
    return {
      resume: input.snapshot.resume_text || input.liveResume || "",
      jd: input.snapshot.jd_text || input.liveJd || "",
      fromSnapshot: true,
    };
  }
  return {
    resume: input.liveResume || "",
    jd: input.liveJd || "",
    fromSnapshot: false,
  };
}

export function configFromInterviewSnapshot(
  snapshot: InterviewContextSnapshot,
  base?: Partial<LiveSessionConfig>,
): Partial<LiveSessionConfig> {
  return {
    ...base,
    role: snapshot.role,
    company: snapshot.company,
    interview_type: snapshot.interview_type,
    difficulty: snapshot.difficulty,
    question_count: snapshot.planned_question_count,
    duration_minutes: snapshot.duration_minutes,
    language: snapshot.language,
    tts_voice: snapshot.voice_id,
    follow_up_depth: snapshot.follow_up_depth,
    resume_id: snapshot.resume_id,
    jd_id: snapshot.jd_id,
    focus_competencies: snapshot.focus_competencies,
    skills_to_emphasize: snapshot.skills_to_emphasize,
    skills_not_to_claim: snapshot.skills_not_to_claim,
    topics_to_avoid: snapshot.topics_to_avoid,
    text_voice_mode:
      snapshot.input_mode === "text"
        ? "text"
        : snapshot.input_mode === "voice"
          ? "voice"
          : base?.text_voice_mode,
  };
}
