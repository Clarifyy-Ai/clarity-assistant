export const ACCOUNT_DELETION_STATES = [
  "requested",
  "identity_confirmed",
  "processing",
  "partially_completed",
  "retrying",
  "completed",
  "failed",
] as const;

export type AccountDeletionStatus = (typeof ACCOUNT_DELETION_STATES)[number];

export function isTerminalDeletionStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

export function isOpenDeletionStatus(status: string): boolean {
  return ACCOUNT_DELETION_STATES.includes(status as AccountDeletionStatus)
    && !isTerminalDeletionStatus(status);
}
