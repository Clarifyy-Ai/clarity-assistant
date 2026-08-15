/**
 * Interview mock/live session lifecycle (product FSM).
 * DB `sessions.status` remains the legacy enum; `lifecycle_status` is the
 * canonical coaching state machine.
 */

export const INTERVIEW_LIFECYCLE_STATES = [
  "CREATED",
  "DEVICE_CHECK",
  "READY",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "PROCESSING",
  "ANALYZED",
  "CANCELLED",
  "INTERRUPTED",
  "RECOVERABLE_ERROR",
  "FAILED",
] as const;

export type InterviewLifecycleState = (typeof INTERVIEW_LIFECYCLE_STATES)[number];

export type LegacySessionStatus =
  | "pending"
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

const TRANSITIONS: Record<InterviewLifecycleState, readonly InterviewLifecycleState[]> = {
  CREATED: ["DEVICE_CHECK", "READY", "CANCELLED", "FAILED"],
  DEVICE_CHECK: ["READY", "CREATED", "CANCELLED", "RECOVERABLE_ERROR", "FAILED"],
  READY: ["IN_PROGRESS", "DEVICE_CHECK", "CANCELLED", "FAILED"],
  IN_PROGRESS: [
    "PAUSED",
    "COMPLETED",
    "INTERRUPTED",
    "RECOVERABLE_ERROR",
    "CANCELLED",
    "FAILED",
  ],
  PAUSED: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "INTERRUPTED", "FAILED"],
  COMPLETED: ["PROCESSING", "ANALYZED"],
  PROCESSING: ["ANALYZED", "RECOVERABLE_ERROR", "FAILED"],
  ANALYZED: [],
  CANCELLED: [],
  INTERRUPTED: ["READY", "IN_PROGRESS", "CANCELLED", "FAILED"],
  RECOVERABLE_ERROR: ["DEVICE_CHECK", "READY", "IN_PROGRESS", "CANCELLED", "FAILED"],
  FAILED: [],
};

const LEGACY_TO_LIFECYCLE: Record<LegacySessionStatus, InterviewLifecycleState> = {
  pending: "CREATED",
  active: "IN_PROGRESS",
  paused: "PAUSED",
  completed: "COMPLETED",
  abandoned: "CANCELLED",
};

const LIFECYCLE_TO_LEGACY: Record<InterviewLifecycleState, LegacySessionStatus> = {
  CREATED: "pending",
  DEVICE_CHECK: "pending",
  READY: "pending",
  IN_PROGRESS: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  PROCESSING: "completed",
  ANALYZED: "completed",
  CANCELLED: "abandoned",
  INTERRUPTED: "abandoned",
  RECOVERABLE_ERROR: "paused",
  FAILED: "abandoned",
};

export function isInterviewLifecycleState(value: unknown): value is InterviewLifecycleState {
  return (
    typeof value === "string" &&
    (INTERVIEW_LIFECYCLE_STATES as readonly string[]).includes(value)
  );
}

export function lifecycleFromLegacyStatus(
  status: string | null | undefined,
): InterviewLifecycleState {
  if (isInterviewLifecycleState(status)) return status;
  const key = String(status ?? "pending") as LegacySessionStatus;
  return LEGACY_TO_LIFECYCLE[key] ?? "CREATED";
}

export function legacyStatusFromLifecycle(
  state: InterviewLifecycleState,
): LegacySessionStatus {
  return LIFECYCLE_TO_LEGACY[state];
}

export function canTransitionInterviewLifecycle(
  from: InterviewLifecycleState,
  to: InterviewLifecycleState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionInterviewLifecycle(
  from: InterviewLifecycleState,
  to: InterviewLifecycleState,
): InterviewLifecycleState {
  if (!canTransitionInterviewLifecycle(from, to)) {
    throw new Error(`Illegal interview lifecycle transition: ${from} → ${to}`);
  }
  return to;
}

export function resolveInterviewLifecycle(row: {
  lifecycle_status?: string | null;
  status?: string | null;
}): InterviewLifecycleState {
  if (isInterviewLifecycleState(row.lifecycle_status)) return row.lifecycle_status;
  return lifecycleFromLegacyStatus(row.status);
}
