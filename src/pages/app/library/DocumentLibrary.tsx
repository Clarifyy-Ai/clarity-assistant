import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { UploadZone } from "@/components/common/UploadZone";
import { supabase, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { isAllowedLibraryMime } from "@/lib/library/documentRights";
import {
  LIBRARY_ACCEPT,
  LIBRARY_ACCEPT_LABEL,
  UNSUPPORTED_FORMAT_MESSAGE,
  validateDocumentFile,
} from "@/lib/documents/uploadValidation";
import { LICENSE_TYPES, type LicenseType } from "@/lib/content/license";
import { agentDebugIngest } from "@/lib/debug/agentIngest";
import {
  cancelDocumentProcessingJob,
  createDocumentProcessingJob,
  getDocumentProcessingJob,
  isFailedJobStatus,
  isInFlightJobStatus,
  libraryStatusFromJob,
  parseDocumentFallback,
  pollDocumentJobUntilDone,
  retryDocumentProcessingJob,
  shouldFallbackToSyncParse,
  userFacingJobError,
  userFacingDocumentError,
} from "@/lib/documents/processingJobs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  document_name: string;
  mime_type: string | null;
  storage_path: string | null;
  source: string | null;
  content_rights: string;
  rights_confirmed: boolean;
  processing_status?: string;
  processing_error?: string | null;
  created_at: string;
};

type StatusTone = "uploaded" | "queued" | "processing" | "completed" | "failed" | "cancelled";

function mimeForDoc(name: string, mime: string | null): string {
  const cleaned = String(mime ?? "").trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (cleaned && cleaned !== "application/octet-stream") return cleaned;
  return ({
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream");
}

function statusTone(status: string | undefined): StatusTone {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s || s === "uploaded") return "uploaded";
  if (s === "queued") return "queued";
  if (s === "completed" || s === "ready") return "completed";
  if (s === "cancelled" || s === "rejected") return "cancelled";
  if (isFailedJobStatus(status)) return "failed";
  if (isInFlightJobStatus(status)) return "processing";
  return "uploaded";
}

function statusLabel(status: string | undefined): string {
  switch (String(status ?? "").trim()) {
    case "":
    case "uploaded":
      return "Uploaded";
    case "queued":
      return "Queued";
    case "leased":
    case "downloading":
    case "extracting":
    case "OCR":
    case "ocr_required":
    case "ocr_processing":
    case "segmenting":
    case "structuring":
    case "processing":
    case "validating":
    case "awaiting_review":
      return "Processing";
    case "failed_retryable":
    case "error":
    case "failed":
      return "Failed — Retry";
    case "failed_permanent":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "ready":
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    default:
      return status ?? "Uploaded";
  }
}

const TONE_CLASS: Record<StatusTone, string> = {
  uploaded: "text-muted-foreground",
  queued: "text-amber-700 dark:text-amber-400",
  processing: "text-blue-700 dark:text-blue-400",
  completed: "text-emerald-700 dark:text-emerald-400",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

const JOB_STORAGE_PREFIX = "doc-processing-job:";

function rememberJobId(documentId: string, jobId: string): void {
  try {
    sessionStorage.setItem(`${JOB_STORAGE_PREFIX}${documentId}`, jobId);
  } catch {
    /* ignore quota / private mode */
  }
}

function recalledJobId(documentId: string): string | null {
  try {
    return sessionStorage.getItem(`${JOB_STORAGE_PREFIX}${documentId}`);
  } catch {
    return null;
  }
}

/** Active statuses on document_processing_jobs (CHECK constraint set). */
const ACTIVE_JOB_DB_STATUSES = [
  "queued",
  "leased",
  "downloading",
  "extracting",
  "OCR",
  "segmenting",
  "validating",
  "awaiting_review",
] as const;

export default function DocumentLibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [rights, setRights] = useState<LicenseType>("USER_OWNED");
  const [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState("personal");
  const [uploading, setUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const resumedDocsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("personal_library_documents")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setDocs((data as Doc[]) ?? []);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Resume existing jobs after refresh — same job id, never create duplicates. */
  useEffect(() => {
    if (!user?.id) return;
    const inflight = docs.filter((d) => isInFlightJobStatus(d.processing_status));
    if (!inflight.length) return;

    let cancelled = false;

    async function findExistingJob(documentId: string) {
      const remembered = recalledJobId(documentId);
      if (remembered) {
        const { data: byId } = await supabase
          .from("document_processing_jobs")
          .select("id, status, error_code, error_message")
          .eq("id", remembered)
          .eq("owner_id", user!.id)
          .maybeSingle();
        if (byId?.id) return byId;
      }
      const { data } = await supabase
        .from("document_processing_jobs")
        .select("id, status, error_code, error_message")
        .eq("document_id", documentId)
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    }

    async function syncDocFromJob(
      documentId: string,
      job: { id: string; status: string; error_code?: string | null; error_message?: string | null },
    ) {
      rememberJobId(documentId, job.id);
      const nextStatus = libraryStatusFromJob(job.status);
      await supabase
        .from("personal_library_documents")
        .update({
          processing_status: nextStatus,
          processing_error: isFailedJobStatus(job.status) ? userFacingJobError(job) : null,
        })
        .eq("id", documentId)
        .eq("owner_id", user!.id);
    }

    async function resumeOnce(): Promise<void> {
      for (const doc of inflight) {
        if (cancelled || resumedDocsRef.current.has(doc.id)) continue;
        resumedDocsRef.current.add(doc.id);
        try {
          const job = await findExistingJob(doc.id);
          if (!job?.id) continue;
          rememberJobId(doc.id, job.id);
          if (!isInFlightJobStatus(job.status)) {
            await syncDocFromJob(doc.id, job);
            continue;
          }
          // Soft edge poll — confirms ownership and refreshes status without create.
          const live = await getDocumentProcessingJob(job.id);
          if (live && !isInFlightJobStatus(live.status)) {
            await syncDocFromJob(doc.id, live);
          }
        } catch {
          resumedDocsRef.current.delete(doc.id);
        }
      }
      if (!cancelled) void load();
    }

    void resumeOnce();

    const timer = window.setInterval(() => {
      if (!cancelled) void load();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [docs, load, user?.id]);

  async function processLibraryDocument(opts: {
    documentId: string;
    mimeType: string;
    contentHash: string;
    isRetry?: boolean;
  }) {
    const idempotencyKey = opts.isRetry
      ? `library-retry:${opts.documentId}:${crypto.randomUUID()}`
      : `library-parse:${user?.id}:${opts.contentHash}`;
    let created: Awaited<ReturnType<typeof createDocumentProcessingJob>> | null = null;
    try {
      created = await createDocumentProcessingJob({
        documentId: opts.documentId,
        idempotencyKey,
      });
      if (created.jobId) {
        rememberJobId(opts.documentId, created.jobId);
        await supabase.from("personal_library_documents").update({
          processing_status: created.state || "queued",
          processing_error: null,
        }).eq("id", opts.documentId);
      }
      if (!created.jobId) {
        await parseDocumentFallback({
          libraryDocumentId: opts.documentId,
          mimeType: opts.mimeType,
          idempotencyKey,
        });
        return;
      }
      const job = await pollDocumentJobUntilDone(created.jobId);
      if (job && isFailedJobStatus(job.status)) {
        await supabase.from("personal_library_documents").update({
          processing_status: job.status,
          processing_error: userFacingJobError(job),
        }).eq("id", opts.documentId).eq("owner_id", user?.id);
        throw new Error(userFacingJobError(job));
      }
      if (job && ["completed", "ready"].includes(job.status)) {
        await supabase.from("personal_library_documents").update({
          processing_status: "completed",
          processing_error: null,
        }).eq("id", opts.documentId).eq("owner_id", user?.id);
      }
    } catch (err) {
      // Never fall back after a durable job was created: that job owns the
      // credit reservation and remains the single source of truth.
      if (!created?.jobId && shouldFallbackToSyncParse(err)) {
        await parseDocumentFallback({
          libraryDocumentId: opts.documentId,
          mimeType: opts.mimeType,
          idempotencyKey: `${idempotencyKey}:sync`,
        });
        return;
      }
      throw err;
    }
  }

  async function resumeExistingDocumentJob(doc: Doc): Promise<boolean> {
    const { data: job } = await supabase
      .from("document_processing_jobs")
      .select("id, status, error_code, error_message")
      .eq("document_id", doc.id)
      .eq("owner_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job?.id) return false;
    rememberJobId(doc.id, job.id);
    if (isInFlightJobStatus(job.status)) {
      toast.message("Processing already in progress for this document.");
      void load();
      return true;
    }
    if (isFailedJobStatus(job.status)) {
      toast.message("This document already failed processing. Use Retry if available.");
      void load();
      return true;
    }
    if (job.status === "completed" || job.status === "ready") {
      await supabase.from("personal_library_documents").update({
        processing_status: "completed",
        processing_error: null,
      }).eq("id", doc.id).eq("owner_id", user?.id);
      toast.message("This document is already in your library.");
      void load();
      return true;
    }
    return false;
  }

  async function upload(file: File) {
    if (!user?.id) return;
    if (!confirmed) {
      toast.error("Confirm you have permission to use this file.");
      return;
    }
    setSelectedName(`${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`);
    const validationError = validateDocumentFile(file, "library");
    if (
      validationError ||
      (!isAllowedLibraryMime(file.type) && !/\.(pdf|docx|txt|csv|xlsx)$/i.test(file.name))
    ) {
      toast.error(validationError ?? UNSUPPORTED_FORMAT_MESSAGE);
      return;
    }
    setUploading(true);
    try {
    const bytes = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const { data: duplicate } = await supabase
      .from("personal_library_documents")
      .select("id, document_name, processing_status")
      .eq("owner_id", user.id)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (duplicate) {
      const resumed = await resumeExistingDocumentJob(duplicate as Doc);
      if (!resumed) {
        toast.message("This document is already in your library. Reusing it without another upload or charge.");
        void load();
      }
      setUploading(false);
      return;
    }
    const path = `${user.id}/library/${contentHash}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).upload(path, file);
    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`);
      setUploading(false);
      return;
    }
      try {
      const resolvedMime = mimeForDoc(file.name, file.type);
      agentDebugIngest({
        sessionId: "fcd48a",
        runId: "prompt05",
        hypothesisId: "DOC-MIME",
        location: "DocumentLibrary.tsx:upload",
        message: "resolved library mime before insert",
        data: {
          name: file.name,
          rawType: file.type || null,
          resolvedMime,
          size: file.size,
        },
      });
      const { error } = await supabase.from("personal_library_documents").insert({
        owner_id: user.id,
        uploaded_by: user.id,
        document_name: file.name,
        // Windows/browsers often leave file.type empty — persist extension-resolved MIME
        // so create-document-processing-job does not 422 UNSUPPORTED_DOCUMENT_TYPE.
        mime_type: resolvedMime,
        storage_path: path,
        source,
        content_rights: rights,
        rights_confirmed: confirmed,
        content_hash: contentHash,
        file_size_bytes: file.size,
        file_category: "library",
        processing_status: "uploaded",
      });
      if (error) {
        await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).remove([path]);
        toast.error(`Upload could not be saved: ${error.message}`);
      } else {
        try {
          const inserted = await supabase
            .from("personal_library_documents")
            .select("id")
            .eq("owner_id", user.id)
            .eq("storage_path", path)
            .single();
          if (inserted.data?.id) {
            void load();
            await processLibraryDocument({
              documentId: inserted.data.id,
              mimeType: resolvedMime,
              contentHash,
            });
          }
          toast.success("Document uploaded. Processing will continue if you refresh.");
        } catch (parseError) {
          toast.warning(`Uploaded, but processing needs a retry: ${userFacingDocumentError(parseError)}`);
        }
        void load();
      }
      } catch (error) {
        await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).remove([path]);
        toast.error(`Upload could not be saved: ${error instanceof Error ? error.message : "Please try again."}`);
      }
    } catch (error) {
      toast.error(`Upload failed: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setUploading(false);
    }
  }

  async function download(doc: Doc) {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) toast.error(error?.message ?? "Download failed.");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(doc: Doc) {
    const { data: activeJob } = await supabase
      .from("document_processing_jobs")
      .select("id, status")
      .eq("document_id", doc.id)
      .eq("owner_id", user?.id ?? "")
      .in("status", [...ACTIVE_JOB_DB_STATUSES])
      .maybeSingle();
    if (activeJob?.id) {
      try {
        await cancelDocumentProcessingJob(activeJob.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not cancel document processing.");
        return;
      }
    }
    if (doc.storage_path) await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).remove([doc.storage_path]);
    const { error } = await supabase.from("personal_library_documents").delete().eq("id", doc.id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function createPracticeSet(doc: Doc) {
    if (!user?.id) return;
    if (!doc.rights_confirmed) {
      toast.error("Confirm content rights before creating a practice set.");
      return;
    }

    const { error } = await supabase.from("document_practice_sets").insert({
      document_id: doc.id,
      owner_id: user.id,
      title: `Practice from ${doc.document_name}`,
      question_ids: [],
    });
    if (error) toast.error(error.message);
    else toast.success("Practice set created. Add original questions in Question Bank, then attach them here.");
  }

  async function retryProcessing(doc: Doc) {
    if (!doc.storage_path) return;
    try {
      const { data: job } = await supabase
        .from("document_processing_jobs")
        .select("id, status")
        .eq("document_id", doc.id)
        .eq("owner_id", user?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (job?.id && job.status === "failed_retryable") {
        await retryDocumentProcessingJob(job.id);
        rememberJobId(doc.id, job.id);
        resumedDocsRef.current.delete(doc.id);
        await supabase.from("personal_library_documents").update({
          processing_status: "queued",
          processing_error: null,
        }).eq("id", doc.id).eq("owner_id", user?.id);
        toast.success("Retry queued.");
      } else {
        await processLibraryDocument({
          documentId: doc.id,
          mimeType: mimeForDoc(doc.document_name, doc.mime_type),
          contentHash: `retry-${doc.id}`,
          isRetry: true,
        });
        toast.success("Document processing completed.");
      }
      void load();
    } catch (error) {
      toast.error(userFacingDocumentError(error));
      void load();
    }
  }

  async function cancelProcessing(doc: Doc) {
    const remembered = recalledJobId(doc.id);
    let jobId = remembered;
    let jobStatus: string | undefined;
    if (jobId) {
      const { data } = await supabase
        .from("document_processing_jobs")
        .select("id, status")
        .eq("id", jobId)
        .eq("owner_id", user?.id ?? "")
        .maybeSingle();
      jobId = data?.id ?? null;
      jobStatus = data?.status;
    }
    if (!jobId) {
      const { data: job } = await supabase
        .from("document_processing_jobs")
        .select("id, status")
        .eq("document_id", doc.id)
        .eq("owner_id", user?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      jobId = job?.id ?? null;
      jobStatus = job?.status;
    }
    if (!jobId || !isInFlightJobStatus(jobStatus)) {
      toast.error("No in-progress job to cancel.");
      return;
    }
    try {
      await cancelDocumentProcessingJob(jobId);
      await supabase.from("personal_library_documents").update({
        processing_status: "cancelled",
        processing_error: null,
      }).eq("id", doc.id).eq("owner_id", user?.id);
      toast.success("Processing cancelled.");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel processing.");
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Personal Document Library"
        description="Upload documents you own or have permission to use. Clarify does not scrape copyrighted exam papers."
        breadcrumbs={[{ label: "Dashboard", href: "/app/dashboard" }, { label: "Document Library" }]}
      />
      <Card className="mb-4 space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I confirm I own this material or have permission to use it for personal practice.
        </label>
        <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" />
        <Select value={rights} onValueChange={(v) => setRights(v as LicenseType)}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LICENSE_TYPES.filter((l) => l !== "UNKNOWN").map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UploadZone
          title="Choose file"
          description={`${LIBRARY_ACCEPT_LABEL}. Images and legacy .doc files are not supported.`}
          accept={LIBRARY_ACCEPT}
          disabled={!confirmed}
          loading={uploading}
          onFileSelect={(files) => {
            const file = files[0];
            if (file) void upload(file);
          }}
        />
        {selectedName && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Selected: {selectedName}
          </p>
        )}
      </Card>
      <ul className="space-y-2">
        {docs.map((doc) => {
          const tone = statusTone(doc.processing_status);
          return (
            <li key={doc.id}>
              <Card className="min-w-0">
                <p className="font-medium break-words">{doc.document_name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.content_rights} · {doc.source} ·{" "}
                  <span className={cn("font-medium", TONE_CLASS[tone])} data-status={tone}>
                    {statusLabel(doc.processing_status)}
                  </span>
                  {" · "}
                  {new Date(doc.created_at).toLocaleString()}
                </p>
                {doc.processing_error && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {doc.processing_error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void download(doc)}>Download</Button>
                  {(doc.processing_status === "error" || isFailedJobStatus(doc.processing_status)) && (
                    <Button size="sm" variant="outline" onClick={() => void retryProcessing(doc)}>Retry processing</Button>
                  )}
                  {isInFlightJobStatus(doc.processing_status) && (
                    <Button size="sm" variant="outline" onClick={() => void cancelProcessing(doc)}>Cancel processing</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void createPracticeSet(doc)}>Create practice set</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(doc)}>Delete</Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
