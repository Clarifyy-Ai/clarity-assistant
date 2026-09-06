/**
 * Shared session lifecycle DTO — normalize DB + client session shapes at boundaries.
 * Keep lifecycle_status authoritative; UI stores are caches only.
 */

export type SessionLifecycleStatus =
  | "draft"
  | "active"
  | "paused"
  | "ended"
  | "cancelled"
  | "archived"
  | string;

export type SessionLifecycleSource = {
  id?: string | null;
  status?: string | null;
  lifecycle_status?: SessionLifecycleStatus | null;
  terminal_reason?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
};

export type NormalizedSessionLifecycle = {
  id: string | null;
  status: string | null;
  lifecycleStatus: SessionLifecycleStatus | null;
  terminalReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  isTerminal: boolean;
};

const TERMINAL_LIFECYCLES = new Set([
  "ended",
  "cancelled",
  "archived",
  "completed",
]);

export function normalizeSessionLifecycle(
  input: SessionLifecycleSource | null | undefined,
): NormalizedSessionLifecycle | null {
  if (input == null || typeof input !== "object") return null;

  const row = input as Record<string, unknown>;
  const lifecycleRaw = row.lifecycle_status;
  const lifecycleStatus =
    typeof lifecycleRaw === "string" && lifecycleRaw.trim()
      ? (lifecycleRaw.trim() as SessionLifecycleStatus)
      : null;
  const status = typeof row.status === "string" ? row.status : null;
  const terminalReason =
    typeof row.terminal_reason === "string" ? row.terminal_reason : null;
  const startedAt =
    typeof row.started_at === "string" ? row.started_at : null;
  const endedAt = typeof row.ended_at === "string" ? row.ended_at : null;
  const durationRaw = row.duration_seconds;
  const durationSeconds =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw >= 0
      ? Math.floor(durationRaw)
      : null;
  const id = typeof row.id === "string" ? row.id : null;

  const lifecycleTerminal = lifecycleStatus
    ? TERMINAL_LIFECYCLES.has(lifecycleStatus.toLowerCase())
    : false;
  const statusTerminal =
    status != null &&
    ["ended", "completed", "cancelled", "archived"].includes(status.toLowerCase());
  const isTerminal = lifecycleTerminal || statusTerminal || endedAt != null;

  if (!id && !status && !lifecycleStatus && !startedAt && !endedAt) {
    return null;
  }

  return {
    id,
    status,
    lifecycleStatus,
    terminalReason,
    startedAt,
    endedAt,
    durationSeconds,
    isTerminal,
  };
}
