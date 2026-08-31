import {
  getCurrentRoundDate,
  getCurrentRoundStatus,
  type InterviewWithRounds,
} from "@/lib/interviews/roundHelpers";

export function isActiveUpcomingInterview(interview: InterviewWithRounds): boolean {
  const status = String(getCurrentRoundStatus(interview));
  if (status === "cancelled" || status === "completed") return false;
  const when = new Date(getCurrentRoundDate(interview));
  if (Number.isNaN(when.getTime())) return false;
  return when.getTime() >= Date.now() - 60 * 60 * 1000;
}

export function upcomingInterviewsForDashboard<T extends InterviewWithRounds>(
  interviews: T[],
  limit = 3,
): T[] {
  return interviews
    .filter((interview) => isActiveUpcomingInterview(interview))
    .sort(
      (a, b) =>
        new Date(getCurrentRoundDate(a)).getTime() -
        new Date(getCurrentRoundDate(b)).getTime(),
    )
    .slice(0, limit);
}
