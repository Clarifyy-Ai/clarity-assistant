/**
 * Central AI feature policy: budgets, retries, and whether a call is allowed.
 * Edge/Python must decide before any provider request.
 */

export type AiDecision =
  | "AI_REQUIRED"
  | "AI_NOT_REQUIRED"
  | "AI_NOT_PERMITTED"
  | "AI_FALLBACK";

export interface AiFeaturePolicy {
  feature: string;
  promptId: string;
  promptVersion: string;
  aiAllowed: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxRetries: number;
  skipSecondaryOnQuota: boolean;
}

const SAFE_DEFAULT_POLICY: AiFeaturePolicy = {
  feature: "default",
  promptId: "default",
  promptVersion: "v1",
  aiAllowed: true,
  maxInputTokens: 4000,
  maxOutputTokens: 1024,
  maxRetries: 1,
  skipSecondaryOnQuota: true,
};

export const AI_FEATURE_POLICIES: Record<string, AiFeaturePolicy> = {
  gov_ai_gap_fill: {
    feature: "gov_ai_gap_fill",
    promptId: "gov_exam_gap_fill",
    promptVersion: "v3",
    aiAllowed: true,
    maxInputTokens: 6000,
    maxOutputTokens: 4096,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  generate_star_answer: {
    feature: "generate_star_answer",
    promptId: "resume_star",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 4000,
    maxOutputTokens: 1200,
    maxRetries: 1,
    skipSecondaryOnQuota: false,
  },
  generate_hint: {
    feature: "generate_hint",
    promptId: "practice_hint",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 3000,
    maxOutputTokens: 500,
    maxRetries: 1,
    skipSecondaryOnQuota: false,
  },
  analyze_test: {
    feature: "analyze_test",
    promptId: "test_analysis",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 2500,
    maxOutputTokens: 900,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  generate_debrief: {
    feature: "generate_debrief",
    promptId: "session_debrief",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 5000,
    maxOutputTokens: 1500,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  generate_questions: {
    feature: "generate_questions",
    promptId: "mock_questions",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 4000,
    maxOutputTokens: 2048,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  generate_scorecard: {
    feature: "generate_scorecard",
    promptId: "session_scorecard",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 5000,
    maxOutputTokens: 1500,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  polish_star_section: {
    feature: "polish_star_section",
    promptId: "star_section_polish",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 2500,
    maxOutputTokens: 500,
    maxRetries: 1,
    skipSecondaryOnQuota: false,
  },
  company_research: {
    feature: "company_research",
    promptId: "company_research",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 3500,
    maxOutputTokens: 1500,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  prep_tool: {
    feature: "prep_tool",
    promptId: "prep_tool",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 4000,
    maxOutputTokens: 1200,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  process_sprint_transcript: {
    feature: "process_sprint_transcript",
    promptId: "sprint_transcript_summary",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 4000,
    maxOutputTokens: 400,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  gap_analysis: {
    feature: "gap_analysis",
    promptId: "resume_gap_analysis",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 5000,
    maxOutputTokens: 1500,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  generate_answer: {
    feature: "generate_answer",
    promptId: "live_answer",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 4000,
    maxOutputTokens: 1024,
    maxRetries: 1,
    skipSecondaryOnQuota: false,
  },
  extract_question_paper: {
    feature: "extract_question_paper",
    promptId: "pdf_question_extract",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 8000,
    maxOutputTokens: 8192,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  parse_question_pdf: {
    feature: "parse_question_pdf",
    promptId: "pdf_question_extract",
    promptVersion: "v2",
    aiAllowed: true,
    maxInputTokens: 8000,
    maxOutputTokens: 8192,
    maxRetries: 1,
    skipSecondaryOnQuota: true,
  },
  ai_coach_chat: {
    feature: "ai_coach_chat",
    promptId: "practice_coach_chat",
    promptVersion: "v1",
    aiAllowed: true,
    maxInputTokens: 4000,
    maxOutputTokens: 800,
    maxRetries: 1,
    skipSecondaryOnQuota: false,
  },
};

/** Named policy, or a conservative default (1024 out tokens, skip OpenAI on Gemini 429). */
export function getAiFeaturePolicy(feature: string): AiFeaturePolicy {
  const named = AI_FEATURE_POLICIES[feature];
  if (named) return named;
  return { ...SAFE_DEFAULT_POLICY, feature };
}

export function decideAi(opts: {
  feature: string;
  needed?: boolean;
  permitted?: boolean;
  providerConfigured?: boolean;
}): AiDecision {
  const policy = AI_FEATURE_POLICIES[opts.feature];
  if (policy && !policy.aiAllowed) return "AI_NOT_PERMITTED";
  if (opts.permitted === false) return "AI_NOT_PERMITTED";
  if (opts.needed === false) return "AI_NOT_REQUIRED";
  if (opts.providerConfigured === false) return "AI_FALLBACK";
  return "AI_REQUIRED";
}

export function mcqOutputTokenBudget(count: number, cap = 4096): number {
  const n = Math.max(1, Math.floor(count));
  return Math.min(cap, 320 * n + 400);
}

/** In-process Gemini circuit after 429 / RESOURCE_EXHAUSTED. */
let geminiOpenUntil = 0;

export function geminiCircuitCanAttempt(): boolean {
  return Date.now() >= geminiOpenUntil;
}

export function tripGeminiCircuit(ms = 60_000): void {
  geminiOpenUntil = Date.now() + ms;
}

export function resetGeminiCircuit(): void {
  geminiOpenUntil = 0;
}
