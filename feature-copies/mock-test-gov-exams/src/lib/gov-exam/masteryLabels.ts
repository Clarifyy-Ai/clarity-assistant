import type { MasteryState } from "@/lib/gov-exam/masteryEngine";

/** Spec labels for syllabus tracking (4.3). */
export const SYLLABUS_TRACKING_LABELS = [
  "not_started",
  "learning",
  "practiced",
  "needs_revision",
  "mastered",
] as const;

export type SyllabusTrackingLabel = (typeof SYLLABUS_TRACKING_LABELS)[number];

const MASTERY_TO_TRACKING: Record<MasteryState, SyllabusTrackingLabel> = {
  not_assessed: "not_started",
  foundation_needed: "learning",
  developing: "learning",
  practicing: "practiced",
  strong: "needs_revision",
  exam_ready: "mastered",
};

const TRACKING_COPY: Record<SyllabusTrackingLabel, string> = {
  not_started: "Not started",
  learning: "Learning",
  practiced: "Practiced",
  needs_revision: "Needs revision",
  mastered: "Mastered",
};

export function trackingLabelFromMastery(state: MasteryState): SyllabusTrackingLabel {
  return MASTERY_TO_TRACKING[state];
}

export function trackingLabelCopy(label: SyllabusTrackingLabel): string {
  return TRACKING_COPY[label];
}

export function masteryTrackingCopy(state: MasteryState): string {
  return trackingLabelCopy(trackingLabelFromMastery(state));
}
