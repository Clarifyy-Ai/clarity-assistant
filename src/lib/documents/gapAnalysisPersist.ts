/** Client helpers for persisted Resume↔JD gap analysis (survives refresh). */

export type GapAnalysisResult = {
  match_score?: number;
  matching_skills?: string[];
  missing_skills?: string[];
  recommendations?: string[];
  experience_gap?: string;
  education_fit?: string;
  stale?: boolean;
  updated_at?: string;
  status?: "pending" | "completed" | "failed" | "stale";
};

const UNKNOWN_VALUES = new Set([
  "unknown",
  "n/a",
  "na",
  "unable to parse ai response.",
  "unable to parse ai response",
]);

export function isUnknownAbsence(value?: string | null): boolean {
  if (!value) return true;
  return UNKNOWN_VALUES.has(value.trim().toLowerCase());
}

export function formatAbsenceLabel(
  kind: "experience" | "education",
  value?: string | null,
): string {
  if (isUnknownAbsence(value)) {
    return kind === "experience"
      ? "No experience evidence found in the selected resume"
      : "No education evidence found in the selected resume";
  }
  return value!.trim();
}

export function isAnalysisStale(opts: {
  staleFlag?: boolean | null;
  storedResumeUpdatedAt?: string | null;
  storedJdUpdatedAt?: string | null;
  currentResumeUpdatedAt?: string | null;
  currentJdUpdatedAt?: string | null;
}): boolean {
  if (opts.staleFlag) return true;
  if (
    opts.storedResumeUpdatedAt &&
    opts.currentResumeUpdatedAt &&
    opts.storedResumeUpdatedAt !== opts.currentResumeUpdatedAt
  ) {
    return true;
  }
  if (
    opts.storedJdUpdatedAt &&
    opts.currentJdUpdatedAt &&
    opts.storedJdUpdatedAt !== opts.currentJdUpdatedAt
  ) {
    return true;
  }
  return false;
}

export function splitCodingHints(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const numbered = trimmed
    .split(/\n(?=\s*(?:\d+\s*[.)]\s+|hint\s*\d+\s*[:.\-]))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (numbered.length >= 2) return numbered.slice(0, 5);
  const paras = trimmed.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (paras.length >= 2) return paras.slice(0, 5);
  return [trimmed];
}
