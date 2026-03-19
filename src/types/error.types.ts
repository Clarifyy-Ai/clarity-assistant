// ─────────────────────────────────────────────────────────────────────────────
// error.types.ts — Structured error types, error codes, severity levels,
// and error boundary state contracts for the entire application.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  // Auth
  AUTH_NOT_AUTHENTICATED:   "AUTH_001",
  AUTH_INVALID_CREDENTIALS: "AUTH_002",
  AUTH_SESSION_EXPIRED:     "AUTH_003",
  AUTH_EMAIL_NOT_VERIFIED:  "AUTH_004",
  AUTH_ACCOUNT_DISABLED:    "AUTH_005",
  AUTH_PERMISSION_DENIED:   "AUTH_006",

  // Billing
  BILLING_INSUFFICIENT_CREDITS: "BILL_001",
  BILLING_PLAN_GATE:            "BILL_002",
  BILLING_CHECKOUT_FAILED:      "BILL_003",
  BILLING_STRIPE_ERROR:         "BILL_004",
  BILLING_SUBSCRIPTION_INVALID: "BILL_005",

  // Audio
  AUDIO_MIC_DENIED:         "AUD_001",
  AUDIO_MIC_NOT_FOUND:      "AUD_002",
  AUDIO_STREAM_FAILED:      "AUD_003",
  AUDIO_STREAM_ENDED:       "AUD_004",
  AUDIO_NOT_SECURE_CONTEXT: "AUD_005",
  AUDIO_BROWSER_UNSUPPORTED:"AUD_006",
  AUDIO_DEEPGRAM_FAILED:    "AUD_007",
  AUDIO_CHUNK_INVALID:      "AUD_008",

  // AI / Generation
  AI_GENERATION_FAILED:     "AI_001",
  AI_RATE_LIMITED:          "AI_002",
  AI_MODEL_UNAVAILABLE:     "AI_003",
  AI_CONTEXT_TOO_LONG:      "AI_004",
  AI_BYOK_INVALID:          "AI_005",
  AI_STREAM_INTERRUPTED:    "AI_006",
  AI_CREDITS_EXHAUSTED:     "AI_007",

  // Session
  SESSION_NOT_FOUND:        "SESS_001",
  SESSION_ALREADY_ACTIVE:   "SESS_002",
  SESSION_SAVE_FAILED:      "SESS_003",
  SESSION_SYNC_FAILED:      "SESS_004",

  // Network
  NETWORK_OFFLINE:          "NET_001",
  NETWORK_TIMEOUT:          "NET_002",
  NETWORK_SERVER_ERROR:     "NET_003",
  NETWORK_RATE_LIMITED:     "NET_004",
  NETWORK_WS_CLOSED:        "NET_005",

  // Storage / Files
  STORAGE_UPLOAD_FAILED:    "STOR_001",
  STORAGE_DOWNLOAD_FAILED:  "STOR_002",
  STORAGE_FILE_TOO_LARGE:   "STOR_003",
  STORAGE_INVALID_TYPE:     "STOR_004",

  // Validation
  VALIDATION_FAILED:        "VAL_001",
  VALIDATION_EMAIL_INVALID: "VAL_002",
  VALIDATION_REQUIRED:      "VAL_003",

  // Generic
  UNKNOWN:                  "ERR_000",
  NOT_FOUND:                "ERR_001",
  PERMISSION_DENIED:        "ERR_002",
  FEATURE_UNAVAILABLE:      "ERR_003",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ─── Error Severity ───────────────────────────────────────────────────────────

export type ErrorSeverity =
  | "fatal"     // App cannot continue — show full error screen
  | "critical"  // Feature broken — show error in context
  | "warning"   // Degraded experience — show toast warning
  | "info";     // Informational — show toast info

// ─── Error Category ───────────────────────────────────────────────────────────

export type ErrorCategory =
  | "auth"
  | "billing"
  | "audio"
  | "ai"
  | "session"
  | "network"
  | "storage"
  | "validation"
  | "unknown";

// ─── Structured App Error ─────────────────────────────────────────────────────

export interface AppError {
  code:        ErrorCode;
  message:     string;
  category:    ErrorCategory;
  severity:    ErrorSeverity;
  details?:    unknown;
  cause?:      Error | AppError;
  timestamp:   string;          // ISO
  recoverable: boolean;         // can the user retry?
  action?:     ErrorAction;     // suggested UI action
}

export interface ErrorAction {
  label:   string;
  handler: "retry" | "reload" | "login" | "upgrade" | "settings" | "support" | "dismiss";
}

// ─── HTTP Error ───────────────────────────────────────────────────────────────

export interface HTTPError extends AppError {
  status:   number;
  endpoint: string;
  method:   string;
}

// ─── Validation Error ─────────────────────────────────────────────────────────

export interface ValidationError {
  field:    string;
  message:  string;
  value?:   unknown;
  rule?:    string;
}

export interface FormErrors {
  [field: string]: string | undefined;
}

// ─── Plan Gate Error ──────────────────────────────────────────────────────────

export interface PlanGateError extends AppError {
  feature:      string;
  requiredPlan: string;
  currentPlan:  string;
}

// ─── Credit Error ─────────────────────────────────────────────────────────────

export interface CreditError extends AppError {
  required:  number;
  available: number;
  action:    ErrorAction;
}

// ─── Audio Error ──────────────────────────────────────────────────────────────

export interface AudioError extends AppError {
  device?:       string;
  sampleRate?:   number;
  permissionState?: "denied" | "prompt" | "unavailable";
}

// ─── AI Error ────────────────────────────────────────────────────────────────

export interface AIError extends AppError {
  model?:       string;
  provider?:    string;
  tokensUsed?:  number;
  retryAfter?:  number;    // seconds
}

// ─── Error Boundary State ─────────────────────────────────────────────────────

export interface ErrorBoundaryState {
  hasError:    boolean;
  error:       Error | null;
  errorInfo:   React.ErrorInfo | null;
  errorId?:    string;
}

// ─── Error Event (for logging / analytics) ────────────────────────────────────

export interface ErrorEvent {
  id:         string;
  code:       ErrorCode;
  message:    string;
  category:   ErrorCategory;
  severity:   ErrorSeverity;
  userId?:    string;
  sessionId?: string;
  url?:       string;
  userAgent?: string;
  stack?:     string;
  timestamp:  string;
  resolved:   boolean;
  context?:   Record<string, unknown>;
}

// ─── Result Type (Railway Pattern) ───────────────────────────────────────────

export type Result<T, E = AppError> =
  | { ok: true;  value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

// ─── Async Result ─────────────────────────────────────────────────────────────

export type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;

// ─── Error Factory Helpers ───────────────────────────────────────────────────

export function createAppError(
  code: ErrorCode,
  message: string,
  overrides?: Partial<AppError>
): AppError {
  return {
    code,
    message,
    category:    "unknown",
    severity:    "critical",
    timestamp:   new Date().toISOString(),
    recoverable: true,
    ...overrides,
  };
}

export function fromUnknown(error: unknown): AppError {
  if (error instanceof Error) {
    return createAppError(ERROR_CODES.UNKNOWN, error.message, {
      cause: error,
      severity: "critical",
    });
  }
  return createAppError(ERROR_CODES.UNKNOWN, String(error));
}
