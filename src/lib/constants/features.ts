// ─────────────────────────────────────────────────────────────────────────────
// features.ts — Feature flags, plan-gated feature definitions, AI model
// catalogue, and interview type configuration.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanId } from "@/lib/billing";

// ─── Feature Flag Keys ────────────────────────────────────────────────────────

export const FEATURE_FLAGS = {
  // Core features
  LIVE_ASSIST:         "live_assist",
  MOCK_SESSIONS:       "mock_sessions",
  ANSWER_BANK:         "answer_bank",
  STAR_BUILDER:        "star_builder",
  COMPANY_RESEARCH:    "company_research",
  REPHRASER:           "rephraser",
  CODING_HINTS:        "coding_hints",
  SYSTEM_DESIGN:       "system_design",
  SESSION_DEBRIEF:     "session_debrief",
  AI_COACH:            "ai_coach",
  RESUME_ANALYSIS:     "resume_analysis",

  // Overlay
  OVERLAY:             "overlay",
  SCREENSHOT_CAPTURE:  "screenshot_capture",

  // Audio
  AUDIO_ANALYSIS:      "audio_analysis",
  FILLER_DETECTION:    "filler_detection",
  WPM_TRACKING:        "wpm_tracking",
  DIARIZATION:         "diarization",

  // Platform
  BYOK:                "byok",           // Bring Your Own API Key
  ANALYTICS:           "analytics",
  CALENDAR_SYNC:       "calendar_sync",
  PRIORITY_SUPPORT:    "priority_support",
  COACH_SESSIONS:      "coach_sessions",

  // Dev / experimental
  EXPERIMENTAL_UI:     "experimental_ui",
  DEBUG_PANEL:         "debug_panel",
  BETA_MODELS:         "beta_models",
  MOCK_TEST_AI:        "mock_test_ai",
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

// ─── Plan Gate Map ────────────────────────────────────────────────────────────
// Which plan does each feature first become available on?

export const FEATURE_PLAN_GATE: Record<FeatureFlag, PlanId> = {
  [FEATURE_FLAGS.LIVE_ASSIST]:        "free",
  [FEATURE_FLAGS.MOCK_SESSIONS]:      "free",
  [FEATURE_FLAGS.ANSWER_BANK]:        "free",
  [FEATURE_FLAGS.STAR_BUILDER]:       "free",
  [FEATURE_FLAGS.REPHRASER]:          "free",
  [FEATURE_FLAGS.AI_COACH]:           "free",
  [FEATURE_FLAGS.COMPANY_RESEARCH]:   "starter",
  [FEATURE_FLAGS.CODING_HINTS]:       "starter",
  [FEATURE_FLAGS.SYSTEM_DESIGN]:      "starter",
  [FEATURE_FLAGS.SESSION_DEBRIEF]:    "starter",
  [FEATURE_FLAGS.RESUME_ANALYSIS]:    "starter",
  [FEATURE_FLAGS.OVERLAY]:            "starter",
  [FEATURE_FLAGS.AUDIO_ANALYSIS]:     "starter",
  [FEATURE_FLAGS.FILLER_DETECTION]:   "starter",
  [FEATURE_FLAGS.WPM_TRACKING]:       "starter",
  [FEATURE_FLAGS.ANALYTICS]:          "starter",
  [FEATURE_FLAGS.SCREENSHOT_CAPTURE]: "pro",
  [FEATURE_FLAGS.DIARIZATION]:        "pro",
  [FEATURE_FLAGS.BYOK]:               "pro",
  [FEATURE_FLAGS.CALENDAR_SYNC]:      "pro",
  [FEATURE_FLAGS.PRIORITY_SUPPORT]:   "elite",
  [FEATURE_FLAGS.COACH_SESSIONS]:     "elite",
  [FEATURE_FLAGS.EXPERIMENTAL_UI]:    "pro",
  [FEATURE_FLAGS.DEBUG_PANEL]:        "enterprise",
  [FEATURE_FLAGS.BETA_MODELS]:        "pro",
  [FEATURE_FLAGS.MOCK_TEST_AI]:       "pro",
} as const;

/** Alias used in some admin pages */
export const FEATURE_PLAN_GATES = FEATURE_PLAN_GATE;

// ─── AI Model Catalogue ───────────────────────────────────────────────────────

export type AIProvider = "openai" | "anthropic" | "gemini";

export interface AIModel {
  id:          string;
  name:        string;
  provider:    AIProvider;
  contextWindow: number;    // tokens
  outputLimit: number;      // max output tokens
  speed:       "fast" | "balanced" | "thorough";
  cost:        "low" | "medium" | "high";
  supportsStreaming: boolean;
  supportsVision:   boolean;
  minPlan:     PlanId;
  isDefault?:  boolean;
  isBeta?:     boolean;
  description: string;
}

export const AI_MODELS: Record<string, AIModel> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  "gpt-4o": {
    id:             "gpt-4o",
    name:           "GPT-4o",
    provider:       "openai",
    contextWindow:  128000,
    outputLimit:    4096,
    speed:          "balanced",
    cost:           "medium",
    supportsStreaming: true,
    supportsVision:   true,
    minPlan:        "free",
    isDefault:      true,
    description:    "OpenAI's flagship multimodal model. Best for complex reasoning.",
  },
  "gpt-4o-mini": {
    id:             "gpt-4o-mini",
    name:           "GPT-4o Mini",
    provider:       "openai",
    contextWindow:  128000,
    outputLimit:    4096,
    speed:          "fast",
    cost:           "low",
    supportsStreaming: true,
    supportsVision:   false,
    minPlan:        "free",
    description:    "Fast and cost-efficient. Good for hints and quick answers.",
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  "claude-3-5-sonnet": {
    id:             "claude-3-5-sonnet-20241022",
    name:           "Claude 3.5 Sonnet",
    provider:       "anthropic",
    contextWindow:  200000,
    outputLimit:    8192,
    speed:          "balanced",
    cost:           "medium",
    supportsStreaming: true,
    supportsVision:   true,
    minPlan:        "free",
    description:    "Best balance of quality and speed. Excellent for STAR answers.",
  },
  "claude-3-5-haiku": {
    id:             "claude-3-5-haiku-20241022",
    name:           "Claude 3.5 Haiku",
    provider:       "anthropic",
    contextWindow:  200000,
    outputLimit:    4096,
    speed:          "fast",
    cost:           "low",
    supportsStreaming: true,
    supportsVision:   false,
    minPlan:        "free",
    description:    "Ultrafast responses. Ideal for live hints and real-time assist.",
  },
  "claude-3-opus": {
    id:             "claude-3-opus-20240229",
    name:           "Claude 3 Opus",
    provider:       "anthropic",
    contextWindow:  200000,
    outputLimit:    4096,
    speed:          "thorough",
    cost:           "high",
    supportsStreaming: true,
    supportsVision:   false,
    minPlan:        "pro",
    description:    "Most powerful Anthropic model. Deep, nuanced answers.",
  },

  // ── Google Gemini ────────────────────────────────────────────────────────────
  "gemini-2.0-flash": {
    id:             "gemini-2.0-flash",
    name:           "Gemini 2.0 Flash",
    provider:       "gemini",
    contextWindow:  1000000,
    outputLimit:    8192,
    speed:          "fast",
    cost:           "low",
    supportsStreaming: true,
    supportsVision:   true,
    minPlan:        "free",
    description:    "Google's fastest model. Great for real-time interview assist.",
  },
  "gemini-1.5-pro": {
    id:             "gemini-1.5-pro",
    name:           "Gemini 1.5 Pro",
    provider:       "gemini",
    contextWindow:  2000000,
    outputLimit:    8192,
    speed:          "balanced",
    cost:           "medium",
    supportsStreaming: true,
    supportsVision:   true,
    minPlan:        "starter",
    description:    "Massive context window. Ideal for long JDs and full resume analysis.",
  },
} as const;

export const DEFAULT_MODEL_ID = "gpt-4o";

export function getDefaultModel(): AIModel {
  return AI_MODELS[DEFAULT_MODEL_ID];
}

export function getModelsByPlan(planId: PlanId): AIModel[] {
  const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "elite", "enterprise"];
  const planIndex = PLAN_ORDER.indexOf(planId);
  return Object.values(AI_MODELS).filter(
    (m) => PLAN_ORDER.indexOf(m.minPlan) <= planIndex
  );
}

export function getModelsByProvider(provider: AIProvider): AIModel[] {
  return Object.values(AI_MODELS).filter((m) => m.provider === provider);
}

// ─── Interview Types ──────────────────────────────────────────────────────────

export interface InterviewTypeConfig {
  id:          string;
  label:       string;
  description: string;
  icon:        string;
  prompts:     string[];    // example question starters
  tips:        string[];
}

export const INTERVIEW_TYPES: Record<string, InterviewTypeConfig> = {
  behavioral: {
    id:          "behavioral",
    label:       "Behavioral",
    description: "Questions about past experience using the STAR method.",
    icon:        "Users",
    prompts:     ["Tell me about a time when…", "Give me an example of…", "Describe a situation where…"],
    tips:        ["Use the STAR framework", "Quantify results", "Keep to 2 minutes"],
  },
  technical: {
    id:          "technical",
    label:       "Technical",
    description: "Deep-dive technical questions on your stack and engineering concepts.",
    icon:        "Code2",
    prompts:     ["Explain how…", "What is the difference between…", "How would you implement…"],
    tips:        ["Think out loud", "Discuss trade-offs", "Be precise with complexity"],
  },
  "system-design": {
    id:          "system-design",
    label:       "System Design",
    description: "Architect scalable systems under time pressure.",
    icon:        "Network",
    prompts:     ["Design a…", "How would you build…", "Walk me through the architecture of…"],
    tips:        ["Clarify requirements first", "Estimate scale", "Discuss bottlenecks"],
  },
  coding: {
    id:          "coding",
    label:       "Coding",
    description: "Live coding challenges and algorithm problems.",
    icon:        "Terminal",
    prompts:     ["Write a function that…", "Given an array…", "Implement…"],
    tips:        ["Talk through your approach", "Start with brute force", "Optimise after correctness"],
  },
  hr: {
    id:          "hr",
    label:       "HR / Culture",
    description: "Salary negotiation, culture fit, and motivational questions.",
    icon:        "Heart",
    prompts:     ["Why do you want to work here?", "Where do you see yourself in 5 years?", "What's your greatest weakness?"],
    tips:        ["Be authentic", "Research the company", "Have questions ready"],
  },
  mixed: {
    id:          "mixed",
    label:       "Mixed",
    description: "A combination of all interview types.",
    icon:        "Shuffle",
    prompts:     ["Anything goes"],
    tips:        ["Stay adaptable", "Listen carefully to question type"],
  },
} as const;

// ─── WPM Thresholds ───────────────────────────────────────────────────────────

export const WPM_THRESHOLDS = {
  TOO_SLOW:    110,
  IDEAL_MIN:   111,
  IDEAL_MAX:   160,
  TOO_FAST:    161,
  VERY_FAST:   200,
} as const;

// ─── Filler Words Threshold ────────────────────────────────────────────────────

export const FILLER_THRESHOLDS = {
  LOW_PER_MIN:    3,
  MEDIUM_PER_MIN: 8,
} as const;

// ─── Session Limits ───────────────────────────────────────────────────────────

export const SESSION_LIMITS = {
  MAX_DURATION_HOURS:    3,
  IDLE_TIMEOUT_MINUTES:  30,
  MAX_QUESTIONS:         100,
  MAX_TRANSCRIPT_CHARS:  100000,
  AUTOSAVE_INTERVAL_MS:  30000,
} as const;

// ─── Pagination Defaults ──────────────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_PAGE_SIZE:   20,
  MAX_PAGE_SIZE:       100,
  SESSIONS_PAGE_SIZE:  10,
  ANSWERS_PAGE_SIZE:   20,
} as const;
