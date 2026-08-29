// Stash lightweight post-session stats for the immediate 3-bullet summary.

export interface LastSessionSummary {
  sessionId: string;
  durationSeconds: number;
  questionsDetected: number;
  hintsUsed: number;
  endedAt: number;
}

const KEY = "clarify:last-session-summary";

export function saveLastSessionSummary(summary: LastSessionSummary): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // ignore
  }
}

export function loadLastSessionSummary(sessionId?: string | null): LastSessionSummary | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSessionSummary;
    if (!parsed || typeof parsed !== "object") return null;
    if (sessionId && parsed.sessionId !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastSessionSummary(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m <= 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

export function buildNextStepSuggestion(summary: LastSessionSummary | null): string {
  if (!summary) {
    return "Open your Scorecard to review strengths and gaps.";
  }
  if (summary.hintsUsed === 0) {
    return "Try another session with Auto-generate on to get more coaching cues.";
  }
  if (summary.questionsDetected <= 1) {
    return "Practice a longer mock to cover more question types.";
  }
  if (summary.durationSeconds < 180) {
    return "Run a fuller practice round (15+ min) to build stamina.";
  }
  return "Review your Debrief for talking-point improvements before Interview Day.";
}
