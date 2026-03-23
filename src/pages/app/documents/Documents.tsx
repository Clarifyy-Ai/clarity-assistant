// @ts-nocheck
// src/pages/app/documents/Documents.tsx
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/userStore";
import { useDocumentManager } from "@/hooks/useDocumentManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  FileText, Upload, Trash2, RefreshCw, Eye,
  Plus, Star, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ResumeVersion } from "@/types/document.types";

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
        </TabsList>
        <TabsContent value="resumes"><ResumeManager /></TabsContent>
        <TabsContent value="jds"><JDManager /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ResumeManager
// ─────────────────────────────────────────────────────────────────

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

  // ★ FIX: derive from active_resume_id, not docStore.activeResume
  const activeResumeId = docStore.active_resume_id;

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5 MB.");
      return;
    }
    if (!file.name.endsWith(".pdf") && !file.name.endsWith(".docx")) {
      toast.error("Only PDF or DOCX files are supported.");
      return;
    }
    setUploading(true);
    try {
      const { resumeId, error } = await docMgr.uploadResume(file);
      if (error) toast.error(error);
      else toast.success("Resume uploaded and parsing started.");
    } catch (err) {
      toast.error("Failed to upload document. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // ★ FIX: retryParse — re-invoke the edge function for the active version
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
            <p className="text-xs text-muted-foreground">PDF or DOCX · Max 5 MB</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
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
            // ★ FIX: all display fields come from the active ResumeVersion
            const versions: ResumeVersion[] = (r as any).resume_versions ?? [];
            const activeVer: ResumeVersion | undefined =
              versions.find((v) => v.id === r.active_version_id) ?? versions[0];
            const isActive    = r.id === activeResumeId;
            // ★ FIX: correct parse_status values — "parsing"|"processing"|"ready"|"error"
            const isParsing   = activeVer?.parse_status === "parsing"
                             || activeVer?.parse_status === "processing";
            const isError     = activeVer?.parse_status === "error";
            const isReady     = activeVer?.parse_status === "ready";

            return (
              <Card key={r.id} padding="sm">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-xl items-center justify-center shrink-0 hidden sm:flex">
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* ★ FIX: use r.title (ResumeDocument) or activeVer.file_name */}
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                        {r.title || activeVer?.file_name || "Untitled"}
                      </p>
                      {isActive && (
                        <Badge variant="emerald" size="sm" dot>Active</Badge>
                      )}
                      {isParsing && (
                        <Badge variant="amber" size="sm">Parsing…</Badge>
                      )}
                      {isError && (
                        <Badge variant="red" size="sm">Parse failed</Badge>
                      )}
                      {isReady && (
                        <Badge variant="blue" size="sm">Ready</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                      {/* ★ FIX: file_size_bytes not file_size */}
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
                    {/* ★ FIX: retry uses "error" not "failed" */}
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

      {/* Preview modal — ★ FIX: read parsed_data not parsed_text */}
      <Modal
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        title={previewVer?.file_name ?? "Preview"}
        size="xl"
      >
        {previewVer?.parsed_data ? (
          <div className="max-h-96 overflow-y-auto bg-secondary rounded-xl p-4 space-y-3">
            {previewVer.parsed_data.name && (
              <p className="text-sm font-semibold text-foreground">
                {previewVer.parsed_data.name}
              </p>
            )}
            {previewVer.parsed_data.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {previewVer.parsed_data.summary}
              </p>
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
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete resume?"
        size="sm"
      >
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

// ─────────────────────────────────────────────────────────────────
// JDManager
// ─────────────────────────────────────────────────────────────────

function JDManager() {
  const docStore = useDocumentStore();
  const docMgr   = useDocumentManager();

  const [addOpen,  setAddOpen]  = useState(false);
  const [title,    setTitle]    = useState("");
  const [company,  setCompany]  = useState("");
  const [text,     setText]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const jds          = docStore.jds ?? [];
  const activeJdId   = docStore.active_jd_id;

  async function handleAdd() {
    if (!title.trim() || !text.trim()) return;
    setSaving(true);
    try {
      // ★ FIX: correct shape — rawText/method/roleTitle, not title/company/text
      const { jdId, error } = await docMgr.addJobDescription({
        rawText:   text,
        method:    "paste",
        roleTitle: title,
        company,
      });
      if (error) toast.error(error);
      else {
        toast.success("Job description saved.");
        setAddOpen(false);
        setTitle(""); setCompany(""); setText("");
      }
    } catch (err) {
      toast.error("Failed to save job description. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ★ FIX: deleteJD wasn't in hook — call supabase + store directly
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
          <p className="text-muted-foreground text-xs mt-1">
            Add a JD to improve AI answer relevance.
          </p>
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
                      {/* ★ FIX: role_title not title */}
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                        {jd.role_title}
                      </p>
                      {isActive && <Badge variant="emerald" size="sm" dot>Active</Badge>}
                      {jd.parse_status === "parsing" && (
                        <Badge variant="amber" size="sm">Parsing…</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {/* ★ FIX: company_name not company */}
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
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Job description text *</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={8}
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
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
              disabled={!title.trim() || !text.trim()}
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
