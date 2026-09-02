import type {
  InterviewRound,
  RoundStatus,
  ScheduledInterview,
} from "@/types/interview.types";
import {
  isScheduledToday,
  resolveSchedulerTimezoneKey,
} from "@/lib/interviews/schedulerTimezone";

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
  if (interview.next_round) return interview.next_round;
  const rounds = interview.rounds ?? [];
  const active = rounds.find((r) => r.status !== "cancelled");
  return active ?? rounds[0] ?? null;
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
  // Parent interview cancel wins — do not resurface a stale round as active.
  if (interview.status === "cancelled") return "cancelled";
  if (interview.status === "completed") return "completed";
  const round = getCurrentRound(interview);
  return round?.status ?? interview.status ?? "scheduled";
}

/** True when the current round's scheduled time is today in its timezone. */
export function isInterviewScheduledToday(interview: InterviewWithRounds): boolean {
  const round = getCurrentRound(interview);
  const iso = getCurrentRoundDate(interview);
  const interviewTz = (interview as { timezone?: string | null }).timezone;
  const tz = resolveSchedulerTimezoneKey(round?.timezone, interviewTz);
  return isScheduledToday(iso, tz);
}
