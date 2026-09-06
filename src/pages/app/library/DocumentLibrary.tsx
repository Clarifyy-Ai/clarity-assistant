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
import {
  canCreatePracticeSetFromParsedDoc,
  isAllowedLibraryMime,
} from "@/lib/library/documentRights";
import { createDocumentPracticeSet } from "@/lib/library/createDocumentPracticeSet";
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
  isClientWaitElapsed,
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
  documentJobChecklist,
  mapDocumentJobToProgress,
} from "@/lib/async/jobAdapters";
import { JobProgressCard } from "@/components/async/JobProgressCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/utils/fileUtils";
import { downloadFileName } from "@/lib/files/downloadFileName";
import { sanitizeFileName } from "@/lib/security/sanitizer";

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
  parsed_content?: string | null;
  content_hash?: string | null;
  parser_version?: string | null;
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
  const mapped = mapDocumentJobToProgress({
    id: "tmp",
    status: status ?? "uploaded",
  });
  if (status === "uploaded" || !status) return "Uploaded";
  return mapped.message?.replace(/…$/, "") || status || "Uploaded";
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

  const inflightDocIds = docs
    .filter((d) => isInFlightJobStatus(d.processing_status))
    .map((d) => d.id)
    .sort()
    .join(",");

  /** Resume existing jobs after refresh — same job id, never create duplicates. */
  useEffect(() => {
    if (!user?.id) return;
    if (!inflightDocIds) return;

    let cancelled = false;
    const inflightIds = inflightDocIds.split(",");

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

    async function syncInFlightOnce(opts?: { markResumed?: boolean }): Promise<void> {
      for (const documentId of inflightIds) {
        if (cancelled) continue;
        if (opts?.markResumed) {
          if (resumedDocsRef.current.has(documentId)) continue;
          resumedDocsRef.current.add(documentId);
        }
        try {
          const job = await findExistingJob(documentId);
          if (!job?.id) continue;
          rememberJobId(documentId, job.id);
          if (!isInFlightJobStatus(job.status)) {
            await syncDocFromJob(documentId, job);
            continue;
          }
          // Soft edge poll — confirms ownership and refreshes stage without create.
          const live = await getDocumentProcessingJob(job.id);
          if (live) {
            await syncDocFromJob(documentId, live);
          }
        } catch {
          if (opts?.markResumed) resumedDocsRef.current.delete(documentId);
        }
      }
      if (!cancelled) void load();
    }

    void syncInFlightOnce({ markResumed: true });

    const timer = window.setInterval(() => {
      if (!cancelled) void syncInFlightOnce();
    }, 8_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [inflightDocIds, load, user?.id]);

  async function processLibraryDocument(opts: {
    documentId: string;
    mimeType: string;
    contentHash: string;
    isRetry?: boolean;
  }) {
    // Stable idempotency — never mint a random key on retry (that double-charges).
    // Retries of failed_retryable jobs must use retryDocumentProcessingJob instead.
    const idempotencyKey = opts.isRetry
      ? `library-reprocess:${user?.id}:${opts.documentId}:${opts.contentHash}`
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
      // Enqueue-and-observe: durable job owns credits; UI progress + refresh sync status.
      // Soft-wait in background so upload is not blocked for the full lease window.
      void (async () => {
        try {
          const job = await pollDocumentJobUntilDone(created.jobId!);
          if (job && isClientWaitElapsed(job)) {
            await supabase.from("personal_library_documents").update({
              processing_status: libraryStatusFromJob(job.status),
              processing_error: null,
            }).eq("id", opts.documentId).eq("owner_id", user?.id);
            return;
          }
          if (job && isFailedJobStatus(job.status)) {
            await supabase.from("personal_library_documents").update({
              processing_status: job.status,
              processing_error: userFacingJobError(job),
            }).eq("id", opts.documentId).eq("owner_id", user?.id);
            return;
          }
          if (job && ["completed", "ready"].includes(job.status)) {
            await supabase.from("personal_library_documents").update({
              processing_status: "completed",
              processing_error: null,
            }).eq("id", opts.documentId).eq("owner_id", user?.id);
          }
        } catch {
          /* progress card + interval refresh remain source of truth */
        } finally {
          void load();
        }
      })();
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
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.DOCUMENTS)
        .download(doc.storage_path);
      if (error || !data) {
        toast.error(error?.message ?? "Download failed.");
        return;
      }
      downloadBlob(data, downloadFileName(doc.document_name, doc.storage_path));
      toast.success("Download started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.");
    }
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
    const hasParsed = Boolean(String(doc.parsed_content ?? "").trim());
    if (
      !canCreatePracticeSetFromParsedDoc({
        ownerId: user.id,
        viewerId: user.id,
        rightsConfirmed: doc.rights_confirmed,
        contentRights: doc.content_rights as LicenseType,
        processingStatus: doc.processing_status,
        hasParsedContent: hasParsed,
      })
    ) {
      toast.error(
        hasParsed
          ? "Confirm content rights before creating a practice set."
          : "Wait until document parsing completes before creating a practice set.",
      );
      return;
    }

    try {
      const result = await createDocumentPracticeSet({
        userId: user.id,
        documentId: doc.id,
        documentName: doc.document_name,
        contentRights: doc.content_rights as LicenseType,
        rightsConfirmed: doc.rights_confirmed,
        processingStatus: doc.processing_status,
        parsedContent: doc.parsed_content,
        contentHash: doc.content_hash,
        parserVersion: doc.parser_version,
      });
      if (result.reused) {
        toast.message(
          `Practice set already exists (${result.questionIds.length} questions).`,
        );
      } else {
        toast.success(
          `Practice set created with ${result.questionIds.length} questions in your Question Bank.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create practice set.");
    }
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
      // Prefer the durable retry helper so reserved credits are reused, not recharged.
      if (job?.id && job.status === "failed_retryable") {
        await retryDocumentProcessingJob(job.id);
        rememberJobId(doc.id, job.id);
        resumedDocsRef.current.delete(doc.id);
        await supabase.from("personal_library_documents").update({
          processing_status: "queued",
          processing_error: null,
        }).eq("id", doc.id).eq("owner_id", user?.id);
        toast.success("Retry queued.");
      } else if (job?.id && isInFlightJobStatus(job.status)) {
        toast.message("Processing already in progress for this document.");
      } else {
        // New job only after terminal cancel/permanent fail — stable key, one charge.
        await processLibraryDocument({
          documentId: doc.id,
          mimeType: mimeForDoc(doc.document_name, doc.mime_type),
          contentHash: `reprocess-${doc.id}`,
          isRetry: true,
        });
        toast.success("Document processing queued.");
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
        description="Upload documents you own or have permission to use. Career Pilot does not scrape copyrighted exam papers."
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
          const canPractice =
            Boolean(user?.id) &&
            canCreatePracticeSetFromParsedDoc({
              ownerId: user!.id,
              viewerId: user!.id,
              rightsConfirmed: doc.rights_confirmed,
              contentRights: doc.content_rights as LicenseType,
              processingStatus: doc.processing_status,
              hasParsedContent: Boolean(String(doc.parsed_content ?? "").trim()),
            });
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
                {isInFlightJobStatus(doc.processing_status) && (
                  <JobProgressCard
                    className="mt-3"
                    title="Document processing"
                    progress={mapDocumentJobToProgress({
                      id: doc.id,
                      status: doc.processing_status ?? "queued",
                      error_message: doc.processing_error,
                    })}
                    steps={documentJobChecklist(doc.processing_status)}
                    onCancel={() => void cancelProcessing(doc)}
                  />
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void download(doc)}>Download</Button>
                  {(doc.processing_status === "error" || isFailedJobStatus(doc.processing_status)) && (
                    <Button size="sm" variant="outline" onClick={() => void retryProcessing(doc)}>Retry processing</Button>
                  )}
                  {isInFlightJobStatus(doc.processing_status) && (
                    <Button size="sm" variant="outline" onClick={() => void cancelProcessing(doc)}>Cancel processing</Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canPractice}
                    title={
                      canPractice
                        ? "Generate practice questions from parsed content"
                        : "Available after parsing completes"
                    }
                    onClick={() => void createPracticeSet(doc)}
                  >
                    Create practice set
                  </Button>
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
