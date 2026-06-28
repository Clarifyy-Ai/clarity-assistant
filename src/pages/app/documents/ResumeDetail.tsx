import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileText, Download, Trash2, CheckCircle, Clock, Edit, Save, X, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { resumesDB } from "@/lib/supabase/database";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  normalizeParsedResume,
  parseResumeContentString,
} from "@/lib/documents/resumeParse";
import type { ParsedResume } from "@/types/ai.types";

interface Resume {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  url: string | null;
  content: string | null;
  is_primary: boolean;
  created_at: string;
}

interface ResumeFormState {
  full_name: string;
  email: string;
  summary: string;
  skills: string;
  experience: string;
}

function parsedToForm(parsed: ParsedResume | null): ResumeFormState {
  const experienceLines =
    parsed?.experience?.map((e) => {
      const parts = [e.title, e.company, e.duration].filter(Boolean).join(" @ ");
      const bullet = e.impact_bullets?.[0] ?? e.description?.slice(0, 120) ?? "";
      return bullet ? `${parts} — ${bullet}` : parts;
    }) ?? [];

  return {
    full_name: parsed?.full_name ?? "",
    email: parsed?.email ?? "",
    summary: parsed?.summary ?? "",
    skills: (parsed?.skills ?? []).join(", "),
    experience: experienceLines.join("\n"),
  };
}

function formToContent(form: ResumeFormState, base: ParsedResume | null): string {
  const skills = form.skills
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const experience = form.experience
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [headline, ...rest] = line.split(" — ");
      const atParts = headline.split(" @ ");
      return {
        title: atParts[0]?.trim() ?? headline,
        company: atParts[1]?.trim() ?? "",
        duration: atParts[2]?.trim() ?? "",
        description: rest.join(" — ").trim(),
        impact_bullets: rest[0] ? [rest.join(" — ").trim()] : [],
      };
    });

  const payload = {
    ...(base ?? {}),
    full_name: form.full_name || null,
    name: form.full_name || null,
    email: form.email || null,
    summary: form.summary || null,
    skills,
    experience,
  };

  return JSON.stringify(payload);
}

function guessMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  return "text/plain";
}

export default function ResumeDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();

  const [doc,        setDoc]        = useState<Resume | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editing,    setEditing]    = useState(false);
  const [editName,   setEditName]   = useState("");
  const [form,       setForm]       = useState<ResumeFormState>(parsedToForm(null));
  const [savingEdit, setSavingEdit] = useState(false);
  const [reparse,    setReparse]    = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const parsed = useMemo(
    () => parseResumeContentString(doc?.content ?? null),
    [doc?.content],
  );

  const loadResume = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true);
    setFetchError(null);
    try {
      const data = await resumesDB.getById(id);
      if (data.user_id !== user.id) {
        setFetchError("Resume not found");
        setDoc(null);
      } else {
        const resume = data as Resume;
        setDoc(resume);
        setEditName(resume.name ?? "");
        setForm(parsedToForm(parseResumeContentString(resume.content)));
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load resume");
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    void loadResume();
  }, [loadResume]);

  async function handleSaveEdit() {
    if (!id || !user?.id) return;
    setSavingEdit(true);
    try {
      const content = formToContent(form, parsed);
      await resumesDB.update(id, { name: editName, content });
      setDoc((prev) => (prev ? { ...prev, name: editName, content } : prev));
      setEditing(false);
      toast.success("Resume updated — AI sessions will use this data");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleReparse() {
    if (!id || !doc?.file_path) return;
    setReparse(true);
    try {
      const data = await fetchEdgeJson<{ parsed?: Record<string, unknown> }>("parse-resume", {
        resume_id: id,
        file_path: doc.file_path,
        mime_type: guessMimeType(doc.file_path),
      });
      if (data?.parsed) {
        const normalized = normalizeParsedResume(data.parsed);
        const content = JSON.stringify(data.parsed);
        await resumesDB.update(id, { content });
        setDoc((prev) => (prev ? { ...prev, content } : prev));
        setForm(parsedToForm(normalized));
        toast.success("Resume re-parsed");
      }
    } catch {
      toast.error("Re-parse failed");
    } finally {
      setReparse(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await resumesDB.delete(id);
      toast.success("Resume deleted");
      navigate("/app/documents");
    } catch {
      toast.error("Failed to delete resume. Please try again.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-4">
        <InlineErrorRetry message={fetchError} onRetry={() => void loadResume()} />
        <Link to="/app/documents" className="text-sm text-primary hover:underline inline-block">
          Back to Documents
        </Link>
      </div>
    );
  }

  if (!doc) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="Resume not found"
          description="This resume may have been deleted or the link is invalid."
          actionLabel="Back to Documents"
          onAction={() => navigate("/app/documents")}
          compact
        />
      </Card>
    );
  }

  const skills = parsed?.skills ?? [];
  const summary = parsed?.summary ?? "";
  const fileName = doc.file_path?.split("/").pop() ?? "—";

  return (
    <div>
      <PageHeader
        title={doc.name || "Resume"}
        description={`Uploaded ${new Date(doc.created_at).toLocaleDateString()}`}
        icon={<FileText className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: "Documents", href: "/app/documents" },
          { label: doc.name || "Resume" },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {!editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setForm(parsedToForm(parsed));
                  setEditing(true);
                }}
                leftIcon={<Edit className="w-4 h-4" />}
              >
                Edit fields
              </Button>
            )}
            {doc.file_path && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReparse}
                disabled={reparse}
                leftIcon={reparse ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              >
                Re-parse file
              </Button>
            )}
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />}>
                  Download
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {editing ? (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">Edit extracted resume data</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Correct any parsing mistakes. Live sessions and AI answers use this data.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Document title</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Full name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Professional summary</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Skills (comma-separated)</label>
                <textarea
                  value={form.skills}
                  onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Experience (one role per line: Title @ Company · Duration — highlight)
                </label>
                <textarea
                  value={form.experience}
                  onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))}
                  rows={5}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                leftIcon={savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditName(doc.name ?? "");
                  setForm(parsedToForm(parsed));
                }}
                leftIcon={<X className="w-4 h-4" />}
              >
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Status</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              {doc.is_primary ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-emerald-500 font-medium">Primary</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Standard</span>
                </>
              )}
            </div>
          </Card>
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Skills Found</p>
            <p className="text-sm font-semibold text-foreground mt-1">{skills.length}</p>
          </Card>
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">File</p>
            <p className="text-xs font-medium text-foreground mt-1 truncate">{fileName}</p>
          </Card>
        </div>

        {summary && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">AI Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
          </Card>
        )}

        {skills.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s: string) => (
                <span
                  key={s}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary dark:text-primary/80"
                >
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}

        {parsed?.experience && parsed.experience.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Experience</h3>
            <div className="space-y-2">
              {parsed.experience.map((exp, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{exp.title}</span>
                  {exp.company && <span> @ {exp.company}</span>}
                  {exp.duration && <span className="text-xs"> · {exp.duration}</span>}
                </p>
              ))}
            </div>
          </Card>
        )}

        {parsed?.education && parsed.education.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Education</h3>
            <div className="space-y-2">
              {parsed.education.map((edu, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium text-foreground">{edu.institution}</p>
                  <p className="text-muted-foreground text-xs">
                    {[edu.degree, edu.field].filter(Boolean).join(" · ")}
                    {edu.graduation_year ? ` · ${edu.graduation_year}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this resume?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
