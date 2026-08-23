import type {
  RecoveryDecisionInput,
  RecoveryPlan,
  RecoveryResource,
} from "./types";

function sessionNeedsRefresh(
  expiresAtMs: number | null,
  now: number,
  skewMs: number,
): boolean {
  if (expiresAtMs == null) return false;
  return expiresAtMs <= now + skewMs;
}

export function decideFocusRecovery(input: RecoveryDecisionInput): RecoveryPlan {
  const {
    now,
    isVisible,
    trigger,
    persistedPageshow,
    hiddenDurationMs,
    msSinceLastRecovery,
    inFlight,
    auth,
    config,
  } = input;

  const empty = (
    reason: RecoveryPlan["reason"],
    extras?: Partial<RecoveryPlan>,
  ): RecoveryPlan => ({
    generation: 0,
    shouldRecover: false,
    reason,
    trigger,
    hiddenDurationMs,
    refreshSession: false,
    revalidate: [],
    ...extras,
  });

  if (!isVisible) {
    return empty("hidden");
  }

  if (inFlight) {
    return empty("duplicate");
  }

  if (
    msSinceLastRecovery != null &&
    msSinceLastRecovery < config.minIntervalMs &&
    !persistedPageshow
  ) {
    return empty("duplicate");
  }

  if (auth.status === "unauthenticated" || auth.status === "idle") {
    return empty("not_needed");
  }

  const refreshSession = sessionNeedsRefresh(
    auth.sessionExpiresAtMs,
    now,
    config.sessionRefreshSkewMs,
  );

  const profileStale =
    !auth.hasValidProfile ||
    auth.profileAgeMs == null ||
    auth.profileAgeMs >= config.profileStaleMs;

  const dashboardStale = hiddenDurationMs >= config.dashboardStaleMs;
  const longHidden = hiddenDurationMs >= config.minHiddenMs;

  if (
    !persistedPageshow &&
    !refreshSession &&
    !profileStale &&
    !longHidden
  ) {
    return empty("not_needed");
  }

  const revalidate: RecoveryResource[] = ["authSession"];

  if (profileStale || persistedPageshow) {
    revalidate.push("profile");
    if (!auth.roleResolved) revalidate.push("role");
    revalidate.push("credits");
  } else if (hiddenDurationMs >= config.creditsStaleMs) {
    revalidate.push("credits");
  }

  if (dashboardStale || persistedPageshow || longHidden) {
    revalidate.push("dashboardStats", "dashboardActivity");
  }

  if (hiddenDurationMs >= Math.max(config.dashboardStaleMs * 5, 300_000)) {
    revalidate.push("documents", "interviews", "notifications", "sessionsList");
  }

  let reason: RecoveryPlan["reason"] = "stale";
  if (persistedPageshow) reason = "bfcache";
  else if (refreshSession) reason = "session";
  else if (longHidden) reason = "stale";

  return {
    generation: 0,
    shouldRecover: true,
    reason,
    trigger,
    hiddenDurationMs,
    refreshSession,
    revalidate,
  };
}
