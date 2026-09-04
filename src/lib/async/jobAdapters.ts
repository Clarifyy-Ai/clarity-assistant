/**
 * Domain → JobProgress adapters. Stages from backend only; progress optional.
 */

import {
  coerceRealProgress,
  normalizeJobStatus,
  type JobProgress,
  type JobStageStep,
} from "@/lib/async/jobProgress";
import {
  PAPER_JOB_UI_STATES,
  mapProgressToUiState,
  paperJobStageLabel,
  type PaperJobUiState,
} from "@/lib/gov-exam/paperJobStatus";
import {
  isFailedJobStatus,
  isInFlightJobStatus,
  userFacingJobError,
  type DocumentJob,
} from "@/lib/documents/processingJobs";
import type { CompanyBriefJob } from "@/lib/company/companyResearchJob";
import type { SessionDebriefJob } from "@/lib/debrief/debriefJob";

function isoNow(): string {
  return new Date().toISOString();
}

export const PAPER_CHECKLIST_STEPS: Array<{ id: PaperJobUiState; label: string }> = [
  { id: "CHECKING", label: "Checking availability" },
  { id: "QUEUED", label: "Queued" },
  { id: "GENERATING", label: "Selecting / generating questions" },
  { id: "VALIDATING", label: "Validating paper" },
  { id: "READY", label: "Finalizing" },
];

export function mapPaperJobToProgress(job: {
  jobId?: string;
  id?: string;
  status?: string | null;
  progressStage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
}): JobProgress {
  const jobId = String(job.jobId ?? job.id ?? "");
  const ui = mapProgressToUiState(job.progressStage, job.status);
  const status = normalizeJobStatus(
    ui === "FAILED_RETRYABLE" || ui === "FAILED_PERMANENT"
      ? "failed"
      : ui === "CANCELLED"
        ? "cancelled"
        : ui === "READY"
          ? "completed"
          : ui === "QUEUED"
            ? "queued"
            : "processing",
  );
  return {
    jobId,
    status,
    stage: String(job.progressStage ?? job.status ?? ui).toLowerCase(),
    message: paperJobStageLabel(job.progressStage, job.status),
    startedAt: job.createdAt ?? isoNow(),
    updatedAt: job.updatedAt ?? isoNow(),
    completedAt: job.completedAt ?? undefined,
    errorCode: job.errorCode ?? undefined,
    errorMessage: job.errorMessage ?? undefined,
    retryable:
      ui === "FAILED_PERMANENT"
        ? false
        : ui === "FAILED_RETRYABLE"
          ? true
          : job.retryable ?? undefined,
    cancelled: ui === "CANCELLED",
  };
}

export function paperJobChecklist(
  progressStage: string | null | undefined,
  status: string | null | undefined,
): JobStageStep[] {
  const ui = mapProgressToUiState(progressStage, status);
  const order = [...PAPER_JOB_UI_STATES];
  const activeIdx = order.indexOf(ui as (typeof PAPER_JOB_UI_STATES)[number]);
  const failed = ui === "FAILED_RETRYABLE" || ui === "FAILED_PERMANENT";
  const cancelled = ui === "CANCELLED";

  return PAPER_CHECKLIST_STEPS.map((step, index) => {
    if (cancelled && index === 0) {
      return { id: step.id, label: step.label, state: "cancelled" as const };
    }
    if (ui === "READY") {
      return { id: step.id, label: step.label, state: "done" as const };
    }
    if (failed) {
      if (activeIdx >= 0 && index < activeIdx) {
        return { id: step.id, label: step.label, state: "done" as const };
      }
      if (index === Math.max(activeIdx, 0)) {
        return { id: step.id, label: step.label, state: "failed" as const };
      }
      return { id: step.id, label: step.label, state: "pending" as const };
    }
    if (activeIdx < 0) {
      return {
        id: step.id,
        label: step.label,
        state: index === 0 ? "active" : "pending",
      };
    }
    if (index < activeIdx) {
      return { id: step.id, label: step.label, state: "done" as const };
    }
    if (index === activeIdx) {
      return { id: step.id, label: step.label, state: "active" as const };
    }
    return { id: step.id, label: step.label, state: "pending" as const };
  });
}

const DOC_STAGE_LABEL: Record<string, string> = {
  queued: "Queued for processing…",
  leased: "Starting document processing…",
  downloading: "Downloading document…",
  extracting: "Extracting content…",
  OCR: "Running OCR…",
  ocr_required: "OCR required…",
  ocr_processing: "Running OCR…",
  segmenting: "Parsing sections…",
  structuring: "Structuring information…",
  processing: "Processing document…",
  validating: "Validating extracted profile…",
  awaiting_review: "Ready for review…",
  completed: "Processing complete",
  ready: "Processing complete",
  failed_retryable: "Processing failed — you can retry",
  failed_permanent: "Processing failed",
  cancelled: "Cancelled",
};

export const DOCUMENT_CHECKLIST: Array<{ id: string; label: string }> = [
  { id: "queued", label: "Queued" },
  { id: "extracting", label: "Extracting content" },
  { id: "OCR", label: "OCR / reading" },
  { id: "segmenting", label: "Parsing sections" },
  { id: "structuring", label: "Building profile" },
  { id: "completed", label: "Complete" },
];

export function mapDocumentJobToProgress(job: DocumentJob): JobProgress {
  const statusRaw = String(job.status ?? "");
  let status = normalizeJobStatus(statusRaw);
  if (isInFlightJobStatus(statusRaw) && status === "queued" && statusRaw !== "queued") {
    status = "processing";
  }
  if (isFailedJobStatus(statusRaw)) status = "failed";
  const stage = statusRaw || "queued";
  return {
    jobId: job.id,
    status,
    stage,
    message: DOC_STAGE_LABEL[stage] ?? DOC_STAGE_LABEL.processing,
    startedAt: job.created_at ?? isoNow(),
    updatedAt: job.updated_at ?? isoNow(),
    completedAt: job.completed_at ?? undefined,
    errorCode: job.error_code ?? undefined,
    errorMessage: userFacingJobError(job),
    retryable: job.retryable ?? statusRaw === "failed_retryable",
    cancelled: statusRaw === "cancelled",
  };
}

export function documentJobChecklist(status: string | undefined): JobStageStep[] {
  const s = String(status ?? "queued");
  const failed = isFailedJobStatus(s);
  const done = s === "completed" || s === "ready";
  const order = DOCUMENT_CHECKLIST.map((d) => d.id);
  let activeIdx = order.findIndex((id) => {
    if (id === "extracting") return ["downloading", "extracting", "leased"].includes(s);
    if (id === "OCR") return ["OCR", "ocr_required", "ocr_processing"].includes(s);
    if (id === "segmenting") return s === "segmenting";
    if (id === "structuring") {
      return ["structuring", "processing", "validating", "awaiting_review"].includes(s);
    }
    return id === s;
  });
  if (done) activeIdx = order.length - 1;
  if (activeIdx < 0) activeIdx = 0;

  return DOCUMENT_CHECKLIST.map((step, index) => {
    if (done) return { id: step.id, label: step.label, state: "done" as const };
    if (failed) {
      return {
        id: step.id,
        label: step.label,
        state: index === activeIdx ? "failed" : index < activeIdx ? "done" : "pending",
      };
    }
    if (index < activeIdx) return { id: step.id, label: step.label, state: "done" as const };
    if (index === activeIdx) return { id: step.id, label: step.label, state: "active" as const };
    return { id: step.id, label: step.label, state: "pending" as const };
  });
}

export const COMPANY_STAGE_LABEL: Record<string, string> = {
  queued: "Preparing company profile…",
  preparing: "Preparing company profile…",
  collecting: "Collecting company information…",
  analyzing: "Analyzing interview patterns…",
  talking_points: "Preparing interview talking points…",
  generating: "Generating AI brief…",
  processing: "Generating AI brief…",
  finalizing: "Finalizing company brief…",
  saving: "Saving company brief…",
  completed: "Company brief ready",
  failed: "Company research failed",
  cancelled: "Cancelled",
};

export function mapCompanyBriefJobToProgress(job: CompanyBriefJob): JobProgress {
  const stage = String(job.progressStage ?? job.status ?? "queued");
  return {
    jobId: job.jobId,
    status: normalizeJobStatus(job.status),
    stage,
    message:
      COMPANY_STAGE_LABEL[stage] ??
      COMPANY_STAGE_LABEL[String(job.status)] ??
      job.message ??
      "Generating AI brief…",
    startedAt: isoNow(),
    updatedAt: isoNow(),
    errorCode: job.errorCode ?? undefined,
    errorMessage: job.errorMessage ?? undefined,
    retryable: job.retryable,
    cancelled: job.status === "cancelled",
  };
}

export const DEBRIEF_STAGE_LABEL: Record<string, string> = {
  queued: "Queued debrief…",
  analyzing: "Analyzing your session…",
  strengths: "Identifying strengths…",
  improvements: "Finding improvement areas…",
  generating: "Preparing your debrief…",
  processing: "Preparing your debrief…",
  saving: "Saving debrief…",
  completed: "Debrief ready",
  failed: "Debrief failed",
  cancelled: "Cancelled",
};

export const DEBRIEF_CHECKLIST: Array<{ id: string; label: string }> = [
  { id: "queued", label: "Queued" },
  { id: "analyzing", label: "Analyzing session" },
  { id: "strengths", label: "Identifying strengths" },
  { id: "improvements", label: "Finding improvements" },
  { id: "generating", label: "Preparing debrief" },
  { id: "completed", label: "Complete" },
];

export function mapDebriefJobToProgress(job: SessionDebriefJob): JobProgress {
  const stage = String(job.progressStage ?? job.status ?? "queued");
  return {
    jobId: job.jobId,
    status: normalizeJobStatus(job.status),
    stage,
    message:
      DEBRIEF_STAGE_LABEL[stage] ??
      DEBRIEF_STAGE_LABEL[String(job.status)] ??
      job.message ??
      "Preparing your debrief…",
    startedAt: isoNow(),
    updatedAt: isoNow(),
    errorCode: job.errorCode ?? undefined,
    errorMessage: job.errorMessage ?? undefined,
    retryable: job.retryable,
    cancelled: job.status === "cancelled",
  };
}

export function debriefJobChecklist(progressStage: string | null | undefined, status: string | null | undefined): JobStageStep[] {
  const stage = String(progressStage ?? status ?? "queued").toLowerCase();
  const failed = stage === "failed" || status === "failed";
  const done = stage === "completed" || status === "completed";
  const order = DEBRIEF_CHECKLIST.map((d) => d.id);
  let activeIdx = order.indexOf(stage);
  if (stage === "processing" || stage === "saving") activeIdx = order.indexOf("generating");
  if (done) activeIdx = order.length - 1;
  if (activeIdx < 0) activeIdx = 0;

  return DEBRIEF_CHECKLIST.map((step, index) => {
    if (done) return { id: step.id, label: step.label, state: "done" as const };
    if (failed) {
      return {
        id: step.id,
        label: step.label,
        state: index === activeIdx ? "failed" : index < activeIdx ? "done" : "pending",
      };
    }
    if (index < activeIdx) return { id: step.id, label: step.label, state: "done" as const };
    if (index === activeIdx) return { id: step.id, label: step.label, state: "active" as const };
    return { id: step.id, label: step.label, state: "pending" as const };
  });
}

/** Attach real upload percent when browser reports bytes. */
export function withUploadProgress(
  base: JobProgress,
  percent: number | undefined,
): JobProgress {
  const progress = coerceRealProgress(percent);
  if (progress === undefined) return base;
  return { ...base, progress, message: base.message ?? `Uploading… ${progress}%` };
}
