import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type DocumentJobState =
  | "queued"
  | "leased"
  | "downloading"
  | "extracting"
  | "OCR"
  | "segmenting"
  | "validating"
  | "awaiting_review"
  | "completed"
  | "failed_retryable"
  | "failed_permanent"
  | "cancelled"
  | string;

export type DocumentJob = {
  id: string;
  document_id?: string;
  status: DocumentJobState;
  error_code?: string | null;
  error_message?: string | null;
  error_stage?: string | null;
  retryable?: boolean;
  attempt_count?: number;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

const IN_FLIGHT = new Set([
  "queued",
  "leased",
  "downloading",
  "extracting",
  "OCR",
  "segmenting",
  "validating",
  "awaiting_review",
]);

export function isInFlightJobStatus(status: string | undefined): boolean {
  return Boolean(status && IN_FLIGHT.has(status));
}

export function isFailedJobStatus(status: string | undefined): boolean {
  return status === "failed_retryable" || status === "failed_permanent" || status === "error" || status === "failed";
}

export function userFacingJobError(job: Pick<DocumentJob, "error_code" | "error_message"> | null | undefined): string {
  const code = String(job?.error_code ?? "");
  if (code === "INSUFFICIENT_CREDITS") {
    return "Not enough credits to process this document.";
  }
  return job?.error_message || "Document processing failed. You can retry.";
}

type CreateJobResult = {
  jobId?: string;
  state?: string;
  pythonConfigured?: boolean;
  success?: boolean;
};

export async function createDocumentProcessingJob(opts: {
  documentId: string;
  idempotencyKey: string;
}): Promise<CreateJobResult> {
  return fetchEdgeJson<CreateJobResult>("create-document-processing-job", {
    documentId: opts.documentId,
    idempotencyKey: opts.idempotencyKey,
  });
}

export async function getDocumentProcessingJob(jobId: string): Promise<DocumentJob | null> {
  const data = await fetchEdgeJson<{ success?: boolean; job?: DocumentJob }>(
    "get-document-processing-job",
    { jobId },
  );
  return data.job ?? null;
}

export async function cancelDocumentProcessingJob(jobId: string): Promise<void> {
  await fetchEdgeJson("cancel-document-processing-job", { jobId });
}

export async function retryDocumentProcessingJob(jobId: string): Promise<void> {
  await fetchEdgeJson("retry-document-processing-job", { jobId });
}

export async function parseDocumentFallback(opts: {
  libraryDocumentId: string;
  mimeType: string;
  idempotencyKey: string;
}): Promise<void> {
  await fetchEdgeJson(
    "parse-document",
    {
      library_document_id: opts.libraryDocumentId,
      mime_type: opts.mimeType,
    },
    {
      timeoutMs: 90_000,
      headers: { "x-idempotency-key": opts.idempotencyKey },
    },
  );
}

export function shouldFallbackToSyncParse(err: unknown, created?: CreateJobResult | null): boolean {
  if (created && created.pythonConfigured === false) return true;
  if (!err) return false;
  if (err instanceof ApiClientError) {
    const code = String(err.code ?? "");
    return (
      err.status === 501 ||
      err.status === 503 ||
      code === "JOB_CREATE_FAILED" ||
      code === "PYTHON_UNAVAILABLE" ||
      code === "NOT_CONFIGURED"
    );
  }
  return false;
}

export async function pollDocumentJobUntilDone(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<DocumentJob | null> {
  const intervalMs = opts?.intervalMs ?? 2500;
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const started = Date.now();
  let last: DocumentJob | null = null;
  while (Date.now() - started < timeoutMs) {
    last = await getDocumentProcessingJob(jobId);
    if (!last || !isInFlightJobStatus(last.status)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}
