// ─────────────────────────────────────────────────────────────────────────────
// constants.types.ts — TypeScript types derived from or mirroring the
// values in src/lib/constants/. Keeps component props and store slices
// aligned with the constant definitions without importing the full objects.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Plans ────────────────────────────────────────────────────────────────────

export type PlanId = "free" | "starter" | "pro" | "elite" | "enterprise";

export type BillingInterval = "month" | "year";

export interface PlanDetails {
  id:              PlanId;
  name:            string;
  description:     string;
  monthlyPriceCents: number;
  yearlyPriceCents:  number;
  credits:         number;         // -1 = unlimited
  features:        string[];
  limits:          PlanLimits;
  stripePriceIds:  { monthly: string; yearly: string };
  isPopular?:      boolean;
  isCurrent?:      boolean;
}

export interface PlanLimits {
  sessionsPerMonth:  number;    // -1 = unlimited
  answersPerSession: number;
  mockSessionsPerMonth: number;
  audioMinutesPerMonth: number;
  resumeUploads:     number;
  savedAnswers:      number;
  coachMessages:     number;
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export interface CreditPack {
  id:          string;
  name:        string;
  credits:     number;
  priceCents:  number;
  bonus?:      number;          // bonus credits
  stripePriceId: string;
}

export interface CreditCost {
  feature:     string;
  credits:     number;
  description: string;
}

// ─── AI Models ────────────────────────────────────────────────────────────────

export type AIProvider = "openai" | "anthropic" | "gemini";

export type ModelSpeed = "fast" | "balanced" | "thorough";
export type ModelCost  = "low" | "medium" | "high";

export interface ModelInfo {
  id:               string;
  name:             string;
  provider:         AIProvider;
  contextWindow:    number;
  outputLimit:      number;
  speed:            ModelSpeed;
  cost:             ModelCost;
  supportsStreaming: boolean;
  supportsVision:   boolean;
  minPlan:          PlanId;
  isDefault?:       boolean;
  isBeta?:          boolean;
  description:      string;
}

// ─── Interview Types ──────────────────────────────────────────────────────────

export type InterviewTypeId =
  | "behavioral"
  | "technical"
  | "system-design"
  | "coding"
  | "hr"
  | "mixed";

export type ExperienceLevel =
  | "internship"
  | "entry"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "executive";

// ─── Session Config ───────────────────────────────────────────────────────────

export type SessionMode =
  | "live"        // real-time transcription + AI assist
  | "mock"        // practice with AI interviewer
  | "self"        // self-review with transcript only
  | "prep";       // preparation mode, no live session

export type SessionStatus =
  | "idle"
  | "starting"
  | "active"
  | "paused"
  | "ending"
  | "ended"
  | "error";

// ─── Audio Config ─────────────────────────────────────────────────────────────

export type AudioEncoding =
  | "linear16"
  | "flac"
  | "mulaw"
  | "amr"
  | "amr-wb"
  | "opus"
  | "speex"
  | "mp3";

export type AudioSampleRate = 8000 | 16000 | 22050 | 44100 | 48000;

export interface AudioConfig {
  sampleRate:      AudioSampleRate;
  channels:        1 | 2;
  encoding:        AudioEncoding;
  chunkDurationMs: number;
  enableVAD:       boolean;        // voice activity detection
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export type FeatureFlagId =
  | "live_assist"
  | "mock_sessions"
  | "answer_bank"
  | "star_builder"
  | "company_research"
  | "rephraser"
  | "coding_hints"
  | "system_design"
  | "session_debrief"
  | "ai_coach"
  | "resume_analysis"
  | "overlay"
  | "screenshot_capture"
  | "audio_analysis"
  | "filler_detection"
  | "wpm_tracking"
  | "diarization"
  | "byok"
  | "analytics"
  | "calendar_sync"
  | "priority_support"
  | "coach_sessions"
  | "experimental_ui"
  | "debug_panel"
  | "beta_models";

export type FeatureState = "enabled" | "disabled" | "gated" | "beta";

export interface FeatureFlag {
  id:           FeatureFlagId;
  state:        FeatureState;
  minPlan:      PlanId;
  isAvailable:  boolean;
}

// ─── UI Config ────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";

export type ColorScheme =
  | "indigo"
  | "violet"
  | "blue"
  | "cyan"
  | "emerald"
  | "rose";

export type AppLocale =
  | "en-US"
  | "en-GB"
  | "es"
  | "fr"
  | "de"
  | "ja"
  | "ko"
  | "zh";

export type FontSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface UIPreferences {
  theme:        ThemeMode;
  colorScheme:  ColorScheme;
  fontSize:     FontSize;
  locale:       AppLocale;
  reducedMotion: boolean;
  compactMode:  boolean;
}

// ─── Hotkeys ──────────────────────────────────────────────────────────────────

export type HotkeyCategory =
  | "overlay"
  | "session"
  | "ai"
  | "audio"
  | "navigation"
  | "general";

export type HotkeyModifier = "Ctrl" | "Shift" | "Alt" | "Meta" | "Cmd";

export interface HotkeyBinding {
  key:          string;
  modifiers:    HotkeyModifier[];
  displayLabel: string;
  macLabel?:    string;
  action:       string;
  category:     HotkeyCategory;
  isGlobal:     boolean;
}

export type UserHotkeyMap = Partial<Record<string, string>>;

// ─── Scoring ──────────────────────────────────────────────────────────────────

export type ScoreLabel = "Excellent" | "Good" | "Average" | "Below Average" | "Poor";

export interface ScoreBreakdown {
  overall:     number;     // 1–10
  clarity:     number;
  relevance:   number;
  depth:       number;
  confidence:  number;
  structure:   number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationState {
  page:      number;
  pageSize:  number;
  total:     number;
  totalPages: number;
  hasNext:   boolean;
  hasPrev:   boolean;
}

// ─── Route Params ─────────────────────────────────────────────────────────────

export interface SessionRouteParams {
  sessionId: string;
}

export interface AnswerRouteParams {
  answerId: string;
}

export type SettingsTab =
  | "profile"
  | "billing"
  | "audio"
  | "hotkeys"
  | "ai"
  | "notifications"
  | "privacy";
