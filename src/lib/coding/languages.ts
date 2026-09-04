/**
 * Coding language surface — honesty contract.
 *
 * Executable practice: JavaScript + TypeScript (same solve(input) practice runner).
 * Secure multi-language sandbox: PARTIAL / not shipped (no Docker isolation).
 * Do not advertise Python/Java/etc. as executable.
 */

/** Languages exposed in UI selectors and accepted by the practice judge. */
export const APPROVED_CODING_LANGUAGES = ["javascript", "typescript"] as const;

export type ApprovedCodingLanguage = (typeof APPROVED_CODING_LANGUAGES)[number];

/** Languages that may appear in catalogs but are never auto-executed. */
export const NON_EXECUTABLE_CODING_LANGUAGES = ["python", "java", "csharp", "go", "cpp"] as const;

/** Product status for isolated multi-language sandbox (Docker, etc.). */
export const CODING_SANDBOX_STATUS = "PARTIAL" as const;

export const CODING_SANDBOX_HONESTY =
  "JavaScript/TypeScript practice execution only (solve(input) with soft limits) — not a secure multi-language sandbox. Isolated Docker runners are not available.";

/** Only JS/TS practice runs on the server/edge judge. Others are stored for review. */
export function isAutoExecutedLanguage(lang: string): boolean {
  const normalized = String(lang ?? "").trim().toLowerCase();
  return normalized === "javascript" || normalized === "typescript";
}

export function languageLabel(lang: string): string {
  switch (String(lang ?? "").trim().toLowerCase()) {
    case "javascript":
      return "JavaScript";
    case "typescript":
      return "TypeScript";
    case "python":
      return "Python";
    case "java":
      return "Java";
    default:
      return lang;
  }
}

/** Select option / list label with honest execution status. */
export function languageOptionLabel(lang: string): string {
  if (isAutoExecutedLanguage(lang)) {
    return `${languageLabel(lang)} (practice auto-scored — not a secure sandbox)`;
  }
  return `${languageLabel(lang)} (not executed — no sandbox)`;
}

export function evaluationModeLabel(mode: string): string {
  if (mode === "javascript_solve" || mode === "typescript_solve") {
    return "JS/TS solve() — practice server-scored (PARTIAL sandbox)";
  }
  return "Not executed — stored for review";
}

export function isApprovedCodingLanguage(lang: string): lang is ApprovedCodingLanguage {
  return (APPROVED_CODING_LANGUAGES as readonly string[]).includes(lang);
}

/**
 * JS and TS share the same practice solve(input) runner.
 * Allow either when the question itself is an auto-executed language.
 */
export function isPracticeLanguageFamilyMatch(
  selectedLanguage: string,
  questionLanguage: string,
): boolean {
  const selected = String(selectedLanguage ?? "").trim().toLowerCase();
  const question = String(questionLanguage ?? "").trim().toLowerCase();
  if (selected === question) return true;
  return isAutoExecutedLanguage(selected) && isAutoExecutedLanguage(question);
}

export function codingLanguageStorageKey(questionId: string): string {
  return `coding-lang:${questionId}`;
}

/** Evaluation mode written when creating an auto-scored practice question. */
export function evaluationModeForLanguage(lang: string): "javascript_solve" | "stored_review" {
  return isAutoExecutedLanguage(lang) ? "javascript_solve" : "stored_review";
}
