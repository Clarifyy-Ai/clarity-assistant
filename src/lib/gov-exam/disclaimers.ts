export const GOV_EXAM_AFFILIATION_DISCLAIMER =
  "Career Pilot is an independent preparation platform and is not affiliated with or " +
  "endorsed by any government recruiting body. Candidates must verify notifications, " +
  "eligibility, dates, syllabus, and examination rules on the official website.";

export const AI_GENERATED_PAPER_LABEL =
  "AI-generated practice paper based on the selected syllabus, pattern, and " +
  "historical topic distribution. This is not an official or leaked examination paper.";

export const PATTERN_BASED_PRACTICE_LABEL =
  "Pattern-based practice questions — not predicted or leaked examination questions.";

export const OFFICIAL_PREVIOUS_PAPER_LABEL =
  "Previous-year style practice assembled from approved bank items with provenance. " +
  "Not a reprint of a sealed official paper and not affiliated with the recruiting body.";

export const CUSTOM_PRACTICE_PAPER_LABEL =
  "Custom Practice Set — assembled from available approved bank items. " +
  "Not a full official exam simulation.";

export type PaperClass = "official_previous" | "ai_generated" | "custom_practice";

const PAPER_CLASS_SET = new Set<string>([
  "official_previous",
  "ai_generated",
  "custom_practice",
]);

/** Short badge labels for session/results chrome */
export const PAPER_CLASS_SHORT_LABELS: Record<PaperClass, string> = {
  official_previous: "Previous-year style",
  ai_generated: "AI-generated practice",
  custom_practice: "Custom practice",
};

export const PAPER_CLASS_DISCLAIMERS: Record<PaperClass, string> = {
  official_previous: OFFICIAL_PREVIOUS_PAPER_LABEL,
  ai_generated: AI_GENERATED_PAPER_LABEL,
  custom_practice: CUSTOM_PRACTICE_PAPER_LABEL,
};

export function parsePaperClass(value: unknown): PaperClass | null {
  if (typeof value !== "string") return null;
  return PAPER_CLASS_SET.has(value) ? (value as PaperClass) : null;
}

/**
 * Resolve display label + disclaimer from mock_tests.config fields.
 * Prefer stored disclaimer when present; otherwise map from paper_class.
 */
export function resolvePaperClassPresentation(config: Record<string, unknown> | null | undefined): {
  paperClass: PaperClass | null;
  shortLabel: string | null;
  disclaimer: string | null;
} {
  const paperClass = parsePaperClass(config?.paper_class);
  const stored =
    typeof config?.disclaimer === "string" && config.disclaimer.trim()
      ? config.disclaimer.trim()
      : null;

  if (!paperClass && !stored) {
    return { paperClass: null, shortLabel: null, disclaimer: null };
  }

  return {
    paperClass,
    shortLabel: paperClass ? PAPER_CLASS_SHORT_LABELS[paperClass] : null,
    disclaimer: stored ?? (paperClass ? PAPER_CLASS_DISCLAIMERS[paperClass] : null),
  };
}

export interface InsightBreakdownSlice {
  correct?: number;
  wrong?: number;
  attempted?: number;
  total?: number;
  accuracy?: number;
}

/**
 * One action-oriented next step from existing analysis breakdowns.
 * Returns null when there is nothing useful to recommend.
 */
export function primaryActionInsight(input: {
  weak_topics?: string[] | null;
  strong_topics?: string[] | null;
  subject_breakdown?: Record<string, InsightBreakdownSlice> | null;
  topic_breakdown?: Record<string, InsightBreakdownSlice> | null;
}): string | null {
  const weak = (input.weak_topics ?? []).filter((t) => typeof t === "string" && t.trim());
  if (weak.length > 0) {
    const focus = weak.slice(0, 2).join(" and ");
    return `Focus next on ${focus} — drill those topics before another full mock.`;
  }

  const subjects = Object.entries(input.subject_breakdown ?? {});
  if (subjects.length > 0) {
    let weakest: { name: string; accuracy: number } | null = null;
    for (const [name, slice] of subjects) {
      const attempted = Number(slice.attempted ?? 0);
      const total = Number(slice.total ?? 0);
      if (attempted <= 0 && total <= 0) continue;
      const accuracy =
        typeof slice.accuracy === "number" && Number.isFinite(slice.accuracy)
          ? slice.accuracy
          : attempted > 0
            ? (Number(slice.correct ?? 0) / attempted) * 100
            : 0;
      if (!weakest || accuracy < weakest.accuracy) {
        weakest = { name, accuracy };
      }
    }
    if (weakest) {
      return `Strengthen ${weakest.name} next (${Math.round(weakest.accuracy)}% accuracy) before repeating a full paper.`;
    }
  }

  const topics = Object.entries(input.topic_breakdown ?? {});
  if (topics.length > 0) {
    let weakest: { name: string; accuracy: number } | null = null;
    for (const [name, slice] of topics) {
      const attempted = Number(slice.attempted ?? 0);
      if (attempted <= 0) continue;
      const accuracy =
        typeof slice.accuracy === "number" && Number.isFinite(slice.accuracy)
          ? slice.accuracy
          : (Number(slice.correct ?? 0) / attempted) * 100;
      if (!weakest || accuracy < weakest.accuracy) {
        weakest = { name, accuracy };
      }
    }
    if (weakest) {
      return `Practice more ${weakest.name} questions next — lowest topic accuracy at ${Math.round(weakest.accuracy)}%.`;
    }
  }

  const strong = (input.strong_topics ?? []).filter((t) => typeof t === "string" && t.trim());
  if (strong.length > 0) {
    return `Keep ${strong[0]} sharp, then add a timed sectional drill on your weaker areas.`;
  }

  return null;
}
