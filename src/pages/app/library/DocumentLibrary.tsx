import { useCallback, useEffect, useState } from "react";
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
import {
  cancelDocumentProcessingJob,
  createDocumentProcessingJob,
  isFailedJobStatus,
  isInFlightJobStatus,
  parseDocumentFallback,
  pollDocumentJobUntilDone,
  retryDocumentProcessingJob,
  shouldFallbackToSyncParse,
  userFacingJobError,
} from "@/lib/documents/processingJobs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function mimeForDoc(name: string, mime: string | null): string {
  if (mime) return mime;
  return ({
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream");
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "leased":
    case "downloading":
    case "extracting":
    case "OCR":
    case "segmenting":
    case "processing":
    case "validating":
    case "awaiting_review":
      return "Processing…";
    case "failed_retryable":
      return "Failed — Retry";
    case "failed_permanent":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "ready":
    case "completed":
      return "Completed";
    case "error":
    case "failed":
      return "Failed — Retry";
    case "rejected":
      return "Rejected";
    default:
      return status ?? "Uploaded";
  }
}

export default function DocumentLibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [rights, setRights] = useState<LicenseType>("USER_OWNED");
  const [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState("personal");
  const [uploading, setUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

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

  useEffect(() => {
    const inflight = docs.filter((d) => isInFlightJobStatus(d.processing_status));
    if (!inflight.length) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (!cancelled) void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [docs, load]);

  async function processLibraryDocument(opts: {
    documentId: string;
    mimeType: string;
    contentHash: string;
    isRetry?: boolean;
  }) {
    const idempotencyKey = opts.isRetry
      ? `library-retry:${opts.documentId}:${crypto.randomUUID()}`
      : `library-parse:${user?.id}:${opts.contentHash}`;
    try {
      const created = await createDocumentProcessingJob({
        documentId: opts.documentId,
        idempotencyKey,
      });
      if (created.jobId) {
        await supabase.from("personal_library_documents").update({
          processing_status: created.state || "queued",
          processing_error: null,
        }).eq("id", opts.documentId);
      }
      if (shouldFallbackToSyncParse(null, created) || !created.jobId) {
        await parseDocumentFallback({
          libraryDocumentId: opts.documentId,
          mimeType: opts.mimeType,
          idempotencyKey,
        });
        return;
      }
      const job = await pollDocumentJobUntilDone(created.jobId);
      if (job && isFailedJobStatus(job.status)) {
        throw new Error(userFacingJobError(job));
      }
    } catch (err) {
      if (shouldFallbackToSyncParse(err)) {
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
      toast.message("This document is already in your library. Reusing it without another upload or charge.");
      void load();
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
      const { error } = await supabase.from("personal_library_documents").insert({
        owner_id: user.id,
        uploaded_by: user.id,
        document_name: file.name,
        mime_type: file.type,
        storage_path: path,
        source,
        content_rights: rights,
        rights_confirmed: confirmed,
        content_hash: contentHash,
        file_size_bytes: file.size,
        file_category: "library",
        processing_status: "queued",
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
            await processLibraryDocument({
              documentId: inserted.data.id,
              mimeType: mimeForDoc(file.name, file.type),
              contentHash,
            });
          }
          toast.success("Document uploaded. Processing will continue if you refresh.");
        } catch (parseError) {
          toast.warning(parseError instanceof Error
            ? `Uploaded, but processing needs a retry: ${parseError.message}`
            : "Uploaded, but processing needs a retry.");
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
      toast.error(error instanceof Error ? error.message : "Document processing failed.");
      void load();
    }
  }

  async function cancelProcessing(doc: Doc) {
    const { data: job } = await supabase
      .from("document_processing_jobs")
      .select("id, status")
      .eq("document_id", doc.id)
      .eq("owner_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job?.id || !isInFlightJobStatus(job.status)) {
      toast.error("No in-progress job to cancel.");
      return;
    }
    try {
      await cancelDocumentProcessingJob(job.id);
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
        {docs.map((doc) => (
          <li key={doc.id}>
            <Card className="min-w-0">
              <p className="font-medium break-words">{doc.document_name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.content_rights} · {doc.source} · {statusLabel(doc.processing_status)} ·{" "}
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
        ))}
      </ul>
    </div>
  );
}
