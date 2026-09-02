/**
 * Client poller for parse-question-pdf 202 background jobs.
 * extract-question-paper has no HTTP poller (admin lists source_ingestion_jobs);
 * this mirrors that job row + waitUntil pattern for user PDF import.
 */
import { supabase } from "@/lib/supabase/client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { unwrapEdgePayload } from "@/lib/network/edgeResult";
import { coalesceKey, singleFlight } from "@/lib/network/singleFlight";

export type ParseQuestionPdfJob = {
  jobId: string;
  status: string;
  questions: unknown[];
  count: number;
  persistedToBank?: boolean;
  error?: string | null;
  message?: string;
  accepted?: boolean;
};

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const DEFAULT_MAX_POLLS = 36;
const BACKOFF_START_MS = 2_000;
const BACKOFF_CAP_MS = 15_000;

function pollDelayMs(polls: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** Math.min(polls, 3));
}

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not authenticated.");
  return token;
}

export async function getParseQuestionPdfJob(jobId: string): Promise<ParseQuestionPdfJob> {
  const key = coalesceKey({ method: "GET", fnName: "parse-question-pdf", body: { jobId } });
  return singleFlight(key, () => getParseQuestionPdfJobUncached(jobId));
}

async function getParseQuestionPdfJobUncached(jobId: string): Promise<ParseQuestionPdfJob> {
  const token = await authHeader();
  const url = `${SUPABASE_URL}/functions/v1/parse-question-pdf?jobId=${encodeURIComponent(jobId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (json as { error?: string; message?: string })?.error ||
      (json as { message?: string })?.message ||
      "Failed to read PDF parse job.";
    throw new Error(message);
  }
  const inner = unwrapEdgePayload<ParseQuestionPdfJob>(json);
  return {
    jobId: inner.jobId ?? jobId,
    status: String(inner.status ?? "queued"),
    questions: Array.isArray(inner.questions) ? inner.questions : [],
    count: typeof inner.count === "number" ? inner.count : 0,
    persistedToBank: inner.persistedToBank === true,
    error: inner.error ?? null,
    message: inner.message,
  };
}

/** Poll until completed/failed, or max polls. Does not invent questions. */
export async function pollParseQuestionPdfJob(
  jobId: string,
  options?: {
    shouldAbort?: () => boolean;
    maxPolls?: number;
    onStatus?: (job: ParseQuestionPdfJob) => void;
  },
): Promise<ParseQuestionPdfJob> {
  let current: ParseQuestionPdfJob = {
    jobId,
    status: "queued",
    questions: [],
    count: 0,
    message: "Parsing in background…",
  };
  const maxPolls = options?.maxPolls ?? DEFAULT_MAX_POLLS;

  current = await getParseQuestionPdfJob(jobId);
  options?.onStatus?.(current);
  if (TERMINAL.has(current.status)) return current;

  for (let polls = 0; polls < maxPolls; polls++) {
    if (options?.shouldAbort?.()) return current;
    await new Promise((r) => setTimeout(r, pollDelayMs(polls)));
    if (options?.shouldAbort?.()) return current;
    current = await getParseQuestionPdfJob(jobId);
    options?.onStatus?.(current);
    if (TERMINAL.has(current.status)) return current;
  }

  return {
    ...current,
    status: current.status === "completed" ? "completed" : "failed",
    error:
      current.error ||
      "PDF parsing is taking longer than expected. Credits stay reserved until it finishes — refresh and retry if this persists.",
    message: "PDF parsing timed out while polling.",
  };
}

export function isParseQuestionPdfQueuedPayload(payload: unknown): payload is {
  accepted: true;
  jobId: string;
  status: string;
} {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  return o.accepted === true && typeof o.jobId === "string" && o.jobId.length > 0;
}
