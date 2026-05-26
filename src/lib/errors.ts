// ─────────────────────────────────────────────────────────────────────────────
// errors.ts — Centralized error taxonomy for Clarify Assistant
// All custom error classes, error codes, guards, and formatters live here.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Error Codes ─────────────────────────────────────────────────────────────

export enum ErrorCode {
  // Auth
  AUTH_NOT_AUTHENTICATED       = "AUTH_001",
  AUTH_SESSION_EXPIRED         = "AUTH_002",
  AUTH_INVALID_CREDENTIALS     = "AUTH_003",
  AUTH_EMAIL_NOT_VERIFIED      = "AUTH_004",
  AUTH_OAUTH_FAILED            = "AUTH_005",
  AUTH_SIGNUP_FAILED           = "AUTH_006",
  AUTH_PASSWORD_RESET_FAILED   = "AUTH_007",
  AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_008",

  // AI / Model
  AI_REQUEST_FAILED            = "AI_001",
  AI_RATE_LIMITED              = "AI_002",
  AI_CONTEXT_TOO_LONG          = "AI_003",
  AI_MODEL_UNAVAILABLE         = "AI_004",
  AI_INVALID_RESPONSE          = "AI_005",
  AI_STREAM_INTERRUPTED        = "AI_006",
  AI_API_KEY_INVALID           = "AI_007",
  AI_QUOTA_EXCEEDED            = "AI_008",

  // Audio
  AUDIO_PERMISSION_DENIED      = "AUDIO_001",
  AUDIO_DEVICE_NOT_FOUND       = "AUDIO_002",
  AUDIO_STREAM_FAILED          = "AUDIO_003",
  AUDIO_CAPTURE_FAILED         = "AUDIO_004",
  AUDIO_FORMAT_UNSUPPORTED     = "AUDIO_005",
  AUDIO_SYSTEM_CAPTURE_DENIED  = "AUDIO_006",

  // Deepgram / Transcription
  DEEPGRAM_CONNECTION_FAILED   = "DG_001",
  DEEPGRAM_STREAM_ERROR        = "DG_002",
  DEEPGRAM_AUTH_FAILED         = "DG_003",
  DEEPGRAM_QUOTA_EXCEEDED      = "DG_004",

  // Billing / Credits
  BILLING_INSUFFICIENT_CREDITS = "BILLING_001",
  BILLING_PAYMENT_FAILED       = "BILLING_002",
  BILLING_SUBSCRIPTION_EXPIRED = "BILLING_003",
  BILLING_PLAN_GATE_BLOCKED    = "BILLING_004",
  BILLING_STRIPE_ERROR         = "BILLING_005",

  // Network
  NETWORK_OFFLINE              = "NET_001",
  NETWORK_TIMEOUT              = "NET_002",
  NETWORK_REQUEST_FAILED       = "NET_003",
  NETWORK_WEBSOCKET_CLOSED     = "NET_004",
  NETWORK_RATE_LIMITED         = "NET_005",

  // Database / Supabase
  DB_QUERY_FAILED              = "DB_001",
  DB_RECORD_NOT_FOUND          = "DB_002",
  DB_DUPLICATE_ENTRY           = "DB_003",
  DB_PERMISSION_DENIED         = "DB_004",
  DB_CONNECTION_FAILED         = "DB_005",
  DB_REALTIME_FAILED           = "DB_006",

  // Storage
  STORAGE_UPLOAD_FAILED        = "STORAGE_001",
  STORAGE_DOWNLOAD_FAILED      = "STORAGE_002",
  STORAGE_FILE_TOO_LARGE       = "STORAGE_003",
  STORAGE_INVALID_FILE_TYPE    = "STORAGE_004",
  STORAGE_BUCKET_NOT_FOUND     = "STORAGE_005",

  // Session
  SESSION_NOT_FOUND            = "SESSION_001",
  SESSION_ALREADY_ACTIVE       = "SESSION_002",
  SESSION_CREATION_FAILED      = "SESSION_003",
  SESSION_TERMINATED           = "SESSION_004",

  // Overlay / Stealth
  OVERLAY_INIT_FAILED          = "OVERLAY_001",
  OVERLAY_PERMISSION_DENIED    = "OVERLAY_002",
  OVERLAY_SCREEN_CAPTURED      = "OVERLAY_003",

  // Validation
  VALIDATION_REQUIRED_FIELD    = "VALIDATION_001",
  VALIDATION_INVALID_EMAIL     = "VALIDATION_002",
  VALIDATION_INVALID_FORMAT    = "VALIDATION_003",
  VALIDATION_FILE_TOO_LARGE    = "VALIDATION_004",
  VALIDATION_UNSUPPORTED_TYPE  = "VALIDATION_005",

  // Generic
  UNKNOWN                      = "UNKNOWN",
  NOT_IMPLEMENTED              = "NOT_IMPLEMENTED",
  OPERATION_CANCELLED          = "CANCELLED",
  FEATURE_DISABLED             = "FEATURE_DISABLED",
}

// ─── HTTP Status Codes ────────────────────────────────────────────────────────

export enum HttpStatus {
  OK                    = 200,
  CREATED               = 201,
  NO_CONTENT            = 204,
  BAD_REQUEST           = 400,
  UNAUTHORIZED          = 401,
  FORBIDDEN             = 403,
  NOT_FOUND             = 404,
  CONFLICT              = 409,
  UNPROCESSABLE_ENTITY  = 422,
  TOO_MANY_REQUESTS     = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY           = 502,
  SERVICE_UNAVAILABLE   = 503,
}

// ─── Base App Error ───────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

// ─── Domain-Specific Error Classes ───────────────────────────────────────────

export class AuthError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AUTH_NOT_AUTHENTICATED,
    context?: Record<string, unknown>
  ) {
    super(message, code, HttpStatus.UNAUTHORIZED, true, context);
    this.name = "AuthError";
  }
}

export class AIError extends AppError {
  public readonly model?: string;
  public readonly provider?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AI_REQUEST_FAILED,
    context?: Record<string, unknown> & { model?: string; provider?: string }
  ) {
    super(message, code, HttpStatus.BAD_GATEWAY, true, context);
    this.name = "AIError";
    this.model = context?.model;
    this.provider = context?.provider;
  }
}

export class AudioError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AUDIO_STREAM_FAILED,
    context?: Record<string, unknown>
  ) {
    super(message, code, HttpStatus.UNPROCESSABLE_ENTITY, true, context);
    this.name = "AudioError";
  }
}

export class BillingError extends AppError {
  public readonly requiredCredits?: number;
  public readonly availableCredits?: number;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.BILLING_INSUFFICIENT_CREDITS,
    context?: Record<string, unknown> & {
      requiredCredits?: number;
      availableCredits?: number;
    }
  ) {
    super(message, code, HttpStatus.FORBIDDEN, true, context);
    this.name = "BillingError";
    this.requiredCredits = context?.requiredCredits;
    this.availableCredits = context?.availableCredits;
  }
}

export class NetworkError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_REQUEST_FAILED,
    context?: Record<string, unknown>
  ) {
    super(message, code, HttpStatus.SERVICE_UNAVAILABLE, true, context);
    this.name = "NetworkError";
  }
}

export class DatabaseError extends AppError {
  public readonly table?: string;
  public readonly operation?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DB_QUERY_FAILED,
    context?: Record<string, unknown> & {
      table?: string;
      operation?: string;
    }
  ) {
    super(message, code, HttpStatus.INTERNAL_SERVER_ERROR, true, context);
    this.name = "DatabaseError";
    this.table = context?.table;
    this.operation = context?.operation;
  }
}

export class StorageError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.STORAGE_UPLOAD_FAILED,
    context?: Record<string, unknown>
  ) {
    super(message, code, HttpStatus.INTERNAL_SERVER_ERROR, true, context);
    this.name = "StorageError";
  }
}

export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_INVALID_FORMAT,
    field?: string
  ) {
    super(message, code, HttpStatus.UNPROCESSABLE_ENTITY, true, { field });
    this.name = "ValidationError";
    this.field = field;
  }
}

export class OverlayError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.OVERLAY_INIT_FAILED,
    context?: Record<string, unknown>
  ) {
    super(message, code, HttpStatus.INTERNAL_SERVER_ERROR, true, context);
    this.name = "OverlayError";
  }
}

export class SessionError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SESSION_NOT_FOUND,
    context?: Record<string, unknown>
  ) {
    super(message, code, HttpStatus.NOT_FOUND, true, context);
    this.name = "SessionError";
  }
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function isAIError(error: unknown): error is AIError {
  return error instanceof AIError;
}

export function isAudioError(error: unknown): error is AudioError {
  return error instanceof AudioError;
}

export function isBillingError(error: unknown): error is BillingError {
  return error instanceof BillingError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

// ─── Error Normalizer ─────────────────────────────────────────────────────────

/**
 * Normalize any unknown thrown value into an AppError.
 * Use this in catch blocks so you always have a typed error to work with.
 *
 * @example
 * try { ... } catch (e) {
 *   const err = normalizeError(e);
 *   toast.error(err.message);
 * }
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    // Supabase / network errors
    if (error.message.includes("JWT")) {
      return new AuthError(error.message, ErrorCode.AUTH_SESSION_EXPIRED);
    }
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      return new NetworkError(error.message, ErrorCode.NETWORK_OFFLINE);
    }
    return new AppError(error.message, ErrorCode.UNKNOWN, 500, true, {
      originalName: error.name,
    });
  }

  if (typeof error === "string") {
    return new AppError(error, ErrorCode.UNKNOWN);
  }

  return new AppError("An unknown error occurred", ErrorCode.UNKNOWN);
}

// ─── User-Friendly Message Mapper ─────────────────────────────────────────────

const USER_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.AUTH_NOT_AUTHENTICATED]:       "Please sign in to continue.",
  [ErrorCode.AUTH_SESSION_EXPIRED]:         "Your session has expired. Please sign in again.",
  [ErrorCode.AUTH_INVALID_CREDENTIALS]:     "Incorrect email or password.",
  [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]:      "Please verify your email before continuing.",
  [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]:"You don't have permission to do that.",
  [ErrorCode.AI_RATE_LIMITED]:              "AI is busy. Please wait a moment and try again.",
  [ErrorCode.AI_QUOTA_EXCEEDED]:            "Your AI usage limit has been reached. Please upgrade.",
  [ErrorCode.AI_MODEL_UNAVAILABLE]:         "The selected AI model is currently unavailable.",
  [ErrorCode.AI_STREAM_INTERRUPTED]:        "AI response was interrupted. Please try again.",
  [ErrorCode.AUDIO_PERMISSION_DENIED]:      "Microphone access was denied. Please allow it in your browser settings.",
  [ErrorCode.AUDIO_DEVICE_NOT_FOUND]:       "No microphone found. Please connect one and try again.",
  [ErrorCode.AUDIO_SYSTEM_CAPTURE_DENIED]:  "System audio capture requires screen share permission.",
  [ErrorCode.DEEPGRAM_CONNECTION_FAILED]:   "Could not connect to transcription service.",
  [ErrorCode.BILLING_INSUFFICIENT_CREDITS]: "You don't have enough credits for this action.",
  [ErrorCode.BILLING_SUBSCRIPTION_EXPIRED]: "Your subscription has expired. Please renew to continue.",
  [ErrorCode.BILLING_PLAN_GATE_BLOCKED]:    "This feature requires a higher plan. Please upgrade.",
  [ErrorCode.NETWORK_OFFLINE]:              "You appear to be offline. Please check your connection.",
  [ErrorCode.NETWORK_TIMEOUT]:              "Request timed out. Please try again.",
  [ErrorCode.DB_RECORD_NOT_FOUND]:          "The requested item could not be found.",
  [ErrorCode.DB_PERMISSION_DENIED]:         "You don't have access to this data.",
  [ErrorCode.STORAGE_FILE_TOO_LARGE]:       "File is too large. Maximum size is 10MB.",
  [ErrorCode.STORAGE_INVALID_FILE_TYPE]:    "File type not supported.",
  [ErrorCode.OVERLAY_SCREEN_CAPTURED]:      "Screen capture detected. The overlay remains visible — use discrete mode if you prefer a subtler appearance.",
  [ErrorCode.SESSION_NOT_FOUND]:            "Session not found or has ended.",
  [ErrorCode.VALIDATION_REQUIRED_FIELD]:    "Please fill in all required fields.",
  [ErrorCode.VALIDATION_INVALID_EMAIL]:     "Please enter a valid email address.",
  [ErrorCode.UNKNOWN]:                      "Something went wrong. Please try again.",
};

/**
 * Get a user-friendly error message from any error.
 *
 * @example
 * toast.error(getUserMessage(error));
 */
export function getUserMessage(error: unknown): string {
  const appError = normalizeError(error);
  return USER_MESSAGES[appError.code] ?? appError.message ?? "Something went wrong.";
}

// ─── Async Error Wrapper ──────────────────────────────────────────────────────

/**
 * Wrap any async function and return [data, error] tuple — no try/catch needed.
 *
 * @example
 * const [session, err] = await tryCatch(() => createSession(userId));
 * if (err) toast.error(getUserMessage(err));
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<[T, null] | [null, AppError]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (error) {
    return [null, normalizeError(error)];
  }
}

/**
 * Sync version of tryCatch.
 */
export function tryCatchSync<T>(
  fn: () => T
): [T, null] | [null, AppError] {
  try {
    const data = fn();
    return [data, null];
  } catch (error) {
    return [null, normalizeError(error)];
  }
}
