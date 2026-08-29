/** Server-approved coding languages. Only javascript is auto-executed. */
export const APPROVED_CODING_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
] as const;

export type ApprovedCodingLanguage = (typeof APPROVED_CODING_LANGUAGES)[number];

/** Only JavaScript runs on the server/edge judge. Others are stored for review. */
export function isAutoExecutedLanguage(lang: string): boolean {
  return lang === "javascript";
}

export function languageLabel(lang: string): string {
  switch (lang) {
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
    return `${languageLabel(lang)} (auto-scored on server)`;
  }
  return `${languageLabel(lang)} (not executed — pending review)`;
}

export function evaluationModeLabel(mode: string): string {
  if (mode === "javascript_solve") return "JS solve() — server-scored";
  return "Not executed — stored for review";
}

export function isApprovedCodingLanguage(lang: string): lang is ApprovedCodingLanguage {
  return (APPROVED_CODING_LANGUAGES as readonly string[]).includes(lang);
}
