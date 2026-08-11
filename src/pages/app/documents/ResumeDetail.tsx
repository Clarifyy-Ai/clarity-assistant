import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { documentParseIdempotencyKey } from "@/lib/network/idempotency";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileText, Download, Trash2, CheckCircle, Clock, Edit, Save, X, Loader2, RefreshCw, History, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { resumesDB, resumeVersionsDB, jobDescriptionsDB } from "@/lib/supabase/database";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  normalizeParsedResume,
  parseResumeContentString,
} from "@/lib/documents/resumeParse";
import type { ParsedResume } from "@/types/ai.types";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { cn } from "@/lib/utils";
import {
  getAiUserFacingError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";

interface ResumeVersionRow {
  id: string;
  resume_id: string;
  parse_status: string;
  parse_error: string | null;
  created_at: string;
}

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
  const [versions, setVersions] = useState<ResumeVersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [jds, setJds] = useState<Array<{ id: string; target_role: string; company: string | null }>>([]);
  const [selectedJdId, setSelectedJdId] = useState("");
  const [gapRunning, setGapRunning] = useState(false);
  const [gapResult, setGapResult] = useState<{
    match_score?: number;
    matching_skills?: string[];
    missing_skills?: string[];
    recommendations?: string[];
    experience_gap?: string;
    education_fit?: string;
  } | null>(null);

  const parsed = useMemo(
    () => parseResumeContentString(doc?.content ?? null),
    [doc?.content],
  );

  const loadVersions = useCallback(async (resumeId: string) => {
    setVersionsLoading(true);
    try {
      const rows = await resumeVersionsDB.getByResumeId(resumeId);
      setVersions(rows as ResumeVersionRow[]);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

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
        setDoc(data as Resume);
        setEditName(data.name ?? "");
        setForm(parsedToForm(parseResumeContentString(data.content)));
        void loadVersions(id);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load resume");
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, loadVersions]);

  useEffect(() => {
    void loadResume();
  }, [loadResume]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await jobDescriptionsDB.listByUserId(user.id);
        if (cancelled) return;
        const mapped = rows.map((j) => ({
          id: j.id,
          target_role: j.target_role ?? j.title ?? "Untitled JD",
          company: j.company ?? null,
        }));
        setJds(mapped);
        if (mapped.length === 1) setSelectedJdId(mapped[0].id);
      } catch {
        if (!cancelled) setJds([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  async function handleGapAnalysis() {
    if (!id || !selectedJdId) {
      toast.error("Select a job description to compare against this resume.");
      return;
    }
    setGapRunning(true);
    setGapResult(null);
    try {
      const result = await fetchEdgeJson<{
        match_score?: number;
        matching_skills?: string[];
        missing_skills?: string[];
        recommendations?: string[];
        experience_gap?: string;
        education_fit?: string;
      }>(
        "gap-analysis",
        { resume_id: id, jd_id: selectedJdId },
        {
          headers: {
            "x-idempotency-key": documentParseIdempotencyKey(
              "gap-analysis",
              `${id}:${selectedJdId}`,
            ),
          },
        },
      );
      setGapResult(result);
      toast.success("Gap analysis ready");
    } catch (err) {
      openUpgradeIfInsufficientCredits(err);
      toast.error(getAiUserFacingError(err));
    } finally {
      setGapRunning(false);
    }
  }
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
      const data = await fetchEdgeJson<{ parsed?: Record<string, unknown> }>(
        "parse-resume",
        {
          resume_id: id,
          file_path: doc.file_path,
          mime_type: guessMimeType(doc.file_path),
        },
        {
          timeoutMs: 90_000,
          headers: {
            "x-idempotency-key": documentParseIdempotencyKey(
              "parse-resume",
              id,
              `reparse:${doc.file_path}`,
            ),
          },
        },
      );
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

        <Card id="gap-analysis-panel">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            Resume ↔ JD Gap Analysis
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Costs {AI_CREDIT_COSTS.gap_analysis} credits. Select a JD, then analyze.
          </p>
          <div
            className={cn(
              "mb-3 rounded-xl border px-3 py-2 text-xs",
              "border-primary/40 bg-primary/5 text-foreground",
            )}
          >
            Resume selected: <span className="font-medium">{doc.name || "This resume"}</span>
          </div>
          {jds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No job descriptions yet.{" "}
              <Link to="/app/documents" className="text-primary underline-offset-2 hover:underline">
                Add a JD
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Select job description</p>
                <div className="flex flex-wrap gap-2">
                  {jds.map((jd) => {
                    const selected = selectedJdId === jd.id;
                    return (
                      <button
                        key={jd.id}
                        type="button"
                        onClick={() => setSelectedJdId(jd.id)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left text-sm transition-all max-w-xs",
                          selected
                            ? "border-primary bg-primary/10 ring-2 ring-primary/30 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        <span className="font-medium line-clamp-1">{jd.target_role}</span>
                        {jd.company ? (
                          <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                            {jd.company}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleGapAnalysis()}
                disabled={gapRunning || !selectedJdId || !id}
                leftIcon={
                  gapRunning
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <GitCompare className="w-4 h-4" />
                }
              >
                {gapRunning ? "Analyzing…" : "Run gap analysis"}
              </Button>
            </div>
          )}
          {gapResult && (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 px-3 py-2 text-center min-w-[72px]">
                  <p className="text-lg font-bold text-primary tabular-nums">
                    {Math.round(Number(gapResult.match_score) || 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase">Match</p>
                </div>
                <div className="flex-1 text-sm text-muted-foreground space-y-1">
                  {gapResult.experience_gap && (
                    <p><span className="font-medium text-foreground">Experience:</span> {gapResult.experience_gap}</p>
                  )}
                  {gapResult.education_fit && (
                    <p><span className="font-medium text-foreground">Education:</span> {gapResult.education_fit}</p>
                  )}
                </div>
              </div>
              {(gapResult.matching_skills?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Matching skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gapResult.matching_skills!.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(gapResult.missing_skills?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Missing skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gapResult.missing_skills!.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Version history
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Read-only parse snapshots for this resume (newest first).
          </p>
          {versionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading versions…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved versions yet. Re-parse or upload updates create version rows when available.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground tabular-nums text-xs">
                      {new Date(v.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    {v.parse_error && (
                      <p className="text-xs text-red-400 mt-0.5">{v.parse_error}</p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      v.parse_status === "ready"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : v.parse_status === "error"
                          ? "bg-red-500/15 text-red-500"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {v.parse_status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
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
