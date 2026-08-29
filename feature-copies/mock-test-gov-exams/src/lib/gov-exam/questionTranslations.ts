/**
 * Client-side helpers for resolving approved regional translations onto bank questions.
 * Only review_state === "approved" may override English source text.
 */

export const TRANSLATION_LANGUAGES = [
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "or", label: "Odia" },
] as const;

export type TranslationLanguageCode = (typeof TRANSLATION_LANGUAGES)[number]["code"];

export const TRANSLATION_REVIEW_STATES = [
  "draft",
  "needs_review",
  "approved",
  "rejected",
] as const;
export type TranslationReviewState = (typeof TRANSLATION_REVIEW_STATES)[number];

export type QuestionTextFields = {
  question_text: string;
  options?: unknown;
  explanation?: string | null;
};

export type TranslationOverlay = {
  question_text: string;
  options?: unknown;
  explanation?: string | null;
  review_state: string;
  language?: string;
};

/** Normalize mock/config language tags to short codes (en, hi, …). */
export function normalizeQuestionLanguage(raw: unknown): string {
  if (typeof raw !== "string") return "en";
  const v = raw.trim().toLowerCase();
  if (!v || v === "english" || v === "en-us" || v === "en-in" || v === "en_gb") {
    return "en";
  }
  if (v === "hindi" || v === "hi-in" || v.startsWith("hi")) return "hi";
  const dash = v.indexOf("-");
  if (dash > 0) return v.slice(0, dash);
  const under = v.indexOf("_");
  if (under > 0) return v.slice(0, under);
  return v;
}

export function isEnglishLanguage(lang: string): boolean {
  return normalizeQuestionLanguage(lang) === "en";
}

export function canUseTranslation(translation: TranslationOverlay | null | undefined): boolean {
  if (!translation) return false;
  return translation.review_state === "approved" && Boolean(translation.question_text?.trim());
}

/**
 * Prefer an approved translation for the selected language; otherwise keep English source.
 * Never applies draft / needs_review / rejected overlays.
 */
export function selectQuestionDisplayText<T extends QuestionTextFields>(
  base: T,
  translation: TranslationOverlay | null | undefined,
  language: string,
): T & { usedTranslation: boolean; displayLanguage: string } {
  const lang = normalizeQuestionLanguage(language);
  if (isEnglishLanguage(lang) || !canUseTranslation(translation)) {
    return {
      ...base,
      usedTranslation: false,
      displayLanguage: "en",
    };
  }

  const options =
    translation!.options !== undefined && translation!.options !== null
      ? translation!.options
      : base.options;

  const explanation =
    translation!.explanation !== undefined && translation!.explanation !== null
      ? translation!.explanation
      : base.explanation;

  return {
    ...base,
    question_text: translation!.question_text,
    options,
    explanation,
    usedTranslation: true,
    displayLanguage: lang,
  };
}

/** Apply approved translations by question id (map may be sparse). */
export function applyApprovedTranslations<T extends QuestionTextFields & { id: string }>(
  questions: T[],
  byQuestionId: Record<string, TranslationOverlay | undefined>,
  language: string,
): Array<T & { usedTranslation: boolean; displayLanguage: string }> {
  return questions.map((q) =>
    selectQuestionDisplayText(q, byQuestionId[q.id], language),
  );
}
