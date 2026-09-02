/**
 * Async company-brief generation: enqueue, poll with backoff, cancel, retry.
 * The Edge Function returns a job ID immediately so gateway timeouts cannot
 * kill long provider work.
 */
import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { supabase } from "@/lib/supabase/client";
import { getAiUserFacingError } from "@/lib/network/aiErrorUx";
import {
  companyResearchIdempotencyKey,
  normalizeCompanyName,
} from "@/lib/company/normalizeCompanyName";

export type CompanyBriefJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type CompanyBriefJob = {
  jobId: string;
  status: CompanyBriefJobStatus;
  progressStage?: string | null;
  async?: boolean;
  accepted?: boolean;
  persisted?: boolean;
  cached?: boolean;
  id?: string;
  researchId?: string | null;
  brief?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  source?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  creditsReleased?: boolean;
  idempotentReplay?: boolean;
  message?: string;
};

export type CompanyBriefErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "AI_TIMEOUT"
  | "JOB_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "AI_INVALID_OUTPUT"
  | "DATABASE_FAILURE"
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

export function isCompanyBriefTerminal(status: string | undefined): boolean {
  return TERMINAL.has(String(status ?? ""));
}

export function isCompanyBriefInFlight(status: string | undefined): boolean {
  const s = String(status ?? "");
  return s === "queued" || s === "processing";
}

function pollDelayMs(polls: number, transientHits: number): number {
  const hits = transientHits > 0 ? transientHits - 1 : polls;
  return Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** Math.min(hits, 3));
}

export function userFacingCompanyBriefError(err: unknown): string {
  const code = String(
    (err as { code?: unknown } | null)?.code ??
      (err instanceof ApiClientError ? err.code : "") ??
      "",
  ).toUpperCase();
  const mapped: Record<string, string> = {
    INSUFFICIENT_CREDITS: "Not enough credits to generate this brief.",
    AI_TIMEOUT: "Brief generation timed out. Your credits were not charged. Please retry.",
    JOB_TIMEOUT: "Brief generation timed out. Your credits were not charged. Please retry.",
    POLL_TIMEOUT:
      "Brief generation is taking longer than expected. You can keep waiting, cancel, or retry.",
    AI_PROVIDER_UNAVAILABLE:
      "Company research is temporarily unavailable. Your credits were not charged.",
    PROVIDER_UNAVAILABLE:
      "Company research is temporarily unavailable. Your credits were not charged.",
    AI_INVALID_OUTPUT:
      "The AI response could not be used. Your credits were not charged. Please retry.",
    DATABASE_FAILURE: "Research was generated, but we couldn't save it. Please retry.",
    DATABASE_UNAVAILABLE: "Research was generated, but we couldn't save it. Please retry.",
    CANCELLED: "Brief generation was cancelled. Credits were not charged.",
    DUPLICATE_REQUEST: "A brief is already being generated for this company.",
    CAPABILITY_REQUIRED: "Company research requires a Pro plan or higher.",
  };
  if (mapped[code]) {
    const msg = err instanceof Error ? err.message : "";
    if (code === "INSUFFICIENT_CREDITS" && /need|available/i.test(msg)) return msg;
    return mapped[code];
  }
  return getAiUserFacingError(err);
}

function asJob(payload: CompanyBriefJob | Record<string, unknown>, fallbackId?: string): CompanyBriefJob {
  const rec = payload as Record<string, unknown>;
  const jobId = String(rec.jobId ?? rec.id ?? fallbackId ?? "");
  const status = String(rec.status ?? "queued") as CompanyBriefJobStatus;
  const brief =
    rec.brief && typeof rec.brief === "object"
      ? (rec.brief as Record<string, unknown>)
      : rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)
        ? (rec.data as Record<string, unknown>)
        : null;
  return {
    jobId,
    status,
    progressStage: typeof rec.progressStage === "string" ? rec.progressStage : null,
    async: rec.async === true || rec.accepted === true,
    accepted: rec.accepted === true,
    persisted: rec.persisted === true,
    cached: rec.cached === true,
    id: typeof rec.id === "string" ? rec.id : typeof rec.researchId === "string" ? rec.researchId : undefined,
    researchId: typeof rec.researchId === "string" ? rec.researchId : null,
    brief,
    data: brief,
    source: typeof rec.source === "string" ? rec.source : null,
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
    creditsReleased: rec.creditsReleased === true,
    idempotentReplay: rec.idempotentReplay === true,
    message: typeof rec.message === "string" ? rec.message : undefined,
  };
}

export async function startCompanyResearchJob(input: {
  company: string;
  role?: string;
  force?: boolean;
  userId?: string;
  signal?: AbortSignal;
}): Promise<CompanyBriefJob> {
  const normalized = normalizeCompanyName(input.company);
  const headers: Record<string, string> = {};
  if (input.userId && normalized) {
    headers["x-idempotency-key"] = companyResearchIdempotencyKey({
      userId: input.userId,
      normalizedCompany: normalized,
      force: input.force === true,
    }).slice(0, 150);
  }
  const result = await fetchEdgeJson<CompanyBriefJob>(
    "company-research",
    {
      company: input.company,
      role: input.role ?? "",
      force: input.force === true,
    },
    { headers, signal: input.signal, timeoutMs: START_TIMEOUT_MS },
  );
  return asJob(result);
}

export async function getCompanyResearchJob(jobId: string): Promise<CompanyBriefJob> {
  const { data, error } = await supabase
    .from("company_research_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!error && data) {
    const row = data as Record<string, unknown>;
    return asJob({
      jobId: String(row.id),
      status: String(row.status ?? "queued"),
      progressStage: row.progress_stage,
      persisted: Boolean(row.research_id && row.status === "completed"),
      id: row.research_id,
      researchId: row.research_id,
      brief: row.brief,
      source: row.source,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      retryable: row.retryable,
      creditsReleased: Boolean(row.credits_released_at),
    });
  }

  return asJob(
    await fetchEdgeJson<CompanyBriefJob>(
      "company-research",
      { action: "status", jobId },
      { timeoutMs: 15_000 },
    ),
    jobId,
  );
}

export async function cancelCompanyResearchJob(jobId: string): Promise<CompanyBriefJob> {
  return asJob(
    await fetchEdgeJson<CompanyBriefJob>(
      "company-research",
      { action: "cancel", jobId },
      { timeoutMs: 15_000 },
    ),
    jobId,
  );
}

export async function retryCompanyResearchJob(jobId: string): Promise<CompanyBriefJob> {
  return asJob(
    await fetchEdgeJson<CompanyBriefJob>(
      "company-research",
      { action: "retry", jobId },
      { timeoutMs: START_TIMEOUT_MS },
    ),
    jobId,
  );
}

export async function processCompanyResearchJob(jobId: string): Promise<CompanyBriefJob> {
  return asJob(
    await fetchEdgeJson<CompanyBriefJob>(
      "company-research",
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

export async function pollCompanyResearchJobUntilTerminal(
  jobId: string,
  seed: CompanyBriefJob,
  options: {
    setJob?: (job: CompanyBriefJob) => void;
    shouldAbort?: () => boolean;
    maxPolls?: number;
    nudgeAfterPolls?: number;
    nudge?: (jobId: string) => Promise<void>;
  } = {},
): Promise<CompanyBriefJob> {
  let current = seed;
  let polls = 0;
  let transientHits = 0;
  let nudged = false;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const nudgeAfter = options.nudgeAfterPolls ?? 2;

  options.setJob?.(current);
  if (isCompanyBriefTerminal(current.status)) return current;

  while (!isCompanyBriefTerminal(current.status) && !options.shouldAbort?.() && polls < maxPolls) {
    const delayMs = pollDelayMs(polls, transientHits);
    await new Promise((r) => setTimeout(r, delayMs));
    if (options.shouldAbort?.()) break;
    try {
      current = await getCompanyResearchJob(jobId);
      transientHits = 0;
      options.setJob?.(current);
      if (
        !nudged &&
        options.nudge &&
        polls + 1 >= nudgeAfter &&
        !isCompanyBriefTerminal(current.status)
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
            errorMessage: userFacingCompanyBriefError({ code: "POLL_TIMEOUT" }),
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

  if (!isCompanyBriefTerminal(current.status) && (options.shouldAbort?.() || polls >= maxPolls)) {
    if (!options.shouldAbort?.()) {
      current = {
        ...current,
        status: current.status,
        errorCode: "POLL_TIMEOUT",
        errorMessage: userFacingCompanyBriefError({ code: "POLL_TIMEOUT" }),
        retryable: true,
      };
      options.setJob?.(current);
    }
  }

  return current;
}

export async function generateCompanyBrief(input: {
  company: string;
  role?: string;
  force?: boolean;
  userId?: string;
  signal?: AbortSignal;
  shouldAbort?: () => boolean;
  onJob?: (job: CompanyBriefJob) => void;
}): Promise<CompanyBriefJob> {
  const started = await startCompanyResearchJob(input);
  input.onJob?.(started);

  if (started.persisted && started.brief) return started;
  if (started.status === "completed" && started.brief) return started;
  if (!started.jobId) {
    throw new ApiClientError({
      message: "Brief generation did not return a job id.",
      status: 502,
      code: "DATABASE_FAILURE",
    });
  }
  if (isCompanyBriefTerminal(started.status) && started.status !== "completed") {
    throw new ApiClientError({
      message:
        started.errorMessage ||
        userFacingCompanyBriefError({ code: started.errorCode ?? "PROVIDER_UNAVAILABLE" }),
      status: started.errorCode === "INSUFFICIENT_CREDITS" ? 402 : 503,
      code: started.errorCode || "PROVIDER_UNAVAILABLE",
      details: started,
    });
  }

  const terminal = await pollCompanyResearchJobUntilTerminal(started.jobId, started, {
    setJob: input.onJob,
    shouldAbort: () => Boolean(input.shouldAbort?.() || input.signal?.aborted),
    nudge: (id) => processCompanyResearchJob(id).then(() => undefined),
  });

  if (terminal.status === "failed" || terminal.status === "cancelled") {
    throw new ApiClientError({
      message: terminal.errorMessage || userFacingCompanyBriefError({ code: terminal.errorCode ?? "PROVIDER_UNAVAILABLE" }),
      status: terminal.errorCode === "INSUFFICIENT_CREDITS" ? 402 : 503,
      code: terminal.errorCode || "PROVIDER_UNAVAILABLE",
      details: terminal,
    });
  }

  if (terminal.status !== "completed" || !terminal.brief) {
    throw new ApiClientError({
      message: userFacingCompanyBriefError({ code: "POLL_TIMEOUT" }),
      status: 504,
      code: "POLL_TIMEOUT",
      details: terminal,
    });
  }

  return terminal;
}

export const COMPANY_BRIEF_POLL = {
  maxPolls: DEFAULT_MAX_POLLS,
  startMs: BACKOFF_START_MS,
  capMs: BACKOFF_CAP_MS,
};
