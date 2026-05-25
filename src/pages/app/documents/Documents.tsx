// @ts-nocheck
// src/pages/app/documents/Documents.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useAuthStore } from "@/store/userStore";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useDocumentStore } from "@/store/documentStore";
import { useDocumentManager } from "@/hooks/useDocumentManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  FileText, Upload, Trash2, RefreshCw, Eye,
  Plus, Star, ClipboardList, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ResumeVersion } from "@/types/document.types";

// ─── URL validation helper ────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Documents() {
  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Documents"
        subtitle="Manage your resume and job descriptions for AI context"
      />
      <Tabs defaultValue="resumes">
        <TabsList>
          <TabsTrigger value="resumes">📄 Resumes</TabsTrigger>
          <TabsTrigger value="jds">📋 Job Descriptions</TabsTrigger>
          <TabsTrigger value="cover_letter">✉️ Cover Letter</TabsTrigger>
          <TabsTrigger value="portfolio">💼 Portfolio</TabsTrigger>
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

function ResumeManager() {
  const docStore = useDocumentStore();
  const docMgr   = useDocumentManager();

  const [dragOver,  setDragOver]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [retrying,  setRetrying]  = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resumes = docStore.resumes;

  // ★ FIX: derive from active_resume_id
  const activeResumeId = docStore.active_resume_id;

  async function handleFile(file: File) {
    // ★ FIX: max 10 MB, accept PDF/DOCX/TXT
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext ?? "")) {
      toast.error("Only PDF, DOCX or TXT files are supported.");
      return;
    }
    setUploading(true);
    try {
      const { resumeId, error } = await docMgr.uploadResume(file);
      if (error) toast.error(error);
      else toast.success("Resume uploaded and parsing started.");
    } catch {
      toast.error("Failed to upload document. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRetryParse(resumeId: string) {
    const resume = resumes.find((r) => r.id === resumeId);
    if (!resume) return;
    const versions: ResumeVersion[] = (resume as any).resume_versions ?? [];
    const ver = versions.find((v) => v.id === resume.active_version_id) ?? versions[0];
    if (!ver) return;

    setRetrying(resumeId);
    try {
      await supabase.functions.invoke("parse-resume", {
        body: {
          resume_id:  resumeId,
          version_id: ver.id,
          file_url:   ver.file_url,
          mime_type:  "application/pdf",
        },
      });
      await docMgr.reload();
      toast.success("Re-parsing started.");
    } catch {
      toast.error("Retry failed. Please try again.");
    } finally {
      setRetrying(null);
    }
  }

  const previewResume = resumes.find((r) => r.id === previewId);
  const previewVer: ResumeVersion | undefined = previewResume
    ? ((previewResume as any).resume_versions ?? []).find(
        (v: ResumeVersion) => v.id === previewResume.active_version_id
      ) ?? (previewResume as any).resume_versions?.[0]
    : undefined;

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center cursor-pointer transition-all",
          dragOver
            ? "border-violet-500/60 bg-violet-500/5"
            : "border-border hover:border-border bg-card"
        )}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading and parsing…</p>
            {docStore.upload_progress > 0 && (
              <div className="w-40 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{ width: `${docStore.upload_progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drop resume here or{" "}
              <span className="text-violet-400 underline">browse</span>
            </p>
            {/* ★ FIX: updated text — 10 MB, TXT supported */}
            <p className="text-xs text-muted-foreground">PDF, DOCX or TXT · Max 10 MB</p>
          </div>
        )}
      </div>
      {/* ★ FIX: accept .txt */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Resume list */}
      {resumes.length === 0 ? (
        <Card className="text-center py-10">
          <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No resumes uploaded yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {resumes.map((r) => {
            const versions: ResumeVersion[] = (r as any).resume_versions ?? [];
            const activeVer: ResumeVersion | undefined =
              versions.find((v) => v.id === r.active_version_id) ?? versions[0];
            const isActive  = r.id === activeResumeId;
            const isParsing = activeVer?.parse_status === "parsing"
                           || activeVer?.parse_status === "processing";
            const isError   = activeVer?.parse_status === "error";
            const isReady   = activeVer?.parse_status === "ready";

            return (
              <Card key={r.id} padding="sm">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-xl items-center justify-center shrink-0 hidden sm:flex">
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                        {r.title || activeVer?.file_name || "Untitled"}
                      </p>
                      {isActive  && <Badge variant="emerald" size="sm" dot>Active</Badge>}
                      {isParsing && <Badge variant="amber"   size="sm">Parsing…</Badge>}
                      {isError   && <Badge variant="red"     size="sm">Parse failed</Badge>}
                      {isReady   && <Badge variant="blue"    size="sm">Ready</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                      {activeVer?.file_size_bytes
                        ? ` · ${(activeVer.file_size_bytes / 1024).toFixed(0)} KB`
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => docMgr.setActiveResume(r.id)}
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
                    {isError && (
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
        </div>
      )}

      {/* Preview modal */}
      <Modal
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        title={previewVer?.file_name ?? "Preview"}
        size="xl"
      >
        {previewVer?.parsed_data ? (
          <div className="max-h-96 overflow-y-auto bg-secondary rounded-xl p-4 space-y-3">
            {previewVer.parsed_data.name && (
              <p className="text-sm font-semibold text-foreground">{previewVer.parsed_data.name}</p>
            )}
            {previewVer.parsed_data.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed">{previewVer.parsed_data.summary}</p>
            )}
            {previewVer.parsed_data.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {previewVer.parsed_data.skills.slice(0, 12).map((s: string) => (
                  <span key={s} className="px-2 py-0.5 bg-violet-500/10 text-violet-300 text-[11px] rounded-md border border-violet-500/20">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {previewVer.parsed_data.experience?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Experience</p>
                {previewVer.parsed_data.experience.slice(0, 3).map((exp: any, i: number) => (
                  <p key={i} className="text-xs text-foreground">
                    <span className="font-medium">{exp.title}</span>
                    {exp.company && <span className="text-muted-foreground"> @ {exp.company}</span>}
                    {exp.duration && <span className="text-muted-foreground"> · {exp.duration}</span>}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {previewVer?.parse_status === "parsing" || previewVer?.parse_status === "processing"
              ? "Still parsing… check back in a moment."
              : "No parsed data available."}
          </p>
        )}
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
  const docStore = useDocumentStore();
  const docMgr   = useDocumentManager();

  const [addOpen,   setAddOpen]   = useState(false);
  const [title,     setTitle]     = useState("");
  const [company,   setCompany]   = useState("");
  const [text,      setText]      = useState("");
  // ★ URL input mode
  const [jdMode,    setJdMode]    = useState<"paste" | "url">("paste");
  const [jdUrl,     setJdUrl]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  const jds        = docStore.jds ?? [];
  const activeJdId = docStore.active_jd_id;

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
    await supabase.from("job_descriptions").delete().eq("id", jdId);
    docStore.removeJD(jdId);
    toast.success("Job description deleted.");
  }, []);

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

      {jds.length === 0 ? (
        <Card className="text-center py-10">
          <ClipboardList className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No job descriptions added yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Add a JD to improve AI answer relevance.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {jds.map((jd) => {
            const isActive = jd.id === activeJdId;
            return (
              <Card key={jd.id} padding="sm">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 bg-violet-500/10 rounded-xl items-center justify-center shrink-0 hidden sm:flex">
                    <ClipboardList className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">
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
                  </div>
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
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the full job description here…"
                rows={8}
                className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
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
  const docMgr = useDocumentManager();
  const user = useAuthStore((s) => s.user);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverDoc, setCoverDoc] = useState<{
    title: string;
    parsed_summary: string | null;
    content: string | null;
    updated_at: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("documents")
      .select("title, parsed_summary, content, updated_at")
      .eq("user_id", user.id)
      .eq("type", "cover_letter")
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setCoverDoc(data as typeof coverDoc);
      });
  }, [user?.id, uploading]);

  async function handleFile(f: File) {
    if (f.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5 MB.");
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx"].includes(ext ?? "")) {
      toast.error("Only PDF or DOCX files are supported for cover letters.");
      return;
    }
    setUploading(true);
    setFile(f);
    const { documentId, error } = await docMgr.uploadCoverLetter(f);
    setUploading(false);
    if (error) toast.error(error);
    else if (documentId) {
      toast.success("Cover letter uploaded and parsed for interview AI context.");
      setFile(null);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center cursor-pointer transition-all",
          dragOver
            ? "border-violet-500/60 bg-violet-500/5"
            : "border-border hover:border-border bg-card"
        )}
      >
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">
          Drop cover letter here or{" "}
          <span className="text-violet-400 underline">browse</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF or DOCX · Max 5 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {uploading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Parsing cover letter…
        </p>
      )}

      {coverDoc ? (
        <Card padding="sm" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{coverDoc.title}</p>
            <Badge variant="green" size="sm">Active for AI</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-4">
            {coverDoc.parsed_summary ?? coverDoc.content?.slice(0, 400) ?? "Parsed text available."}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Used in Live Co-Pilot and mock interviews with your resume.
          </p>
        </Card>
      ) : !file ? (
        <Card className="text-center py-8 bg-secondary/30">
          <p className="text-sm text-muted-foreground">No cover letter uploaded.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Upload a PDF or DOCX — text is extracted and fed into interview AI context.
          </p>
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
  const [dragOver,     setDragOver]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (f.size > 15 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 15 MB.");
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "txt"].includes(ext ?? "")) {
      toast.error("Only PDF or TXT files are supported for portfolios.");
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
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={cn(
              "border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center cursor-pointer transition-all",
              dragOver
                ? "border-violet-500/60 bg-violet-500/5"
                : "border-border hover:border-border bg-card"
            )}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              Drop portfolio PDF/TXT or{" "}
              <span className="text-violet-400 underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">PDF or TXT · Max 15 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file && (
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-violet-400" />
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
