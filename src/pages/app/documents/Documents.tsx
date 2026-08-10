// src/pages/app/documents/Documents.tsx
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { toast } from "sonner";
import { jobDescriptionsDB, documentsDB, resumesDB } from "@/lib/supabase/database";
import { getSignedUrl, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { documentParseIdempotencyKey } from "@/lib/network/idempotency";
import { useDocumentStore } from "@/store/documentStore";
import { useDocumentManager } from "@/hooks/useDocumentManager";
import { sanitizeFileName } from "@/lib/security/sanitizer";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { UploadZone } from "@/components/common/UploadZone";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  DocumentSearchBar,
  DocumentPagination,
  useDocumentListState,
} from "@/components/documents/DocumentListControls";
import {
  FileText, Trash2, RefreshCw, Eye,
  Plus, Star, ClipboardList, Link2, Download, Pencil,
  LayoutGrid, Table2, ArrowUpDown, X,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";

const MAX_UPLOAD_QUEUE = 5;

type UploadQueueItem = {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error" | "cancelled";
  error?: string;
};

type ResumeViewMode = "cards" | "table";
type ResumeSortKey = "name" | "type" | "size" | "date" | "status";

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
import { format } from "date-fns";
import {
  getResumeParseStatus,
  parseResumeContentString,
} from "@/lib/documents/resumeParse";
import type { ParsedResume } from "@/types/ai.types";

// ─── File validation ─────────────────────────────────────────────────────────

const FILE_LIMITS = {
  resume: { maxMB: 10, types: [".pdf", ".docx", ".doc", ".txt"] },
  jd: { maxMB: 5, types: [".pdf", ".docx", ".doc", ".txt"] },
  cover_letter: { maxMB: 5, types: [".pdf", ".docx", ".doc", ".txt"] },
  portfolio: { maxMB: 15, types: [".pdf", ".docx", ".doc", ".txt", ".html"] },
} as const;

function validateFile(
  file: File,
  category: keyof typeof FILE_LIMITS
): string | null {
  const { maxMB, types } = FILE_LIMITS[category];
  if (file.size > maxMB * 1024 * 1024) {
    return `File too large. Maximum size is ${maxMB} MB.`;
  }
  const safeName = sanitizeFileName(file.name);
  if (!safeName || safeName.length === 0) {
    return "Invalid file name.";
  }
  const ext = `.${safeName.split(".").pop()?.toLowerCase()}`;
  if (!types.includes(ext as never) && !(types as readonly string[]).includes(ext)) {
    return `Unsupported file type. Allowed: ${types.join(", ")}`;
  }
  return null;
}

// ─── URL validation helper ────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Documents() {
  const { isLoading, loadError, reload } = useDocumentManager();

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Documents"
        description="Manage your resume and job descriptions for AI context"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Documents" },
        ]}
      />
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => reload()} />
      )}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
      <Tabs defaultValue="resumes">
        <TabsList>
          <TabsTrigger value="resumes"><span aria-hidden="true">📄 </span>Resumes</TabsTrigger>
          <TabsTrigger value="jds"><span aria-hidden="true">📋 </span>Job Descriptions</TabsTrigger>
          <TabsTrigger value="cover_letter"><span aria-hidden="true">✉️ </span>Cover Letter</TabsTrigger>
          <TabsTrigger value="portfolio"><span aria-hidden="true">💼 </span>Portfolio</TabsTrigger>
        </TabsList>
        <TabsContent value="resumes"><ResumeManager /></TabsContent>
        <TabsContent value="jds"><JDManager /></TabsContent>
        <TabsContent value="cover_letter"><CoverLetterManager /></TabsContent>
        <TabsContent value="portfolio"><PortfolioManager /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ResumeManager
// ─────────────────────────────────────────────────────────────────────────────

function guessMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  return "text/plain";
}

function ResumeManager() {
  const navigate = useNavigate();
  const docStore = useDocumentStore();
  const docMgr   = useDocumentManager({ skipInitialLoad: true });

  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [viewMode, setViewMode] = useState<ResumeViewMode>("cards");
  const [sortKey, setSortKey] = useState<ResumeSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [renameId,  setRenameId]  = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming,  setRenaming]  = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [retrying,  setRetrying]  = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const cancelledUploadsRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);

  const resumes = docStore.resumes;
  const isParsingGlobal = docMgr.isParsing;
  const uploading = uploadQueue.some((item) => item.status === "pending" || item.status === "uploading");
  const { pageItems, totalPages, total, safePage } = useDocumentListState(resumes, search, page);

  const sortedPageItems = useMemo(() => {
    const items = [...pageItems];
    const dir = sortDir === "asc" ? 1 : -1;

    items.sort((a, b) => {
      const rowA = a as { title?: string; name?: string; created_at: string; content?: string | null; file_size_bytes?: number };
      const rowB = b as { title?: string; name?: string; created_at: string; content?: string | null; file_size_bytes?: number };

      switch (sortKey) {
        case "name":
          return dir * (rowA.title || rowA.name || "").localeCompare(rowB.title || rowB.name || "");
        case "type":
          return dir * "Resume".localeCompare("Resume");
        case "size":
          return dir * ((rowA.file_size_bytes ?? 0) - (rowB.file_size_bytes ?? 0));
        case "status": {
          const statusA = getResumeParseStatus(rowA.content, isParsingGlobal);
          const statusB = getResumeParseStatus(rowB.content, isParsingGlobal);
          return dir * statusA.localeCompare(statusB);
        }
        case "date":
        default:
          return dir * (new Date(rowA.created_at).getTime() - new Date(rowB.created_at).getTime());
      }
    });

    return items;
  }, [pageItems, sortKey, sortDir, isParsingGlobal]);

  const toggleSort = useCallback((key: ResumeSortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "name" ? "asc" : "desc");
      return key;
    });
  }, []);

  const processUploadQueue = useCallback(async (item: UploadQueueItem) => {
    setUploadQueue((queue) =>
      queue.map((entry) =>
        entry.id === item.id ? { ...entry, status: "uploading", progress: 15 } : entry,
      ),
    );

    const progressTimer = window.setInterval(() => {
      setUploadQueue((queue) =>
        queue.map((entry) =>
          entry.id === item.id && entry.status === "uploading" && entry.progress < 90
            ? { ...entry, progress: Math.min(entry.progress + 8, 90) }
            : entry,
        ),
      );
    }, 300);

    const { resumeId, error } = await docMgr.uploadResume(item.file);
    window.clearInterval(progressTimer);

    if (cancelledUploadsRef.current.has(item.id)) {
      setUploadQueue((queue) =>
        queue.map((entry) =>
          entry.id === item.id ? { ...entry, status: "cancelled", progress: 0 } : entry,
        ),
      );
      return;
    }

    setUploadQueue((queue) =>
      queue.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              status: error ? "error" : "done",
              progress: error ? entry.progress : 100,
              error: error ?? undefined,
            }
          : entry,
      ),
    );

    if (error) {
      toast.error(`${item.file.name}: ${error}`);
      return;
    }

    toast.success("Document uploaded — opening parsed resume…");
    if (resumeId) {
      navigate(`/app/documents/resume/${resumeId}`);
    }
  }, [docMgr, navigate]);

  useEffect(() => {
    const pending = uploadQueue.find(
      (item) => item.status === "pending" && !cancelledUploadsRef.current.has(item.id),
    );
    if (!pending || processingRef.current) return;

    processingRef.current = true;
    void processUploadQueue(pending).finally(() => {
      processingRef.current = false;
    });
  }, [uploadQueue, processUploadQueue]);

  useEffect(() => {
    if (!uploadQueue.length) return;
    const allSettled = uploadQueue.every(
      (item) => item.status === "done" || item.status === "error" || item.status === "cancelled",
    );
    if (allSettled) {
      const timer = window.setTimeout(() => setUploadQueue([]), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [uploadQueue]);

  const enqueueFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const activeCount = uploadQueue.filter(
      (item) => item.status === "pending" || item.status === "uploading",
    ).length;
    const room = MAX_UPLOAD_QUEUE - activeCount;

    if (room <= 0) {
      toast.error(`Upload queue full (max ${MAX_UPLOAD_QUEUE} files).`);
      return;
    }

    const batch = incoming.slice(0, room);
    if (incoming.length > room) {
      toast.warning(`Only ${room} file(s) added — queue limit is ${MAX_UPLOAD_QUEUE}.`);
    }

    const newItems: UploadQueueItem[] = [];
    for (const file of batch) {
      const error = validateFile(file, "resume");
      if (error) {
        toast.error(`${file.name}: ${error}`);
        continue;
      }
      newItems.push({
        id: generateId(),
        file,
        progress: 0,
        status: "pending",
      });
    }

    if (newItems.length) {
      setUploadQueue((queue) => [...queue, ...newItems]);
    }
  }, [uploadQueue]);

  function cancelUpload(itemId: string) {
    cancelledUploadsRef.current.add(itemId);
    setUploadQueue((queue) =>
      queue.map((item) =>
        item.id === itemId && item.status !== "done"
          ? { ...item, status: "cancelled", progress: 0 }
          : item,
      ),
    );
  }

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const activeResumeId = docStore.active_resume_id;

  async function handleRetryParse(resumeId: string) {
    const resume = resumes.find((r) => r.id === resumeId) as
      | { file_path?: string; content?: string | null }
      | undefined;
    if (!resume?.file_path) {
      toast.error("No file path found for this resume.");
      return;
    }

    setRetrying(resumeId);
    try {
      await fetchEdgeJson(
        "parse-resume",
        {
          resume_id: resumeId,
          file_path: resume.file_path,
          mime_type: guessMimeType(resume.file_path),
        },
        {
          timeoutMs: 90_000,
          headers: {
            "x-idempotency-key": documentParseIdempotencyKey(
              "parse-resume",
              resumeId,
              `retry:${resume.file_path}`,
            ),
          },
        },
      );
      await docMgr.reload();
      toast.success("Resume re-parsed.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed. Please try again.";
      try {
        await resumesDB.update(resumeId, {
          content: JSON.stringify({ _parse_error: message }),
        });
        await docMgr.reload();
      } catch {
        // best-effort status flip
      }
      toast.error(message);
    } finally {
      setRetrying(null);
    }
  }

  async function handleDownload(resumeId: string, filePath: string) {
    setDownloadingId(resumeId);
    try {
      const url = await getSignedUrl(STORAGE_BUCKETS.RESUMES, filePath);
      if (!url) {
        toast.error("Could not generate download link.");
        return;
      }
      const fileName = filePath.split("/").pop() ?? "resume";
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      toast.success("Download started.");
    } catch {
      toast.error("Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleRename() {
    if (!renameId || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const trimmed = renameValue.trim();
      await resumesDB.update(renameId, { name: trimmed });
      docStore.updateResume(renameId, { title: trimmed });
      toast.success("Document renamed.");
      setRenameId(null);
    } catch {
      toast.error("Rename failed.");
    } finally {
      setRenaming(false);
    }
  }

  const previewResume = resumes.find((r) => r.id === previewId) as
    | { content?: string | null; title?: string; name?: string }
    | undefined;
  const previewParsed: ParsedResume | null = previewResume
    ? parseResumeContentString(previewResume.content ?? null)
    : null;

  return (
    <div className="space-y-4">
      <UploadZone
        title="Drop resume here or browse"
        description={`PDF, DOCX, DOC or TXT · Max 10 MB · Up to ${MAX_UPLOAD_QUEUE} files at once`}
        accept=".pdf,.docx,.doc,.txt"
        multiple
        loading={uploading}
        loadingContent={
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Uploading and parsing…</p>
            {docStore.upload_progress > 0 && (
              <div className="w-40 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${docStore.upload_progress}%` }}
                />
              </div>
            )}
          </div>
        }
        onFileSelect={(files) => {
          enqueueFiles(files);
        }}
      />

      {uploadQueue.length > 0 && (
        <Card padding="sm" className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Upload queue</p>
          {uploadQueue.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{item.file.name}</p>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
                  <div
                    className={cn(
                      "h-full transition-all",
                      item.status === "error" ? "bg-red-500" :
                      item.status === "cancelled" ? "bg-muted-foreground/40" :
                      item.status === "done" ? "bg-emerald-500" : "bg-primary",
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                {item.status}
              </span>
              {(item.status === "pending" || item.status === "uploading") && (
                <button
                  type="button"
                  onClick={() => cancelUpload(item.id)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-red-400"
                  title="Cancel upload"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Resume list */}
      {resumes.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <DocumentSearchBar value={search} onChange={setSearch} />
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                viewMode === "cards"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                viewMode === "table"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>
      )}

      {resumes.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No resumes uploaded yet"
            description="Drop a file above or browse to add your first resume for AI context."
            compact
          />
        </Card>
      ) : viewMode === "table" ? (
        <Card padding="sm" className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                {([
                  ["name", "Name"],
                  ["type", "Type"],
                  ["size", "Size"],
                  ["date", "Date"],
                  ["status", "Status"],
                ] as const).map(([key, label]) => (
                  <th key={key} className="py-2 pr-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {label}
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPageItems.map((r) => {
                const row = r as {
                  id: string;
                  title?: string;
                  name?: string;
                  content?: string | null;
                  file_path?: string;
                  file_size_bytes?: number;
                  created_at: string;
                };
                const parseStatus = getResumeParseStatus(row.content, isParsingGlobal);
                const isActive = r.id === activeResumeId;

                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-medium text-foreground">
                      {row.title || row.name || "Untitled"}
                      {isActive && (
                        <Badge variant="emerald" size="sm" dot className="ml-2">Active</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">Resume</td>
                    <td className="py-3 pr-3 text-muted-foreground tabular-nums">
                      {formatFileSize(row.file_size_bytes)}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {format(new Date(row.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="py-3 pr-3 capitalize text-muted-foreground">{parseStatus}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        {!isActive && (
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                              void docMgr.setActiveResume(r.id)
                                .then(() => toast.success("Active resume updated."))
                                .catch(() => toast.error("Failed to set active resume."));
                            }}
                            leftIcon={<Star className="w-3 h-3" />}
                          >
                            Set active
                          </Button>
                        )}
                        <Link
                          to={`/app/documents/resume/${r.id}`}
                          className="px-2 py-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <DocumentPagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedPageItems.map((r) => {
            const row = r as {
              id: string;
              title?: string;
              name?: string;
              content?: string | null;
              file_path?: string;
              created_at: string;
            };
            const parseStatus = getResumeParseStatus(row.content, isParsingGlobal);
            const parsed = parseResumeContentString(row.content ?? null);
            const isActive  = r.id === activeResumeId;
            // Only show "Parsing…" while a parse is actively in-flight.
            // Empty content with no in-flight parse is "Needs parse", not stuck parsing.
            const isParsing = parseStatus === "parsing";
            const isPending = parseStatus === "pending";
            const isError   = parseStatus === "error";
            const isReady   = parseStatus === "ready";

            return (
              <Card key={r.id} padding="sm">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-xl items-center justify-center shrink-0 hidden sm:flex">
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                        {row.title || row.name || "Untitled"}
                      </p>
                      {isActive  && <Badge variant="emerald" size="sm" dot>Active</Badge>}
                      {isParsing && <Badge variant="amber"   size="sm">Parsing…</Badge>}
                      {isPending && <Badge variant="amber"   size="sm">Needs parse</Badge>}
                      {isError   && <Badge variant="red"     size="sm">Parse failed</Badge>}
                      {isReady   && <Badge variant="blue"    size="sm">Ready</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                      {parsed?.skills?.length ? ` · ${parsed.skills.length} skills` : ""}
                    </p>
                    {isReady && parsed?.summary && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                        {parsed.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {row.file_path && (
                      <button
                        onClick={() => void handleDownload(r.id, row.file_path!)}
                        disabled={downloadingId === r.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all disabled:opacity-40"
                        title="Download original file"
                      >
                        <Download className={cn("w-3.5 h-3.5", downloadingId === r.id && "animate-pulse")} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRenameId(r.id);
                        setRenameValue(row.title || row.name || "");
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                      title="Rename document"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isActive && (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          void docMgr.setActiveResume(r.id)
                            .then(() => toast.success("Active resume updated."))
                            .catch(() => toast.error("Failed to set active resume."));
                        }}
                        leftIcon={<Star className="w-3 h-3" />}
                      >
                        Set active
                      </Button>
                    )}
                    {isReady && (
                      <button
                        onClick={() => setPreviewId(r.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                        title="Preview parsed data"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Link
                      to={`/app/documents/resume/${r.id}`}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent/5 transition-all text-[10px] font-medium"
                      title="Edit extracted fields"
                    >
                      Edit
                    </Link>
                    {!isReady && !isParsing && row.file_path && (
                      <button
                        onClick={() => handleRetryParse(r.id)}
                        disabled={retrying === r.id}
                        className="p-1.5 rounded-lg text-amber-600 hover:text-amber-400 hover:bg-accent/5 transition-all disabled:opacity-40"
                        title="Retry parsing"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", retrying === r.id && "animate-spin")} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteId(r.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-accent/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
          <DocumentPagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Preview modal */}
      <Modal
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        title={previewResume?.title ?? previewResume?.name ?? "Preview"}
        size="xl"
      >
        {previewParsed ? (
          <div className="max-h-96 overflow-y-auto bg-secondary rounded-xl p-4 space-y-3">
            {previewParsed.full_name && (
              <p className="text-sm font-semibold text-foreground">{previewParsed.full_name}</p>
            )}
            {previewParsed.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed">{previewParsed.summary}</p>
            )}
            {previewParsed.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {previewParsed.skills.slice(0, 12).map((s: string) => (
                  <span key={s} className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] rounded-md border border-primary/20">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {previewParsed.experience?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Experience</p>
                {previewParsed.experience.slice(0, 3).map((exp, i) => (
                  <p key={i} className="text-xs text-foreground">
                    <span className="font-medium">{exp.title}</span>
                    {exp.company && <span className="text-muted-foreground"> @ {exp.company}</span>}
                    {exp.duration && <span className="text-muted-foreground"> · {exp.duration}</span>}
                  </p>
                ))}
              </div>
            )}
            <Link
              to={`/app/documents/resume/${previewId}`}
              className="inline-block text-xs text-primary hover:underline"
              onClick={() => setPreviewId(null)}
            >
              Edit extracted fields →
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {isParsingGlobal
              ? "Still parsing… check back in a moment."
              : "No parsed data available. Try re-parsing or edit manually."}
          </p>
        )}
      </Modal>

      {/* Rename modal */}
      <Modal open={!!renameId} onClose={() => setRenameId(null)} title="Rename document" size="sm">
        <div className="space-y-4">
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Document name"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            onKeyDown={(e) => e.key === "Enter" && void handleRename()}
          />
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" fullWidth onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              loading={renaming}
              disabled={!renameValue.trim()}
              onClick={() => void handleRename()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete resume?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete the resume and all versions. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={async () => {
              await docMgr.deleteResume(deleteId!);
              setDeleteId(null);
              toast.success("Resume deleted.");
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JDManager — supports both Paste text and URL modes
// ─────────────────────────────────────────────────────────────────────────────

function JDManager() {
  const { user } = useAuthStore();
  const docStore = useDocumentStore();
  const docMgr   = useDocumentManager({ skipInitialLoad: true });

  const [addOpen,   setAddOpen]   = useState(false);
  const [title,     setTitle]     = useState("");
  const [company,   setCompany]   = useState("");
  const [text,      setText]      = useState("");
  // ★ URL input mode
  const [jdMode,    setJdMode]    = useState<"paste" | "url">("paste");
  const [jdUrl,     setJdUrl]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const jds        = docStore.jds ?? [];
  const activeJdId = docStore.active_jd_id;
  const { pageItems, totalPages, total, safePage } = useDocumentListState(jds, search, page);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // Validate: paste mode needs text, url mode needs valid URL
  const isAddValid = title.trim() && (
    jdMode === "paste" ? text.trim() : (jdUrl.trim() && isValidUrl(jdUrl.trim()))
  );

  async function handleAdd() {
    if (!isAddValid) return;
    setSaving(true);
    try {
      const { jdId, error } = await docMgr.addJobDescription({
        rawText:   jdMode === "paste" ? text : `[URL] ${jdUrl}`,
        method:    jdMode === "paste" ? "paste" : "url",
        roleTitle: title,
        company,
        fileUrl:   jdMode === "url" ? jdUrl : undefined,
      });
      if (error) toast.error(error);
      else {
        toast.success("Job description saved.");
        setAddOpen(false);
        setTitle(""); setCompany(""); setText(""); setJdUrl(""); setJdMode("paste");
      }
    } catch {
      toast.error("Failed to save job description. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const handleDeleteJD = useCallback(async (jdId: string) => {
    if (!user?.id) {
      toast.error("Sign in to delete job descriptions.");
      return;
    }
    try {
      await jobDescriptionsDB.delete(jdId, user.id);
      docStore.removeJD(jdId);
      toast.success("Job description deleted.");
    } catch {
      toast.error("Failed to delete job description.");
    }
  }, [user?.id]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setAddOpen(true)}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Add job description
        </Button>
      </div>

      {jds.length > 0 && (
        <DocumentSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by role or company…"
        />
      )}

      {jds.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No job descriptions added yet"
            description="Add a JD to improve AI answer relevance during interviews."
            actionLabel="Add job description"
            onAction={() => setAddOpen(true)}
            compact
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {pageItems.map((jd) => {
            const isActive = jd.id === activeJdId;
            return (
              <Card key={jd.id} padding="sm">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Link
                    to={`/app/documents/jd/${jd.id}`}
                    className="w-9 h-9 bg-primary/10 rounded-xl items-center justify-center shrink-0 hidden sm:flex hover:bg-primary/15 transition-colors"
                    aria-label={`Open ${jd.role_title}`}
                  >
                    <ClipboardList className="w-4 h-4 text-primary" />
                  </Link>
                  <Link
                    to={`/app/documents/jd/${jd.id}`}
                    className="flex-1 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate hover:text-primary transition-colors">
                        {jd.role_title}
                      </p>
                      {isActive && <Badge variant="emerald" size="sm" dot>Active</Badge>}
                      {jd.parse_status === "parsing" && (
                        <Badge variant="amber" size="sm">Parsing…</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {jd.company_name && `${jd.company_name} · `}
                      {format(new Date(jd.created_at), "MMM d, yyyy")}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => docMgr.setActiveJD(jd.id)}
                        leftIcon={<Star className="w-3 h-3" />}
                      >
                        Set active
                      </Button>
                    )}
                    <Link
                      to={`/app/documents/jd/${jd.id}`}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent/5 transition-all text-[10px] font-medium"
                      title="Open job description"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => setDeleteId(jd.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-accent/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
          <DocumentPagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Add JD modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add job description" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Job title *</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Company</p>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Google"
                className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>

          {/* ★ Input mode toggle */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Job description source</p>
            <div className="flex gap-2 mb-3">
              {(["paste", "url"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setJdMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    jdMode === mode
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode === "paste" ? "📋 Paste text" : "🔗 URL"}
                </button>
              ))}
            </div>

            {jdMode === "paste" ? (
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the full job description here…"
                  rows={8}
                  className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Paste text up to ~10,000 characters · File uploads (PDF/DOCX/TXT) max{" "}
                  {FILE_LIMITS.jd.maxMB} MB when supported
                </p>
              </div>
            ) : (
              <div>
                <input
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                  placeholder="https://jobs.example.com/senior-engineer"
                  className={cn(
                    "w-full bg-background border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors",
                    jdUrl && !isValidUrl(jdUrl) ? "border-red-500/60" : "border-input"
                  )}
                />
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  The URL is saved for your reference. Automatic scraping is not available — paste the job description text for AI parsing.
                </p>
                {jdUrl && !isValidUrl(jdUrl) && (
                  <p className="text-xs text-red-400 mt-1">Please enter a valid URL (including https://)</p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" size="sm" fullWidth onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              loading={saving}
              disabled={!isAddValid}
              onClick={handleAdd}
            >
              Save JD
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete JD?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently remove this job description.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={async () => {
              await handleDeleteJD(deleteId!);
              setDeleteId(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CoverLetterManager — PDF/DOCX, 5 MB limit
// ─────────────────────────────────────────────────────────────────────────────

function CoverLetterManager() {
  const docMgr = useDocumentManager({ skipInitialLoad: true });
  const user = useAuthStore((s) => s.user);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [coverDoc, setCoverDoc] = useState<{
    title: string;
    parsed_summary: string | null;
    content: string | null;
    updated_at: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void documentsDB
      .getPrimaryByType(user.id, "cover_letter")
      .then((data) => {
        if (data) setCoverDoc(data as typeof coverDoc);
      });
  }, [user?.id, uploading]);

  async function handleFile(f: File) {
    const validationError = validateFile(f, "cover_letter");
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploading(true);
    setFile(f);
    const { documentId, error: uploadError } = await docMgr.uploadCoverLetter(f);
    setUploading(false);
    if (uploadError) toast.error(uploadError);
    else if (documentId) {
      toast.success("Document uploaded successfully");
      setFile(null);
    }
  }

  return (
    <div className="space-y-4">
      <UploadZone
        title="Drop cover letter here or browse"
        description="PDF, DOCX, DOC or TXT · Max 5 MB"
        accept=".pdf,.docx,.doc,.txt"
        loading={uploading}
        loadingContent={
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Parsing cover letter…</p>
          </div>
        }
        onFileSelect={(files) => {
          const f = files[0];
          if (f) void handleFile(f);
        }}
      />

      {coverDoc ? (
        <Card padding="sm" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{coverDoc.title}</p>
            <Badge variant="emerald" size="sm">Active for AI</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-4">
            {coverDoc.parsed_summary ?? coverDoc.content?.slice(0, 400) ?? "Parsed text available."}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Used in Practice Coach and mock interviews with your resume.
          </p>
        </Card>
      ) : !file ? (
        <Card className="bg-secondary/30">
          <EmptyState
            icon={FileText}
            title="No cover letter uploaded"
            description="Upload a PDF or DOCX — text is extracted and fed into interview AI context."
            compact
          />
        </Card>
      ) : null}

      {file && !uploading && (
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-foreground truncate flex-1">{file.name}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PortfolioManager — PDF/TXT file OR URL, 15 MB limit
// ─────────────────────────────────────────────────────────────────────────────

function PortfolioManager() {
  const [mode,         setMode]         = useState<"file" | "url">("file");
  const [file,         setFile]         = useState<File | null>(null);
  const [portfolioUrl, setPortfolioUrl] = useState("");

  function handleFile(f: File) {
    const error = validateFile(f, "portfolio");
    if (error) {
      toast.error(error);
      return;
    }
    setFile(f);
    toast.success("Portfolio file selected.");
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(["file", "url"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
              mode === m
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "file" ? "📁 Upload file" : "🔗 URL"}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <>
          <UploadZone
            title="Drop portfolio PDF/TXT/HTML or browse"
            description="PDF, DOCX, DOC, TXT or HTML · Max 15 MB"
            accept=".pdf,.docx,.doc,.txt,.html"
            onFileSelect={(files) => {
              const f = files[0];
              if (f) handleFile(f);
            }}
          />
          {file && (
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <Badge variant="emerald" size="sm">Selected</Badge>
                <button
                  onClick={() => setFile(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-accent/5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Portfolio URL</p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://yourportfolio.com"
                className={cn(
                  "w-full bg-background border text-foreground placeholder:text-muted-foreground rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors",
                  portfolioUrl && !isValidUrl(portfolioUrl) ? "border-red-500/60" : "border-input"
                )}
              />
            </div>
          </div>
          {portfolioUrl && !isValidUrl(portfolioUrl) && (
            <p className="text-xs text-red-400">Please enter a valid URL (including https://)</p>
          )}
          {portfolioUrl && isValidUrl(portfolioUrl) && (
            <p className="text-xs text-emerald-400">✓ Valid URL saved</p>
          )}
        </div>
      )}
    </div>
  );
}
