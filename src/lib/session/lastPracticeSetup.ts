import type { LiveSessionConfig } from "@/types/session.types";

const LAST_SETUP_KEY = "clarify:last-practice-setup";
const PENDING_SETUP_KEY = "clarify:pending-practice-setup";

export function loadLastPracticeSetup(): LiveSessionConfig | null {
  try {
    const raw = localStorage.getItem(LAST_SETUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveSessionConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastPracticeSetup(config: LiveSessionConfig): void {
  try {
    localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(config));
  } catch {
    // ignore quota / private mode
  }
}

/** Pass config from /app/live setup → /app/live/overlay without losing it on navigation. */
export function stashPendingPracticeSetup(config: LiveSessionConfig): void {
  try {
    sessionStorage.setItem(PENDING_SETUP_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function consumePendingPracticeSetup(): LiveSessionConfig | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SETUP_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_SETUP_KEY);
    const parsed = JSON.parse(raw) as LiveSessionConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatPracticeSetupSummary(config: LiveSessionConfig): string {
  const parts: string[] = [];
  if (config.interview_type) parts.push(config.interview_type.replace(/_/g, " "));
  if (config.company) parts.push(config.company);
  if (config.role) parts.push(config.role);
  if (config.model) parts.push(config.model);
  if (config.duration_minutes) parts.push(`${config.duration_minutes} min`);
  return parts.length > 0 ? parts.join(" · ") : "Your last Practice Coach setup";
}
