import type { LiveSessionConfig } from "@/types/session.types";

const LAST_SETUP_KEY = "clarify:last-practice-setup";
const PENDING_SETUP_KEY = "clarify:pending-practice-setup";
const PRACTICE_COUNT_KEY = "clarify:practice-session-count";
const DRAFT_KEY = "clarify:practice-setup-draft";

export type PracticeSetupDraft = {
  step?: number;
  company?: string;
  role?: string;
  interviewType?: string;
  resumeId?: string | null;
  jdId?: string | null;
  sessionCallType?: "interview" | "regular_call";
  language?: string;
  seniority?: string | null;
  industry?: string | null;
  interviewStage?: string | null;
  focusCompetencies?: string[];
  topicsToAvoid?: string[];
  skillsToEmphasize?: string[];
  skillsNotToClaim?: string[];
  answerBankContextIds?: string[];
  textVoiceMode?: "text" | "voice";
  ttsVoice?: string | null;
  followUpDepth?: "none" | "light" | "deep";
  feedbackStyle?: "concise" | "balanced" | "detailed";
  durationMinutes?: number;
  model?: string;
}

export const FIRST_PRACTICE_EVENT = "clarify:first-practice";

export function getPracticeSessionCount(): number {
  try {
    const raw = localStorage.getItem(PRACTICE_COUNT_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** True after the user has started at least one Practice Coach session. */
export function hasCompletedFirstPractice(): boolean {
  return getPracticeSessionCount() >= 1;
}

function recordPracticeSessionStarted(): void {
  try {
    const next = getPracticeSessionCount() + 1;
    localStorage.setItem(PRACTICE_COUNT_KEY, String(next));
    if (next === 1 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FIRST_PRACTICE_EVENT));
    }
  } catch {
    // ignore quota / private mode
  }
}

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
    recordPracticeSessionStarted();
  } catch {
    // ignore quota / private mode
  }
}

/** In-progress wizard fields. Does not replace last completed setup or increment session count. */
export function loadPracticeSetupDraft(): PracticeSetupDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PracticeSetupDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePracticeSetupDraft(draft: PracticeSetupDraft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function clearPracticeSetupDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore storage failures
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

function readPendingPracticeSetup(remove: boolean): LiveSessionConfig | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SETUP_KEY);
    if (!raw) return null;
    if (remove) sessionStorage.removeItem(PENDING_SETUP_KEY);
    const parsed = JSON.parse(raw) as LiveSessionConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingPracticeSetup(): void {
  try {
    sessionStorage.removeItem(PENDING_SETUP_KEY);
  } catch {
    // ignore
  }
}

/** Read a handoff config without consuming it (wizard prefill). */
export function peekPendingPracticeSetup(): LiveSessionConfig | null {
  return readPendingPracticeSetup(false);
}

export function consumePendingPracticeSetup(): LiveSessionConfig | null {
  return readPendingPracticeSetup(true);
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
