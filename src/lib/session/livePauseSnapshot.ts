/**
 * Client-side pause snapshot for Live sessions (sessions table has no paused_at).
 * Survives refresh while status === paused.
 */

export type LivePauseSnapshot = {
  paused_at: string;
  total_paused_ms: number;
  expires_at: string | null;
  elapsed_seconds: number;
};

const PREFIX = "clarify:live-pause:";

export function livePauseStorageKey(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export function saveLivePauseSnapshot(
  sessionId: string,
  snapshot: LivePauseSnapshot,
): void {
  try {
    sessionStorage.setItem(livePauseStorageKey(sessionId), JSON.stringify(snapshot));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadLivePauseSnapshot(sessionId: string): LivePauseSnapshot | null {
  try {
    const raw = sessionStorage.getItem(livePauseStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LivePauseSnapshot>;
    if (typeof parsed.paused_at !== "string" || !parsed.paused_at) return null;
    return {
      paused_at: parsed.paused_at,
      total_paused_ms: Math.max(0, Number(parsed.total_paused_ms) || 0),
      expires_at: typeof parsed.expires_at === "string" ? parsed.expires_at : null,
      elapsed_seconds: Math.max(0, Number(parsed.elapsed_seconds) || 0),
    };
  } catch {
    return null;
  }
}

export function clearLivePauseSnapshot(sessionId: string): void {
  try {
    sessionStorage.removeItem(livePauseStorageKey(sessionId));
  } catch {
    /* ignore */
  }
}
