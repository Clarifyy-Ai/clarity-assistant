/**
 * Session comparison engine.
 *
 * Canonical data model (live Postgres):
 *   sessions 1—* session_answers   (question + answer text)
 *   sessions 1—* scorecards        (optional; not every session is scored)
 *   sessions 1—* session_transcripts
 *
 * There is no `session_questions` table. Nested PostgREST selects that
 * embed `session_questions` are invalid and must not be used.
 *
 * Product rule: BASELINE is the earlier session; COMPARISON is the later one.
 * Storage timestamps are UTC. Display uses the caller's IANA timezone
 * (profile timezone, else the runtime default).
 */

export type AnalyticsScoreStatus =
  | "scored"
  | "not_scored"
  | "pending"
  | "failed"
  | "excluded";

export const COMPARISON_SOURCE_VERSION = "compare-sessions.v1";
export const BASELINE_RULE = "older_session" as const;

export type CompareErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_OWNED"
  | "SESSION_NOT_COMPLETED"
  | "SESSION_NOT_COMPARABLE"
  | "SCORECARD_NOT_READY"
  | "COMPARISON_FAILED"
  | "DUPLICATE_SESSION"
  | "UNAUTHORIZED";

export type SessionCompletionState =
  | "completed"
  | "incomplete"
  | "deleted"
  | "invalid";

export type ComparisonRole = "baseline" | "comparison";

export interface SessionRowInput {
  id: string;
  user_id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  lifecycle_status: string | null;
  deleted_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  questions_asked: number | null;
  answers_generated: number | null;
  avg_wpm: number | null;
  filler_words: number | null;
}

export interface SessionAnswerRowInput {
  session_id: string;
  question: string;
  answer: string | null;
}

export interface ScorecardRowInput {
  session_id: string | null;
  user_id: string;
  overall_score: number | null;
  communication: number | null;
  technical: number | null;
  problem_solving: number | null;
  confidence: number | null;
  details?: Record<string, unknown> | null;
  generated_at?: string | null;
}

export interface SessionComparisonSide {
  session_id: string;
  role: ComparisonRole;
  title: string | null;
  session_type: string | null;
  company: string | null;
  status: string;
  completion_state: SessionCompletionState;
  score_state: AnalyticsScoreStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  display_datetime: string;
  duration_seconds: number | null;
  duration_minutes: number | null;
  question_count: number | null;
  answered_count: number | null;
  unanswered_count: number | null;
  overall_score: number | null;
  dimensions: {
    communication: number | null;
    technical: number | null;
    problem_solving: number | null;
    confidence: number | null;
  };
  speech: {
    filler_rate: number | null;
    wpm_avg: number | null;
  };
}

export interface SessionComparisonPayload {
  source_version: string;
  baseline_rule: typeof BASELINE_RULE;
  timezone: string;
  baseline: SessionComparisonSide;
  comparison: SessionComparisonSide;
  deltas: {
    overall_score: number | null;
    communication: number | null;
    technical: number | null;
    problem_solving: number | null;
    confidence: number | null;
    filler_rate: number | null;
    wpm_avg: number | null;
    duration_seconds: number | null;
    question_count: number | null;
    answered_count: number | null;
  };
  improvement_areas: string[];
  regression_areas: string[];
}

export class CompareSessionsError extends Error {
  readonly code: CompareErrorCode;

  constructor(code: CompareErrorCode, message: string) {
    super(message);
    this.name = "CompareSessionsError";
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Delta = comparison - baseline. Missing values stay unavailable (not zero). */
export function numericDelta(
  comparison: number | null | undefined,
  baseline: number | null | undefined,
): number | null {
  if (!isFiniteNumber(comparison) || !isFiniteNumber(baseline)) return null;
  return comparison - baseline;
}

/**
 * Canonical duration: ended_at - started_at.
 * Negative spans and missing timestamps are unavailable, not zero.
 */
export function durationSeconds(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): number | null {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 0) return null;
  return seconds;
}

export function durationMinutes(seconds: number | null): number | null {
  if (seconds === null) return null;
  return Math.round(seconds / 60);
}

export function companyFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const parts = title.split(/\s+[—–-]\s+/);
  if (parts.length < 2) return null;
  const company = parts.slice(1).join(" — ").trim();
  return company.length > 0 ? company : null;
}

export function sessionAnchorTime(session: SessionRowInput): number {
  const candidates = [session.started_at, session.created_at, session.ended_at];
  for (const value of candidates) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export function completionState(session: SessionRowInput): SessionCompletionState {
  if (session.deleted_at) return "deleted";
  const status = String(session.status ?? "").toLowerCase();
  if (status === "abandoned") return "invalid";
  if (status === "pending" || status === "active" || status === "paused") {
    return "incomplete";
  }
  if (status === "completed") return "completed";
  const life = String(session.lifecycle_status ?? "").toUpperCase();
  if (life === "COMPLETED" || life === "ANALYZED") return "completed";
  if (life === "IN_PROGRESS" || life === "PAUSED" || life === "READY") {
    return "incomplete";
  }
  if (life === "CANCELLED" || life === "FAILED" || life === "INTERRUPTED") {
    return "invalid";
  }
  return "incomplete";
}

export function scoreStateFromScorecard(
  scorecard: ScorecardRowInput | null | undefined,
): AnalyticsScoreStatus {
  if (!scorecard) return "not_scored";
  if (isFiniteNumber(scorecard.overall_score)) return "scored";
  return "not_scored";
}

export function isCompletedSession(session: SessionRowInput): boolean {
  return completionState(session) === "completed";
}

export function isComparableSession(
  session: SessionRowInput,
  scorecard: ScorecardRowInput | null | undefined,
): boolean {
  return isCompletedSession(session) && scoreStateFromScorecard(scorecard) === "scored";
}

export function canEnableCompare(options: {
  sessionAId: string;
  sessionBId: string;
  sessionAComparable: boolean;
  sessionBComparable: boolean;
}): { enabled: boolean; reason: string | null } {
  if (!options.sessionAId || !options.sessionBId) {
    return { enabled: false, reason: "Select two sessions to compare." };
  }
  if (options.sessionAId === options.sessionBId) {
    return { enabled: false, reason: "Choose two different sessions." };
  }
  if (!options.sessionAComparable || !options.sessionBComparable) {
    return {
      enabled: false,
      reason: "Both sessions must be completed and scored.",
    };
  }
  return { enabled: true, reason: null };
}

export function questionCounts(
  session: SessionRowInput,
  answers: SessionAnswerRowInput[],
): {
  question_count: number | null;
  answered_count: number | null;
  unanswered_count: number | null;
} {
  const rows = answers.filter((row) => row.session_id === session.id);
  if (rows.length > 0) {
    const answered = rows.filter(
      (row) => typeof row.answer === "string" && row.answer.trim().length > 0,
    ).length;
    return {
      question_count: rows.length,
      answered_count: answered,
      unanswered_count: rows.length - answered,
    };
  }

  const asked = session.questions_asked;
  const generated = session.answers_generated;
  if (!isFiniteNumber(asked) && !isFiniteNumber(generated)) {
    return {
      question_count: null,
      answered_count: null,
      unanswered_count: null,
    };
  }

  // Only invent zeros when both sides are known; otherwise keep missing as null.
  const total = isFiniteNumber(asked) ? asked : (isFiniteNumber(generated) ? generated : null);
  const answered = isFiniteNumber(generated) ? generated : null;
  return {
    question_count: total,
    answered_count: answered,
    unanswered_count:
      isFiniteNumber(total) && isFiniteNumber(answered)
        ? Math.max(0, total - answered)
        : null,
  };
}

function detailNumber(
  details: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!details) return null;
  const value = details[key];
  return isFiniteNumber(value) ? value : null;
}

export function resolveSpeechMetrics(
  session: SessionRowInput,
  scorecard: ScorecardRowInput | null | undefined,
): { filler_rate: number | null; wpm_avg: number | null } {
  const details = scorecard?.details ?? null;
  const fillerFromCard = scorecard
    ? detailNumber(details, "filler_rate")
    : null;
  const wpmFromCard = scorecard ? detailNumber(details, "wpm_avg") : null;

  // 0 WPM is not a meaningful measured rate — treat as unavailable.
  const wpm_avg =
    wpmFromCard != null && wpmFromCard > 0
      ? wpmFromCard
      : isFiniteNumber(session.avg_wpm) && session.avg_wpm > 0
        ? session.avg_wpm
        : null;

  let filler_rate = fillerFromCard;
  if (filler_rate == null && isFiniteNumber(session.filler_words) && session.filler_words >= 0) {
    const duration = durationSeconds(session.started_at, session.ended_at);
    const minutes = duration != null && duration > 0 ? duration / 60 : null;
    if (minutes != null && minutes > 0) {
      filler_rate = Math.round((session.filler_words / minutes) * 100) / 100;
    }
  }

  return { filler_rate, wpm_avg };
}

export function formatSessionDateTime(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return "Date unavailable";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Date unavailable";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  }
}

export function resolveDisplayTimeZone(preferred?: string | null): string {
  const trimmed = preferred?.trim();
  if (trimmed) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
      return trimmed;
    } catch {
      // fall through
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function assertOwnedByUser(
  session: SessionRowInput | null | undefined,
  userId: string,
): SessionRowInput {
  if (!session) {
    throw new CompareSessionsError(
      "SESSION_NOT_FOUND",
      "Session not found.",
    );
  }
  if (session.user_id !== userId) {
    throw new CompareSessionsError(
      "SESSION_NOT_OWNED",
      "You can only compare your own sessions.",
    );
  }
  return session;
}

export function assertComparablePair(
  sessionA: SessionRowInput,
  sessionB: SessionRowInput,
  scorecardA: ScorecardRowInput | null,
  scorecardB: ScorecardRowInput | null,
): void {
  if (sessionA.id === sessionB.id) {
    throw new CompareSessionsError(
      "DUPLICATE_SESSION",
      "Choose two different sessions.",
    );
  }
  for (const session of [sessionA, sessionB]) {
    const state = completionState(session);
    if (state === "deleted") {
      throw new CompareSessionsError(
        "SESSION_NOT_COMPARABLE",
        "A selected session is no longer available.",
      );
    }
    if (state === "invalid") {
      throw new CompareSessionsError(
        "SESSION_NOT_COMPARABLE",
        "A selected session cannot be compared.",
      );
    }
    if (state !== "completed") {
      throw new CompareSessionsError(
        "SESSION_NOT_COMPLETED",
        "Both sessions must be completed before they can be compared.",
      );
    }
  }
  if (!isComparableSession(sessionA, scorecardA) || !isComparableSession(sessionB, scorecardB)) {
    throw new CompareSessionsError(
      "SCORECARD_NOT_READY",
      "Both sessions need a scorecard before they can be compared.",
    );
  }
}

function buildSide(
  session: SessionRowInput,
  scorecard: ScorecardRowInput | null,
  answers: SessionAnswerRowInput[],
  role: ComparisonRole,
  timeZone: string,
): SessionComparisonSide {
  const counts = questionCounts(session, answers);
  const duration = durationSeconds(session.started_at, session.ended_at);
  const speech = resolveSpeechMetrics(session, scorecard);
  const anchor = session.started_at ?? session.created_at;

  return {
    session_id: session.id,
    role,
    title: session.title,
    session_type: session.type,
    company: companyFromTitle(session.title),
    status: session.status ?? "unknown",
    completion_state: completionState(session),
    score_state: scoreStateFromScorecard(scorecard),
    started_at: session.started_at,
    ended_at: session.ended_at,
    created_at: session.created_at,
    display_datetime: formatSessionDateTime(anchor, timeZone),
    duration_seconds: duration,
    duration_minutes: durationMinutes(duration),
    question_count: counts.question_count,
    answered_count: counts.answered_count,
    unanswered_count: counts.unanswered_count,
    overall_score: isFiniteNumber(scorecard?.overall_score)
      ? scorecard!.overall_score
      : null,
    dimensions: {
      communication: isFiniteNumber(scorecard?.communication)
        ? scorecard!.communication
        : null,
      technical: isFiniteNumber(scorecard?.technical) ? scorecard!.technical : null,
      problem_solving: isFiniteNumber(scorecard?.problem_solving)
        ? scorecard!.problem_solving
        : null,
      confidence: isFiniteNumber(scorecard?.confidence)
        ? scorecard!.confidence
        : null,
    },
    speech,
  };
}

function areaDeltas(
  comparison: SessionComparisonSide,
  baseline: SessionComparisonSide,
): { improvement_areas: string[]; regression_areas: string[] } {
  const improvement_areas: string[] = [];
  const regression_areas: string[] = [];

  const score = numericDelta(comparison.overall_score, baseline.overall_score);
  if (score !== null && score > 5) improvement_areas.push("Overall score");
  if (score !== null && score < -5) regression_areas.push("Overall score");

  const fillers = numericDelta(comparison.speech.filler_rate, baseline.speech.filler_rate);
  if (fillers !== null && fillers < -0.5) improvement_areas.push("Fewer filler words");
  if (fillers !== null && fillers > 0.5) regression_areas.push("Filler word rate");

  const wpm = numericDelta(comparison.speech.wpm_avg, baseline.speech.wpm_avg);
  if (
    isFiniteNumber(comparison.speech.wpm_avg) &&
    isFiniteNumber(baseline.speech.wpm_avg) &&
    comparison.speech.wpm_avg >= 110 &&
    baseline.speech.wpm_avg < 110
  ) {
    improvement_areas.push("Speaking pace");
  }
  if (
    isFiniteNumber(comparison.speech.wpm_avg) &&
    comparison.speech.wpm_avg > 180 &&
    (!isFiniteNumber(baseline.speech.wpm_avg) || baseline.speech.wpm_avg <= 180)
  ) {
    regression_areas.push("Speaking too fast");
  }
  void wpm;

  const communication = numericDelta(
    comparison.dimensions.communication,
    baseline.dimensions.communication,
  );
  if (communication !== null && communication > 5) {
    improvement_areas.push("Communication");
  }
  if (communication !== null && communication < -5) {
    regression_areas.push("Communication");
  }

  return { improvement_areas, regression_areas };
}

export function orderBaselineAndComparison(
  sessionA: SessionRowInput,
  sessionB: SessionRowInput,
): { baseline: SessionRowInput; comparison: SessionRowInput } {
  const aTime = sessionAnchorTime(sessionA);
  const bTime = sessionAnchorTime(sessionB);
  if (aTime <= bTime) {
    return { baseline: sessionA, comparison: sessionB };
  }
  return { baseline: sessionB, comparison: sessionA };
}

export function buildComparisonPayload(input: {
  userId: string;
  sessionA: SessionRowInput;
  sessionB: SessionRowInput;
  scorecardA: ScorecardRowInput | null;
  scorecardB: ScorecardRowInput | null;
  answers: SessionAnswerRowInput[];
  timeZone?: string | null;
}): SessionComparisonPayload {
  const sessionA = assertOwnedByUser(input.sessionA, input.userId);
  const sessionB = assertOwnedByUser(input.sessionB, input.userId);
  assertComparablePair(sessionA, sessionB, input.scorecardA, input.scorecardB);

  const ordered = orderBaselineAndComparison(sessionA, sessionB);
  const baselineCard =
    ordered.baseline.id === sessionA.id ? input.scorecardA : input.scorecardB;
  const comparisonCard =
    ordered.comparison.id === sessionA.id ? input.scorecardA : input.scorecardB;
  const timeZone = resolveDisplayTimeZone(input.timeZone);

  const baseline = buildSide(
    ordered.baseline,
    baselineCard,
    input.answers,
    "baseline",
    timeZone,
  );
  const comparison = buildSide(
    ordered.comparison,
    comparisonCard,
    input.answers,
    "comparison",
    timeZone,
  );
  const areas = areaDeltas(comparison, baseline);

  return {
    source_version: COMPARISON_SOURCE_VERSION,
    baseline_rule: BASELINE_RULE,
    timezone: timeZone,
    baseline,
    comparison,
    deltas: {
      overall_score: numericDelta(comparison.overall_score, baseline.overall_score),
      communication: numericDelta(
        comparison.dimensions.communication,
        baseline.dimensions.communication,
      ),
      technical: numericDelta(
        comparison.dimensions.technical,
        baseline.dimensions.technical,
      ),
      problem_solving: numericDelta(
        comparison.dimensions.problem_solving,
        baseline.dimensions.problem_solving,
      ),
      confidence: numericDelta(
        comparison.dimensions.confidence,
        baseline.dimensions.confidence,
      ),
      filler_rate: numericDelta(comparison.speech.filler_rate, baseline.speech.filler_rate),
      wpm_avg: numericDelta(comparison.speech.wpm_avg, baseline.speech.wpm_avg),
      duration_seconds: numericDelta(
        comparison.duration_seconds,
        baseline.duration_seconds,
      ),
      question_count: numericDelta(comparison.question_count, baseline.question_count),
      answered_count: numericDelta(comparison.answered_count, baseline.answered_count),
    },
    improvement_areas: areas.improvement_areas,
    regression_areas: areas.regression_areas,
  };
}

const COMPARE_USER_MESSAGES: Record<CompareErrorCode, string> = {
  SESSION_NOT_FOUND: "One of those sessions could not be found.",
  SESSION_NOT_OWNED: "You can only compare your own sessions.",
  SESSION_NOT_COMPLETED: "Both sessions must be completed before they can be compared.",
  SESSION_NOT_COMPARABLE: "Those sessions cannot be compared.",
  SCORECARD_NOT_READY: "Both sessions need a scorecard before they can be compared.",
  COMPARISON_FAILED: "Could not compare those sessions. Please try again.",
  DUPLICATE_SESSION: "Choose two different sessions.",
  UNAUTHORIZED: "Sign in to compare sessions.",
};

export function compareErrorUserMessage(
  code: string | null | undefined,
  fallback?: string,
): string {
  if (code && code in COMPARE_USER_MESSAGES) {
    return COMPARE_USER_MESSAGES[code as CompareErrorCode];
  }
  if (fallback && /PGRST|PostgREST|relationship|HTTP\s*[45]/i.test(fallback)) {
    return COMPARE_USER_MESSAGES.COMPARISON_FAILED;
  }
  if (fallback && fallback.trim().length > 0 && fallback.length < 180) {
    if (/PGRST|PostgREST|could not find|foreign key/i.test(fallback)) {
      return COMPARE_USER_MESSAGES.COMPARISON_FAILED;
    }
    return fallback;
  }
  return COMPARE_USER_MESSAGES.COMPARISON_FAILED;
}

export function sessionPickerLabel(options: {
  dateIso: string | null | undefined;
  timeZone: string;
  sessionType?: string | null;
  company?: string | null;
  score: number | null | undefined;
  scoreStatus?: string | null;
  completionState?: SessionCompletionState | string | null;
}): string {
  const date = formatSessionDateTime(options.dateIso, options.timeZone);
  const type = options.sessionType ? titleCase(options.sessionType) : null;
  const company = options.company?.trim() || null;
  const scored =
    options.scoreStatus === "scored" && isFiniteNumber(options.score)
      ? `Score ${options.score}`
      : options.completionState === "incomplete"
        ? "In progress"
        : options.completionState === "invalid"
          ? "Unavailable"
          : options.scoreStatus === "failed"
            ? "Failed"
            : options.scoreStatus === "pending" || options.scoreStatus === "processing"
              ? "Processing"
              : "Not eligible";
  return [date, type, company, scored].filter(Boolean).join(" · ");
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}
