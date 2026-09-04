/**
 * Neutral interviewer voice catalogue (Phase 2).
 * Provider voice IDs stay server-side; UI uses catalogue ids + labels.
 * Browser speechSynthesis is a basic fallback only — never claim licensed server voices.
 */

export type InterviewerVoiceCategory =
  | "classic_professional"
  | "calm_mentor"
  | "clear_interviewer"
  | "warm_recruiter"
  | "technical_panelist"
  | "executive_formal";

export type InterviewerVoice = {
  id: InterviewerVoiceCategory;
  label: string;
  description: string;
  language: string;
  /**
   * Hint for browser speechSynthesis matching (name/lang fragments).
   * Distinct per catalogue entry so preview mapping is deterministic when possible.
   */
  browserVoiceHint: string;
  /** Preferred speech rate for browser fallback (1 = default). */
  browserRate: number;
  /** Preferred pitch for browser fallback (1 = default). */
  browserPitch: number;
  /** Short sample spoken on Preview. */
  previewText: string;
  /** On-screen caption / text-only fallback when TTS is unavailable. */
  textFallback: string;
};

export type ServerVoiceAvailability =
  | "server_available"
  | "server_unavailable"
  | "browser_fallback_only";

export const INTERVIEWER_VOICE_CATALOGUE: InterviewerVoice[] = [
  {
    id: "classic_professional",
    label: "Classic Professional",
    description: "Neutral, steady interview tone.",
    language: "en",
    browserVoiceHint: "en-US|en_US|David|Mark|Alex|Google US English|Microsoft David",
    browserRate: 1,
    browserPitch: 1,
    previewText: "Tell me about a recent project you are proud of.",
    textFallback: "Tell me about a recent project you are proud of.",
  },
  {
    id: "calm_mentor",
    label: "Calm Mentor",
    description: "Supportive pace for coaching-style practice.",
    language: "en",
    browserVoiceHint: "en-GB|en_GB|Samantha|Karen|Serena|Google UK English Female|Microsoft Zira",
    browserRate: 0.92,
    browserPitch: 1.05,
    previewText: "Walk me through how you approached that challenge.",
    textFallback: "Walk me through how you approached that challenge.",
  },
  {
    id: "clear_interviewer",
    label: "Clear Interviewer",
    description: "Crisp, panel-style delivery.",
    language: "en",
    browserVoiceHint: "en-US|en_US|Google US English|Microsoft Mark|Daniel|Aaron",
    browserRate: 1.05,
    browserPitch: 0.95,
    previewText: "What trade-offs did you consider in that design?",
    textFallback: "What trade-offs did you consider in that design?",
  },
  {
    id: "warm_recruiter",
    label: "Warm Recruiter",
    description: "Friendly HR-style delivery.",
    language: "en",
    browserVoiceHint: "en-US|en_US|Samantha|Jenny|Google US English Female|Microsoft Aria",
    browserRate: 0.98,
    browserPitch: 1.1,
    previewText: "Why are you interested in this role?",
    textFallback: "Why are you interested in this role?",
  },
  {
    id: "technical_panelist",
    label: "Technical Panelist",
    description: "Direct technical screening tone.",
    language: "en",
    browserVoiceHint: "en-US|en_US|Alex|Fred|Google US English Male|Microsoft Guy",
    browserRate: 1.02,
    browserPitch: 0.9,
    previewText: "How would you debug a production latency spike?",
    textFallback: "How would you debug a production latency spike.",
  },
  {
    id: "executive_formal",
    label: "Executive Formal",
    description: "Measured leadership interview tone.",
    language: "en",
    browserVoiceHint: "en-GB|en_GB|Daniel|Oliver|Google UK English Male|Microsoft George",
    browserRate: 0.95,
    browserPitch: 0.92,
    previewText: "How do you prioritize when everything feels urgent?",
    textFallback: "How do you prioritize when everything feels urgent?",
  },
];

export function getInterviewerVoice(id: string | null | undefined): InterviewerVoice {
  return (
    INTERVIEWER_VOICE_CATALOGUE.find((v) => v.id === id) ??
    INTERVIEWER_VOICE_CATALOGUE[0]
  );
}

export function getInterviewerVoiceTextFallback(id: string | null | undefined): string {
  const voice = getInterviewerVoice(id);
  return (voice.textFallback || voice.previewText).trim();
}

function scoreBrowserVoiceMatch(
  voice: SpeechSynthesisVoice,
  catalog: InterviewerVoice,
): number {
  const hay = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  const lang = catalog.language.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase().startsWith(lang)) score += 10;
  const hints = catalog.browserVoiceHint
    .toLowerCase()
    .split("|")
    .map((h) => h.trim())
    .filter(Boolean);
  for (const hint of hints) {
    if (hay.includes(hint.toLowerCase()) || voice.lang.toLowerCase().includes(hint.toLowerCase())) {
      score += 5;
    }
  }
  if (/female|zira|samantha|karen|jenny|aria|serena/i.test(hay) && /mentor|recruiter|warm|calm/i.test(catalog.id)) {
    score += 2;
  }
  if (/male|david|mark|daniel|george|guy|fred|alex/i.test(hay) && /panelist|executive|classic|clear/i.test(catalog.id)) {
    score += 2;
  }
  return score;
}

/**
 * Map catalogue id → browser speechSynthesis voice name when available.
 * Returns null when speechSynthesis is missing (caller should use text fallback).
 */
export function resolveBrowserVoiceForCatalogue(
  voiceId: string | null | undefined,
): string | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const catalog = getInterviewerVoice(voiceId);
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const v of voices) {
      const score = scoreBrowserVoiceMatch(v, catalog);
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (best && bestScore > 0) return best.name;
    return voices.find((v) => v.lang.toLowerCase().startsWith(catalog.language))?.name ?? null;
  } catch {
    return null;
  }
}

/** Honest availability label for UI — never claims server voices without a real path. */
export function describeVoiceDeliveryMode(
  serverAvailable: boolean,
): ServerVoiceAvailability {
  if (serverAvailable) return "server_available";
  if (typeof window !== "undefined" && window.speechSynthesis) {
    return "browser_fallback_only";
  }
  return "server_unavailable";
}
