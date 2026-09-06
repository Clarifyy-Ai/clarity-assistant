/**
 * Authoritative session completion + shareability.
 * Keep in sync with src/lib/session/sessionShareability.ts.
 */

export type SessionCompletionKind = "complete" | "incomplete" | "abandoned";

export type SessionShareabilityCode =
  | "SHARE_READY"
  | "SESSION_INCOMPLETE"
  | "SESSION_ABANDONED"
  | "SCORECARD_REQUIRED"
  | "SHARE_DISABLED";

export type SessionShareabilityResult = {
  completion: SessionCompletionKind;
  shareable: boolean;
  code: SessionShareabilityCode;
  message: string;
  sessionCompleted: boolean;
};

export const SESSION_SHAREABILITY_MESSAGES: Record<SessionShareabilityCode, string> = {
  SHARE_READY: "A public share link can be created for this session.",
  SESSION_INCOMPLETE:
    "This session is still in progress, so a share link cannot be created yet.",
  SESSION_ABANDONED:
    "This session ended before a scorable answer was recorded. Duration and question activity may still appear, but there is no evaluated report to share.",
  SCORECARD_REQUIRED:
    "Session is complete — generate a scorecard (or debrief) before sharing.",
  SHARE_DISABLED:
    "Scorecard sharing is turned off in Settings → Privacy. Turn on “Allow scorecard sharing” to create a public link.",
};

export type SessionShareabilityInput = {
  status?: string | null;
  lifecycle_status?: string | null;
  terminal_reason?: string | null;
  ended_at?: string | null;
  scorableAnswerCount: number;
  privacyShareAllowed: boolean;
  hasScoredScorecard: boolean;
  hasShareableDebrief?: boolean;
};

function normStatus(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function normLife(value: unknown): string {
  return String(value ?? "").toUpperCase().trim();
}

function normReason(value: unknown): string {
  return String(value ?? "").toUpperCase().trim();
}

export function isAuthoritativeSessionComplete(input: {
  status?: string | null;
  lifecycle_status?: string | null;
  terminal_reason?: string | null;
  ended_at?: string | null;
  scorableAnswerCount: number;
}): boolean {
  if (input.scorableAnswerCount < 1) return false;

  const status = normStatus(input.status);
  const life = normLife(input.lifecycle_status);
  const reason = normReason(input.terminal_reason);
  const ended = Boolean(input.ended_at && String(input.ended_at).trim());

  if (status === "completed") return true;
  if (life === "COMPLETED" || life === "ANALYZED" || life === "PROCESSING") return true;
  if (reason === "USER_ENDED") return true;

  if (ended && input.scorableAnswerCount >= 1) {
    if (
      status === "abandoned" ||
      life === "CANCELLED" ||
      life === "EXPIRED" ||
      life === "FAILED"
    ) {
      return true;
    }
  }

  return false;
}

export function classifySessionCompletion(input: {
  status?: string | null;
  lifecycle_status?: string | null;
  terminal_reason?: string | null;
  ended_at?: string | null;
  scorableAnswerCount: number;
}): SessionCompletionKind {
  if (isAuthoritativeSessionComplete(input)) return "complete";

  const status = normStatus(input.status);
  const life = normLife(input.lifecycle_status);
  const reason = normReason(input.terminal_reason);

  const abandonedSignal =
    status === "abandoned" ||
    life === "EXPIRED" ||
    life === "FAILED" ||
    life === "CANCELLED" ||
    reason === "CANCELLED" ||
    reason === "FAILED" ||
    reason === "SESSION_TIMEOUT";

  if (abandonedSignal && input.scorableAnswerCount <= 0) return "abandoned";
  return "incomplete";
}

export function resolveSessionShareability(
  input: SessionShareabilityInput,
): SessionShareabilityResult {
  const completion = classifySessionCompletion(input);
  const sessionCompleted = completion === "complete";

  if (completion === "incomplete") {
    return {
      completion,
      shareable: false,
      code: "SESSION_INCOMPLETE",
      message: SESSION_SHAREABILITY_MESSAGES.SESSION_INCOMPLETE,
      sessionCompleted,
    };
  }

  if (completion === "abandoned") {
    return {
      completion,
      shareable: false,
      code: "SESSION_ABANDONED",
      message: SESSION_SHAREABILITY_MESSAGES.SESSION_ABANDONED,
      sessionCompleted,
    };
  }

  if (!input.privacyShareAllowed) {
    return {
      completion,
      shareable: false,
      code: "SHARE_DISABLED",
      message: SESSION_SHAREABILITY_MESSAGES.SHARE_DISABLED,
      sessionCompleted,
    };
  }

  const hasArtifact =
    input.hasScoredScorecard || input.hasShareableDebrief === true;
  if (!hasArtifact) {
    return {
      completion,
      shareable: false,
      code: "SCORECARD_REQUIRED",
      message: SESSION_SHAREABILITY_MESSAGES.SCORECARD_REQUIRED,
      sessionCompleted,
    };
  }

  return {
    completion,
    shareable: true,
    code: "SHARE_READY",
    message: SESSION_SHAREABILITY_MESSAGES.SHARE_READY,
    sessionCompleted,
  };
}

export function isScoredScorecardRow(row: {
  evaluation_status?: string | null;
  score_status?: string | null;
  overall_score?: number | null;
} | null | undefined): boolean {
  if (!row) return false;
  const evalStatus = String(row.evaluation_status ?? "").toLowerCase().trim();
  const scoreStatus = String(row.score_status ?? "").toLowerCase().trim();
  const hasScore =
    typeof row.overall_score === "number" && Number.isFinite(row.overall_score);
  if (evalStatus === "completed" && hasScore) return true;
  if (scoreStatus === "scored" && hasScore) return true;
  return false;
}
