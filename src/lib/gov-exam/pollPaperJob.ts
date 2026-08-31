import { ApiClientError } from "@/lib/api/apiClient";
import { debugLog4a9592 } from "@/lib/debug/debugLog4a9592";
import { getPaperGenerationJob, type PaperJobResult } from "@/lib/gov-exam/api";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";
import { isPaperJobTerminal } from "@/lib/gov-exam/paperJobStatus";

const DEFAULT_MAX_POLLS = 30;
const BACKOFF_START_MS = 2_000;
const BACKOFF_CAP_MS = 15_000;
const TRANSIENT_FAIL_LIMIT = 8;

function isRateLimitPollError(err: unknown): err is ApiClientError {
  return (
    err instanceof ApiClientError &&
    (err.status === 429 || err.code === "RATE_LIMITED")
  );
}

function isGonePollError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && err.status === 404;
}

function isTransientPollError(err: unknown): err is ApiClientError {
  if (!(err instanceof ApiClientError)) return false;
  if (isRateLimitPollError(err) || err.status === 409) return true;
  return [500, 502, 503, 504].includes(err.status);
}

function pollDelayMs(polls: number, transientHits: number): number {
  if (transientHits > 0) {
    return Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** Math.min(transientHits - 1, 3));
  }
  return Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** Math.min(polls, 3));
}

function retryAfterMs(err: ApiClientError, hits: number): number {
  const details = err.details as { retryAfterSeconds?: unknown } | undefined;
  const hinted = Number(details?.retryAfterSeconds);
  if (Number.isFinite(hinted) && hinted > 0) {
    return Math.min(60_000, Math.max(3_000, hinted * 1000));
  }
  return pollDelayMs(0, hits);
}

/** Shared generate + refresh-resume poller. Stops on terminal job, 404, or max polls.
 * HTTP 429/409/5xx are transient for an in-flight job — backoff and continue. */
export async function pollPaperJobUntilTerminal(
  jobId: string,
  seed: PaperJobResult,
  options: {
    setJob: (job: PaperJobResult) => void;
    shouldAbort: () => boolean;
    maxPolls?: number;
    nudgeAfterPolls?: number;
    nudge?: (jobId: string) => Promise<void>;
  },
): Promise<PaperJobResult> {
  let current = seed;
  let polls = 0;
  let transientHits = 0;
  let nudged = false;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const nudgeAfter = options.nudgeAfterPolls ?? 3;

  debugLog4a9592({
    hypothesisId: "H-A",
    location: "pollPaperJob.ts:start",
    message: "poll_start",
    data: {
      jobId: jobId.slice(0, 8),
      seedStatus: seed.status,
      seedStage: seed.progressStage ?? null,
    },
  });

  while (!isPaperJobTerminal(current.status) && !options.shouldAbort() && polls < maxPolls) {
    const delayMs = pollDelayMs(polls, transientHits);
    await new Promise((r) => setTimeout(r, delayMs));
    if (options.shouldAbort()) break;
    try {
      current = await getPaperGenerationJob(jobId);
      transientHits = 0;
      options.setJob(current);
      if (
        !nudged &&
        options.nudge &&
        polls + 1 >= nudgeAfter &&
        !isPaperJobTerminal(current.status)
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
            status: "failed_retryable",
            errorCode: err.code || "RATE_LIMITED",
            errorMessage: formatGovExamOperationError(err),
          };
          options.setJob(current);
          break;
        }
        await new Promise((r) => setTimeout(r, retryAfterMs(err, transientHits)));
        continue;
      }
      if (isGonePollError(err)) {
        current = {
          ...current,
          status: "failed_retryable",
          errorCode: err.code,
          errorMessage: formatGovExamOperationError(err),
        };
        options.setJob(current);
        break;
      }
      throw err;
    }
    polls += 1;
  }

  if (!isPaperJobTerminal(current.status) && polls >= maxPolls) {
    current = {
      ...current,
      status: "failed_retryable",
      errorMessage:
        "Paper generation is taking longer than expected. Refresh this page to resume.",
    };
    options.setJob(current);
  }

  return current;
}

export const PAPER_JOB_POLL_MAX = DEFAULT_MAX_POLLS;
export const PAPER_JOB_POLL_BACKOFF = { startMs: BACKOFF_START_MS, capMs: BACKOFF_CAP_MS };
