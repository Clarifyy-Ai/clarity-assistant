/**
 * Product-mode identity helpers (N7).
 * Interview Practice vs Gov Exam Prep — derived from the current app route.
 */

export type ProductMode = "interview" | "gov";

const INTERVIEW_PREFIXES = [
  "/app/live",
  "/app/prep",
  "/app/sessions",
  "/app/answers",
  "/app/interview", // interview-day, interviews
  "/app/companies",
  "/app/debrief",
  "/app/debriefs",
  "/app/dashboard",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Resolve product mode from a pathname, or null when mode-agnostic (settings, etc.). */
export function getProductMode(pathname: string): ProductMode | null {
  // Gov Exam Prep must win over /app/mock* (mock-test vs mock interview).
  if (matchesPrefix(pathname, "/app/mock-test")) return "gov";

  if (INTERVIEW_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return "interview";
  }

  // Mock Interview routes: /app/mock, /app/mock/... — not /app/mock-test
  if (matchesPrefix(pathname, "/app/mock")) return "interview";

  return null;
}

export const PRODUCT_MODE_SWITCH = {
  interview: "/app/mock-test",
  gov: "/app/dashboard",
} as const;
