import { ApiClientError } from "@/lib/api/apiClient";
import { getPaperGenerationJob, type PaperJobResult } from "@/lib/gov-exam/api";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";
import { isPaperJobTerminal } from "@/lib/gov-exam/paperJobStatus";

function isTerminalPollError(err: unknown): err is ApiClientError {
  return (
    err instanceof ApiClientError &&
    (err.status === 404 ||
      err.status === 409 ||
      err.status === 429 ||
      err.code === "RATE_LIMITED" ||
      err.code === "GENERATION_CONFLICT")
  );
}

/** Shared generate + refresh-resume poller. Stops on terminal job, 404/409/429, or max polls. */
export async function pollPaperJobUntilTerminal(
  jobId: string,
  seed: PaperJobResult,
  options: {
    setJob: (job: PaperJobResult) => void;
    shouldAbort: () => boolean;
    maxPolls?: number;
  },
): Promise<PaperJobResult> {
  let current = seed;
  let polls = 0;
  const maxPolls = options.maxPolls ?? 400;

  while (!isPaperJobTerminal(current.status) && !options.shouldAbort() && polls < maxPolls) {
    const delayMs = polls < 5 ? 1500 : polls < 20 ? 3000 : 5000;
    await new Promise((r) => setTimeout(r, delayMs));
    if (options.shouldAbort()) break;
    try {
      current = await getPaperGenerationJob(jobId);
      options.setJob(current);
    } catch (err) {
      if (isTerminalPollError(err)) {
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
