/** Decide whether start-session may reuse a leftover row instead of inserting. */

export function isPracticeSessionExpired(
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= nowMs;
}

export function shouldReuseExistingSession(opts: {
  existingStatus: string | null | undefined;
  existingContextId: string | null | undefined;
  requestContextId: string | null | undefined;
  expiresAt?: string | null;
}): boolean {
  const status = String(opts.existingStatus ?? "").toLowerCase();
  if (status === "completed" || status === "abandoned") return false;
  // Failed End leaves `active`; reusing would overwrite History. Only pending.
  if (status !== "pending") return false;
  if (isPracticeSessionExpired(opts.expiresAt)) return false;
  const existing = opts.existingContextId ?? null;
  const request = opts.requestContextId ?? null;
  if (request && existing !== request) return false;
  if (!request && existing) return false;
  return true;
}

export const SESSIONS_CHANGED_EVENT = "career-pilot-sessions-changed";
/** @deprecated Legacy event name — still dispatched for older listeners. */
export const LEGACY_SESSIONS_CHANGED_EVENT = "clarify-sessions-changed";

export function notifySessionsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT));
  window.dispatchEvent(new Event(LEGACY_SESSIONS_CHANGED_EVENT));
}
