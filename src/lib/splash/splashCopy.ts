/**
 * Career Pilot splash status copy.
 * Route-aware; never interpolates PII, resume text, or answers.
 */

export const SPLASH_SUPPORTING =
  "Your AI-powered companion for interviews, career preparation, and Government Exams.";

export const SPLASH_BOOT_STATUS = "Preparing your workspace…";

export const SPLASH_MESSAGES = {
  offline: "You appear to be offline.",
  electron: "Connecting your Practice Coach workspace…",
  practiceCoach: "Getting your AI Practice Coach ready…",
  live: "Preparing your audio and interview workspace…",
  mock: "Preparing your personalized interview…",
  govExams: "Preparing your exam practice environment…",
  documents: "Preparing your Resume and Job Description workspace…",
  analytics: "Loading your progress and personalized insights…",
  returning: "Welcome back. Restoring your preparation journey…",
  firstVisit: "Preparing your smarter path to success…",
  default: SPLASH_BOOT_STATUS,
} as const;

export type SplashCopyInput = {
  pathname: string;
  isElectron: boolean;
  hasUser: boolean;
  offline: boolean;
};

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.trim();
  if (!trimmed.startsWith("/")) return `/${trimmed}`;
  return trimmed.replace(/\/+$/, "") || "/";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Resolve a single status line. Priority: offline > electron > route > returning vs first visit. */
export function resolveSplashMessage(input: SplashCopyInput): string {
  if (input.offline) return SPLASH_MESSAGES.offline;
  if (input.isElectron) return SPLASH_MESSAGES.electron;

  const pathname = normalizePathname(input.pathname);

  if (matchesPrefix(pathname, "/app/practice-workspace")) {
    return SPLASH_MESSAGES.practiceCoach;
  }
  if (matchesPrefix(pathname, "/app/live")) {
    return SPLASH_MESSAGES.live;
  }
  if (matchesPrefix(pathname, "/app/mock-test")) {
    return SPLASH_MESSAGES.govExams;
  }
  if (matchesPrefix(pathname, "/app/mock")) {
    return SPLASH_MESSAGES.mock;
  }
  if (matchesPrefix(pathname, "/app/documents")) {
    return SPLASH_MESSAGES.documents;
  }
  if (matchesPrefix(pathname, "/app/analytics")) {
    return SPLASH_MESSAGES.analytics;
  }

  if (input.hasUser) return SPLASH_MESSAGES.returning;
  if (pathname === "/" || pathname === "") return SPLASH_MESSAGES.firstVisit;

  return SPLASH_MESSAGES.firstVisit;
}
