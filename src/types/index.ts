// Barrel for all shared types.
//
// NOTE: Several names collide between a "domain" file and constants.types
// (or audio.types vs error.types). Per project decision, domain files win
// and the constants/error variants are re-exported with a suffix so both
// remain reachable without duplicate-export errors.
//
//   AIProvider, CreditPack, ExperienceLevel, SessionMode, SessionStatus
//     → canonical in ai/billing/user/session.types
//     → constants variant available as <Name>Const
//   AudioError
//     → canonical in audio.types
//     → error.types variant available as AudioErrorReport
//
// Consumers needing the original aliased export should import directly
// from the source file (e.g. `import type { AudioError } from
// "@/types/error.types"`).

export * from "./ai.types";
export * from "./analytics.types";
export * from "./audio.types";
export * from "./billing.types";
export * from "./document.types";
export * from "./gamification.types";
export * from "./interview.types";
export * from "./notification.types";
export * from "./room.types";
export * from "./session.types";
export * from "./user.types";
export * from "./api.types";
export * from "./overlay.types";
export * from "./supabase.types";
export * from "./onboarding.types";

// ─── error.types (AudioError aliased) ─────────────────────────────────────────
export type {
  AppError,
  ErrorCode,
  ErrorSeverity,
  ErrorCategory,
  ErrorContext,
  ErrorHandler,
  ErrorReport,
  ValidationError,
  ApiError,
  NetworkError,
  AuthError,
  PermissionError,
  RateLimitError,
  AudioError as AudioErrorReport,
} from "./error.types";

// ─── constants.types (5 names aliased with `Const` suffix) ────────────────────
export type {
  PlanId,
  BillingInterval,
  PlanDetails,
  PlanLimits,
  CreditCost,
  ModelSpeed,
  ModelCost,
  ModelInfo,
  InterviewTypeId,
  AudioEncoding,
  AudioSampleRate,
  AudioConfig,
  FeatureFlagId,
  FeatureState,
  FeatureFlag,
  ThemeMode,
  ColorScheme,
  AppLocale,
  FontSize,
  UIPreferences,
  HotkeyCategory,
  HotkeyModifier,
  HotkeyBinding,
  UserHotkeyMap,
  ScoreLabel,
  ScoreBreakdown,
  PaginationState,
  SessionRouteParams,
  AnswerRouteParams,
  SettingsTab,
  AIProvider as AIProviderConst,
  CreditPack as CreditPackConst,
  ExperienceLevel as ExperienceLevelConst,
  SessionMode as SessionModeConst,
  SessionStatus as SessionStatusConst,
} from "./constants.types";
