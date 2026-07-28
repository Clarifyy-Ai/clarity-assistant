import type {
  InterviewRound,
  RoundStatus,
  ScheduledInterview,
} from "@/types/interview.types";

/** Interview-like shape from the scheduler store (virtual next_round / rounds). */
export type InterviewWithRounds = Pick<ScheduledInterview, "created_at"> & {
  next_round?: InterviewRound | null;
  rounds?: InterviewRound[] | null;
  /** Legacy / denormalized fields — prefer next_round when present */
  scheduled_at?: string | null;
  status?: RoundStatus | string | null;
};

export function getCurrentRound(
  interview: InterviewWithRounds,
): InterviewRound | null {
  return interview.next_round ?? interview.rounds?.[0] ?? null;
}

/** ISO datetime for the current/next round (falls back to created_at). */
export function getCurrentRoundDate(interview: InterviewWithRounds): string {
  const round = getCurrentRound(interview);
  return (
    round?.scheduled_at ??
    interview.scheduled_at ??
    interview.created_at
  );
}

/** Status for the current/next round (defaults to "scheduled"). */
export function getCurrentRoundStatus(
  interview: InterviewWithRounds,
): RoundStatus | string {
  const round = getCurrentRound(interview);
  return round?.status ?? interview.status ?? "scheduled";
}
