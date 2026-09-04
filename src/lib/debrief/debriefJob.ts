/**
 * Async session-debrief generation: enqueue, poll with backoff, cancel, retry.
 * The Edge Function returns a job ID immediately so gateway timeouts cannot
 * kill long provider work.
 */
import { ApiClientError } from "@/lib/api/apiClient";
import { getAiUserFacingError } from "@/lib/network/aiErrorUx";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { supabase } from "@/lib/supabase/client";

export type SessionDebriefJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type SessionDebriefJob = {
  jobId: string;
  status: SessionDebriefJobStatus;
  progressStage?: string | null;
  async?: boolean;
  accepted?: boolean;
  persisted?: boolean;
  cached?: boolean;
  id?: string;
  debriefId?: string | null;
  sessionId?: string | null;
  source?: string | null;
  model?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  creditsReleased?: boolean;
  idempotentReplay?: boolean;
  message?: string;
};

export type SessionDebriefErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "AI_TIMEOUT"
  | "JOB_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "AI_INVALID_OUTPUT"
  | "DATABASE_FAILURE"
  | "NOT_SCORED"
  | "CANCELLED"
  | "POLL_TIMEOUT"
  | "DUPLICATE_REQUEST"
  | "CAPABILITY_REQUIRED";

const TERMINAL = new Set<string>(["completed", "failed", "cancelled"]);
const DEFAULT_MAX_POLLS = 36;
const BACKOFF_START_MS = 1_500;
const BACKOFF_CAP_MS = 8_000;
const TRANSIENT_FAIL_LIMIT = 8;
const START_TIMEOUT_MS = 20_000;
const NUDGE_TIMEOUT_MS = 20_000;

export function sessionDebriefIdempotencyKey(input: {
  userId: string;
  sessionId: string;
}): string {
  return `debrief:${input.userId}:${input.sessionId}`.slice(0, 150);
}

export function isSessionDebriefTerminal(status: string | undefined): boolean {
  return TERMINAL.has(String(status ?? ""));
}

export function isSessionDebriefInFlight(status: string | undefined): boolean {
  const s = String(status ?? "");
  return s === "queued" || s === "processing";
}

function pollDelayMs(polls: number, transientHits: number): number {
  const hits = transientHits > 0 ? transientHits - 1 : polls;
  return Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** Math.min(hits, 3));
}

export function userFacingSessionDebriefError(err: unknown): string {
  const code = String(
    (err as { code?: unknown } | null)?.code ??
      (err instanceof ApiClientError ? err.code : "") ??
      "",
  ).toUpperCase();
  const mapped: Record<string, string> = {
    INSUFFICIENT_CREDITS: "Not enough credits to generate this debrief.",
    AI_TIMEOUT: "Debrief generation timed out. Your credits were not charged. Please retry.",
    JOB_TIMEOUT: "Debrief generation timed out. Your credits were not charged. Please retry.",
    POLL_TIMEOUT:
      "Debrief generation is taking longer than expected. You can keep waiting, cancel, or retry.",
    AI_PROVIDER_UNAVAILABLE:
      "Debrief generation is temporarily unavailable. Your credits were not charged.",
    PROVIDER_UNAVAILABLE:
      "Debrief generation is temporarily unavailable. Your credits were not charged.",
    AI_INVALID_OUTPUT:
      "The AI response could not be used. Your credits were not charged. Please retry.",
    DATABASE_FAILURE: "Debrief was generated, but we couldn't save it. Please retry.",
    DATABASE_UNAVAILABLE: "Debrief was generated, but we couldn't save it. Please retry.",
    NOT_SCORED: "No answers or transcript were recorded for this session, so a debrief cannot be generated.",
    NOT_ELIGIBLE_NO_ANSWERS:
      "No answers or transcript were recorded for this session, so a debrief cannot be generated.",
    NOT_ELIGIBLE_NO_QUESTIONS:
      "No questions were recorded for this session, so a debrief cannot be generated.",
    SESSION_INCOMPLETE: "This session is not complete yet, so a debrief cannot be generated.",
    DEBRIEF_AI_REQUIRED:
      "Debrief generation requires AI evaluation. Your credits were not charged. Please retry.",
    CANCELLED: "Debrief generation was cancelled. Credits were not charged.",
    DUPLICATE_REQUEST: "A debrief is already being generated for this session.",
    DEBRIEF_ALREADY_PROCESSING: "A debrief is already being generated for this session.",
    CAPABILITY_REQUIRED:
      "Debrief generation is not available for your account right now. Check your credits or try again later.",
  };
  if (mapped[code]) {
    const msg = err instanceof Error ? err.message : "";
    if (code === "INSUFFICIENT_CREDITS" && /need|available/i.test(msg)) return msg;
    return mapped[code];
  }
  return getAiUserFacingError(err);
}

function asJob(payload: SessionDebriefJob | Record<string, unknown>, fallbackId?: string): SessionDebriefJob {
  const rec = payload as Record<string, unknown>;
  const jobId = String(rec.jobId ?? rec.id ?? fallbackId ?? "");
  const status = String(rec.status ?? "queued") as SessionDebriefJobStatus;
  return {
    jobId,
    status,
    progressStage: typeof rec.progressStage === "string" ? rec.progressStage : typeof rec.progress_stage === "string" ? rec.progress_stage : null,
    async: rec.async === true || rec.accepted === true,
    accepted: rec.accepted === true,
    persisted: rec.persisted === true || Boolean(rec.debrief_id && rec.status === "completed"),
    cached: rec.cached === true,
    id: typeof rec.id === "string" ? rec.id : typeof rec.debriefId === "string" ? rec.debriefId : typeof rec.debrief_id === "string" ? rec.debrief_id : undefined,
    debriefId: typeof rec.debriefId === "string" ? rec.debriefId : typeof rec.debrief_id === "string" ? rec.debrief_id : null,
    sessionId: typeof rec.sessionId === "string" ? rec.sessionId : typeof rec.session_id === "string" ? rec.session_id : null,
    source: typeof rec.source === "string" ? rec.source : null,
    model: typeof rec.model === "string" ? rec.model : null,
    errorCode: typeof rec.errorCode === "string" ? rec.errorCode : typeof rec.error_code === "string" ? rec.error_code : null,
    errorMessage:
      typeof rec.errorMessage === "string"
        ? rec.errorMessage
        : typeof rec.error_message === "string"
          ? rec.error_message
          : typeof rec.message === "string"
            ? rec.message
            : null,
    retryable: rec.retryable !== false,
    creditsReleased: rec.creditsReleased === true || Boolean(rec.credits_released_at),
    idempotentReplay: rec.idempotentReplay === true,
    message: typeof rec.message === "string" ? rec.message : undefined,
  };
}

export async function startSessionDebriefJob(input: {
  sessionId: string;
  model?: string;
  userId?: string;
  signal?: AbortSignal;
}): Promise<SessionDebriefJob> {
  const headers: Record<string, string> = {};
  if (input.userId) {
    headers["x-idempotency-key"] = sessionDebriefIdempotencyKey({
      userId: input.userId,
      sessionId: input.sessionId,
    });
  }
  const result = await fetchEdgeJson<SessionDebriefJob>(
    "generate-debrief",
    {
      action: "start",
      session_id: input.sessionId,
      model: input.model ?? "",
    },
    { headers, signal: input.signal, timeoutMs: START_TIMEOUT_MS },
  );
  return asJob(result);
}

export async function listActiveDebriefJobsForUser(
  userId: string,
): Promise<
  Array<{
    jobId: string;
    sessionId: string;
    status: "queued" | "processing";
    updatedAt: string;
    createdAt: string | null;
    progressStage: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("session_debrief_jobs")
    .select("id, session_id, status, progress_stage, created_at, updated_at")
    .eq("user_id", userId)
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message || "Failed to load debrief jobs");
  }

  return (data ?? [])
    .map((row) => {
      const status = String(row.status ?? "");
      if (status !== "queued" && status !== "processing") return null;
      const sessionId = String(row.session_id ?? "");
      if (!sessionId) return null;
      return {
        jobId: String(row.id),
        sessionId,
        status: status as "queued" | "processing",
        updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        createdAt: row.created_at ? String(row.created_at) : null,
        progressStage:
          typeof row.progress_stage === "string" ? row.progress_stage : null,
      };
    })
    .filter((j): j is NonNullable<typeof j> => Boolean(j));
}

export async function listRetryableFailedDebriefJobsForUser(
  userId: string,
): Promise<
  Array<{
    jobId: string;
    sessionId: string;
    errorCode: string | null;
    errorMessage: string | null;
    updatedAt: string;
  }>
> {
  const { data, error } = await supabase
    .from("session_debrief_jobs")
    .select("id, session_id, status, error_code, error_message, retryable, updated_at")
    .eq("user_id", userId)
    .eq("status", "failed")
    .eq("retryable", true)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message || "Failed to load failed debrief jobs");
  }

  return (data ?? [])
    .map((row) => {
      const sessionId = String(row.session_id ?? "");
      if (!sessionId) return null;
      return {
        jobId: String(row.id),
        sessionId,
        errorCode: typeof row.error_code === "string" ? row.error_code : null,
        errorMessage: typeof row.error_message === "string" ? row.error_message : null,
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      };
    })
    .filter((j): j is NonNullable<typeof j> => Boolean(j));
}

export async function getSessionDebriefJob(jobId: string): Promise<SessionDebriefJob> {
  const { data, error } = await supabase
    .from("session_debrief_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!error && data) {
    const row = data as Record<string, unknown>;
    return asJob({
      jobId: String(row.id),
      status: String(row.status ?? "queued"),
      progressStage: row.progress_stage,
      persisted: Boolean(row.debrief_id && row.status === "completed"),
      id: row.debrief_id,
      debriefId: row.debrief_id,
      sessionId: row.session_id,
      source: row.source,
      model: row.model,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      retryable: row.retryable,
      creditsReleased: Boolean(row.credits_released_at),
    });
  }

  return asJob(
    await fetchEdgeJson<SessionDebriefJob>(
      "generate-debrief",
      { action: "status", jobId },
      { timeoutMs: 15_000 },
    ),
    jobId,
  );
}

export async function cancelSessionDebriefJob(jobId: string): Promise<SessionDebriefJob> {
  return asJob(
    await fetchEdgeJson<SessionDebriefJob>(
      "generate-debrief",
      { action: "cancel", jobId },
      { timeoutMs: 15_000 },
    ),
    jobId,
  );
}

export async function retrySessionDebriefJob(jobId: string): Promise<SessionDebriefJob> {
  return asJob(
    await fetchEdgeJson<SessionDebriefJob>(
      "generate-debrief",
      { action: "retry", jobId },
      { timeoutMs: START_TIMEOUT_MS },
    ),
    jobId,
  );
}

export async function processSessionDebriefJob(jobId: string): Promise<SessionDebriefJob> {
  return asJob(
    await fetchEdgeJson<SessionDebriefJob>(
      "generate-debrief",
      { action: "process", jobId },
      { timeoutMs: NUDGE_TIMEOUT_MS },
    ),
    jobId,
  );
}

function isTransientPollError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false;
  if (err.status === 429 || err.status === 409) return true;
  return [500, 502, 503, 504].includes(err.status);
}

export async function pollSessionDebriefJobUntilTerminal(
  jobId: string,
  seed: SessionDebriefJob,
  options: {
    setJob?: (job: SessionDebriefJob) => void;
    shouldAbort?: () => boolean;
    maxPolls?: number;
    nudgeAfterPolls?: number;
    nudge?: (jobId: string) => Promise<void>;
  } = {},
): Promise<SessionDebriefJob> {
  let current = seed;
  let polls = 0;
  let transientHits = 0;
  let nudged = false;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const nudgeAfter = options.nudgeAfterPolls ?? 2;

  options.setJob?.(current);
  if (isSessionDebriefTerminal(current.status)) return current;

  while (!isSessionDebriefTerminal(current.status) && !options.shouldAbort?.() && polls < maxPolls) {
    const delayMs = pollDelayMs(polls, transientHits);
    await new Promise((r) => setTimeout(r, delayMs));
    if (options.shouldAbort?.()) break;
    try {
      current = await getSessionDebriefJob(jobId);
      transientHits = 0;
      options.setJob?.(current);
      if (
        !nudged &&
        options.nudge &&
        polls + 1 >= nudgeAfter &&
        !isSessionDebriefTerminal(current.status)
      ) {
        nudged = true;
        await options.nudge(jobId).catch(() => undefined);
      }
    } catch (err) {
      if (isTransientPollError(err)) {
        transientHits += 1;
        polls += 1;
        if (transientHits >= TRANSIENT_FAIL_LIMIT) {
          current = {
            ...current,
            status: "failed",
            errorCode: "POLL_TIMEOUT",
            errorMessage: userFacingSessionDebriefError({ code: "POLL_TIMEOUT" }),
            retryable: true,
          };
          options.setJob?.(current);
          break;
        }
        continue;
      }
      throw err;
    }
    polls += 1;
  }

  if (!isSessionDebriefTerminal(current.status) && (options.shouldAbort?.() || polls >= maxPolls)) {
    if (!options.shouldAbort?.()) {
      current = {
        ...current,
        errorCode: "POLL_TIMEOUT",
        errorMessage: userFacingSessionDebriefError({ code: "POLL_TIMEOUT" }),
        retryable: true,
      };
      options.setJob?.(current);
    }
  }

  return current;
}

export async function generateSessionDebrief(input: {
  sessionId: string;
  model?: string;
  userId?: string;
  signal?: AbortSignal;
  shouldAbort?: () => boolean;
  onJob?: (job: SessionDebriefJob) => void;
}): Promise<SessionDebriefJob> {
  const started = await startSessionDebriefJob(input);
  input.onJob?.(started);

  if (started.status === "completed" && started.debriefId) return started;
  if (!started.jobId) {
    throw new ApiClientError({
      message: "Debrief generation did not return a job id.",
      status: 502,
      code: "DATABASE_FAILURE",
    });
  }
  if (isSessionDebriefTerminal(started.status) && started.status !== "completed") {
    throw new ApiClientError({
      message:
        started.errorMessage ||
        userFacingSessionDebriefError({ code: started.errorCode ?? "PROVIDER_UNAVAILABLE" }),
      status: started.errorCode === "INSUFFICIENT_CREDITS" ? 402 : 503,
      code: started.errorCode || "PROVIDER_UNAVAILABLE",
      details: started,
    });
  }

  const terminal = await pollSessionDebriefJobUntilTerminal(started.jobId, started, {
    setJob: input.onJob,
    shouldAbort: () => Boolean(input.shouldAbort?.() || input.signal?.aborted),
    nudge: (id) => processSessionDebriefJob(id).then(() => undefined),
  });

  if (terminal.status === "failed" || terminal.status === "cancelled") {
    throw new ApiClientError({
      message: terminal.errorMessage || userFacingSessionDebriefError({ code: terminal.errorCode ?? "PROVIDER_UNAVAILABLE" }),
      status: terminal.errorCode === "INSUFFICIENT_CREDITS" ? 402 : 503,
      code: terminal.errorCode || "PROVIDER_UNAVAILABLE",
      details: terminal,
    });
  }

  if (terminal.status !== "completed" || !terminal.debriefId) {
    throw new ApiClientError({
      message: userFacingSessionDebriefError({ code: "POLL_TIMEOUT" }),
      status: 504,
      code: "POLL_TIMEOUT",
      details: terminal,
    });
  }

  return terminal;
}

export const SESSION_DEBRIEF_POLL = {
  maxPolls: DEFAULT_MAX_POLLS,
  startMs: BACKOFF_START_MS,
  capMs: BACKOFF_CAP_MS,
};
