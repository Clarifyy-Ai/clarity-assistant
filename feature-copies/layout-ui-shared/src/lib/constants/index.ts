// ─── API Endpoints & Routes ───────────────────────────────────────────────────
export {
  BASE_URLS,
  EDGE_FUNCTIONS,
  AI_ENDPOINTS,
  DEEPGRAM_ENDPOINTS,
  DEEPGRAM_WS_PARAMS,
  STRIPE_ENDPOINTS,
  API_ROUTES,
  ROUTES,
} from "./apiEndpoints";

export type { EdgeFunctionName, AppRoute } from "./apiEndpoints";

// ─── Hotkeys ──────────────────────────────────────────────────────────────────
export {
  DEFAULT_HOTKEYS,
  HOTKEY_CATEGORIES,
  getHotkeysByCategory,
  getHotkeyByAction,
  getHotkeyDisplay,
  isMac,
} from "./hotkeys";

export type { HotkeyDefinition, HotkeyCategory, HotkeyId } from "./hotkeys";

// ─── Colors ───────────────────────────────────────────────────────────────────
export {
  BRAND,
  SEMANTIC,
  NEUTRAL,
  PLAN_COLORS,
  INTERVIEW_TYPE_COLORS,
  SCORE_COLORS,
  PASSWORD_STRENGTH_COLORS,
  NETWORK_QUALITY_COLORS,
  AUDIO_LEVEL_COLORS,
  FILLER_SEVERITY_COLORS,
  WPM_COLORS,
  CHART_COLORS,
  OVERLAY_THEMES,
  getScoreColor,
  getAudioLevelColor,
  getFillerSeverity,
  getWPMColor,
} from "./colors";

export type { ChartColor, OverlayTheme } from "./colors";

// ─── Error Messages ───────────────────────────────────────────────────────────
export {
  AUTH_MESSAGES,
  BILLING_MESSAGES,
  AUDIO_MESSAGES,
  AI_MESSAGES,
  SESSION_MESSAGES,
  NETWORK_MESSAGES,
  STORAGE_MESSAGES,
  SETTINGS_MESSAGES,
  GENERIC_MESSAGES,
  successToast,
  errorToast,
  warnToast,
  infoToast,
} from "./errorMessages";

export type { ToastSeverity, ToastMessage } from "./errorMessages";

// ─── Features ────────────────────────────────────────────────────────────────
export {
  FEATURE_FLAGS,
  FEATURE_PLAN_GATE,
  AI_MODELS,
  DEFAULT_MODEL_ID,
  INTERVIEW_TYPES,
  WPM_THRESHOLDS,
  FILLER_THRESHOLDS,
  SESSION_LIMITS,
  PAGINATION,
  getDefaultModel,
  getModelsByPlan,
  getModelsByProvider,
} from "./features";

export type {
  FeatureFlag,
  AIProvider,
  AIModel,
  InterviewTypeConfig,
} from "./features";
