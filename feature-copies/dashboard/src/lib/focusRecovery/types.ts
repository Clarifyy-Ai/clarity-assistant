export type RecoveryTrigger = "visibility" | "focus" | "pageshow";

export type RecoveryResource =
  | "authSession"
  | "profile"
  | "role"
  | "credits"
  | "dashboardStats"
  | "dashboardActivity"
  | "sessionsList"
  | "documents"
  | "interviews"
  | "notifications"
  | "gamification"
  | "analytics";

export interface RecoveryPlan {
  generation: number;
  shouldRecover: boolean;
  reason: "not_needed" | "duplicate" | "hidden" | "stale" | "bfcache" | "session" | "forced";
  trigger: RecoveryTrigger;
  hiddenDurationMs: number;
  refreshSession: boolean;
  revalidate: RecoveryResource[];
}

export interface RecoverySnapshot {
  generation: number;
  recoveryCount: number;
  inFlight: boolean;
  lastRecoveryAt: number | null;
  lastHiddenAt: number | null;
  lastVisibleAt: number | null;
  lastTrigger: RecoveryTrigger | null;
}

export interface RecoveryAuthContext {
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  hasValidProfile: boolean;
  profileAgeMs: number | null;
  roleResolved: boolean;
  sessionExpiresAtMs: number | null;
}

export interface RecoveryDecisionInput {
  now: number;
  isVisible: boolean;
  trigger: RecoveryTrigger;
  persistedPageshow: boolean;
  hiddenDurationMs: number;
  msSinceLastRecovery: number | null;
  inFlight: boolean;
  auth: RecoveryAuthContext;
  config: FocusRecoveryConfig;
}

export interface FocusRecoveryConfig {
  coalesceMs: number;
  minHiddenMs: number;
  minIntervalMs: number;
  profileStaleMs: number;
  dashboardStaleMs: number;
  creditsStaleMs: number;
  sessionRefreshSkewMs: number;
}

export const DEFAULT_FOCUS_RECOVERY_CONFIG: FocusRecoveryConfig = {
  coalesceMs: 400,
  /** Ignore flicker from rapid tab switches. */
  minHiddenMs: 15_000,
  /** Multiple focus/visibility/pageshow bursts collapse into one cycle. */
  minIntervalMs: 2_000,
  profileStaleMs: 120_000,
  dashboardStaleMs: 60_000,
  creditsStaleMs: 120_000,
  sessionRefreshSkewMs: 60_000,
};

export type RecoveryListener = (
  plan: RecoveryPlan,
  signal: AbortSignal,
) => void | Promise<void>;
