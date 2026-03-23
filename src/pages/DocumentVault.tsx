// @ts-nocheck
import { useState, useRef } from "react";
import { useDocuments } from "@/hooks/useDocuments";
import {
  Upload, FileText, Briefcase, Trash2, CheckCircle,
  AlertCircle, Loader2, Plus, ExternalLink, RefreshCw,
  ChevronDown, ChevronUp, Link, ClipboardPaste, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JDInputMethod } from "@/types/document.types";

// ─────────────────────────────────────────────────────────────────
// DocumentVault
// Resume upload + versioning, JD management, gap analysis trigger.
// ─────────────────────────────────────────────────────────────────

export default function DocumentVault() {
  const docs = useDocuments();

  const [activeTab,    setActiveTab]    = useState<"resumes" | "jds">("resumes");
  const [dragging,     setDragging]     = useState(false);
  const [jdDialogOpen, setJDDialogOpen] = useState(false);
  const [jdMethod,     setJDMethod]     = useState<JDInputMethod>("paste");
  const [jdText,       setJDText]       = useState("");
  const [jdTitle,      setJDTitle]      = useState("");
  const [jdCompany,    setJDCompany]    = useState("");
  const [jdUrl,        setJDUrl]        = useState("");
  const [jdError,      setJDError]      = useState<string | null>(null);
  const [isAddingJD,   setIsAddingJD]   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Resume upload ─────────────────────────────────────────────

  async function handleResumeFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files;
    const allowed = ["application/pdf", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) {
      alert("Please upload a PDF or Word document.");
      return;
    }
    await docs.uploadResume(file, file.name.replace(/\.[^/.]+$/, ""));
  }

  // ── Add JD ────────────────────────────────────────────────────

  async function handleAddJD() {
    setJDError(null);
    const rawText = jdMethod === "paste" ? jdText : jdUrl;
    if (!rawText.trim()) {
      setJDError("Please enter job description text or URL.");
      return;
    }
    setIsAddingJD(true);
    const { error } = await docs.addJobDescription({
      rawText:   jdMethod === "paste" ? jdText : `[URL] ${jdUrl}`,
      method:    jdMethod,
      roleTitle: jdTitle || undefined,
      company:   jdCompany || undefined,
    });
    setIsAddingJD(false);
    if (error) { setJDError(error); return; }
    setJDDialogOpen(false);
    setJDText(""); setJDTitle(""); setJDCompany(""); setJDUrl("");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Document Vault</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Upload resumes and job descriptions to personalise AI coaching
            </p>
          </div>
          <button
            onClick={docs.reload}
            className="p-2 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground rounded-xl transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", docs.isLoading && "animate-spin")} />
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────── */}
        <div className="flex gap-1 bg-secondary border border-border rounded-xl p-1 w-fit">
          {(["resumes", "jds"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize",
                activeTab === tab
                  ? "bg-violet-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "resumes" ? "📄 Resumes" : "💼 Job Descriptions"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════
            RESUMES TAB
        ══════════════════════════════════════════════ */}
        {activeTab === "resumes" && (
          <div className="space-y-4">

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                handleResumeFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all",
                dragging
                  ? "border-violet-400 bg-violet-500/10"
                  : "border-border hover:border-border bg-secondary/50"
              )}
            >
              <Upload className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-foreground font-medium">
                Drop your resume here or click to upload
              </p>
              <p className="text-muted-foreground text-sm mt-1">PDF, DOC, DOCX — max 10 MB</p>

              {docs.uploadProgress > 0 && docs.uploadProgress < 100 && (
                <div className="w-64 mt-4">
                  <div className="h-1.5 bg-secondary/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${docs.uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    Uploading… {docs.uploadProgress}%
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => handleResumeFiles(e.target.files)}
            />

            {/* Resume list */}
            {docs.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : docs.resumes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No resumes uploaded yet
              </div>
            ) : (
              <div className="space-y-3">
                {docs.resumes.map((resume) => (
                  <ResumeCard
                    key={resume.id}
                    resume={resume}
                    isActive={docs.activeContext.resume_version?.id === resume.active_version_id}
                    onSetActive={() => docs.setActiveResume(resume.id)}
                    onDelete={() => docs.deleteResume(resume.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            JOB DESCRIPTIONS TAB
        ══════════════════════════════════════════════ */}
        {activeTab === "jds" && (
          <div className="space-y-4">

            <button
              onClick={() => setJDDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Job Description
            </button>

            {docs.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : docs.jds.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No job descriptions yet — add one to unlock gap analysis
              </div>
            ) : (
              <div className="space-y-3">
                {docs.jds.map((jd) => (
                  <JDCard
                    key={jd.id}
                    jd={jd}
                    isActive={docs.activeContext.jd?.id === jd.id}
                    onSetActive={() => docs.setActiveJD(jd.id)}
                    activeResumeId={docs.activeContext.resume_version?.id ?? null}
                    onRunGap={(resumeId) => docs.runGapAnalysis(resumeId, jd.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Gap analysis result ────────────────────── */}
        {docs.activeContext.gap_analysis && (
          <GapAnalysisPanel gap={docs.activeContext.gap_analysis} />
        )}

        {/* ══════════════════════════════════════════════
            ADD JD DIALOG
        ══════════════════════════════════════════════ */}
        {jdDialogOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-popover border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-foreground">Add Job Description</h3>

              {/* Method tabs */}
              <div className="flex gap-1 bg-secondary rounded-xl p-1">
                {(["paste", "url"] as JDInputMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setJDMethod(m)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all",
                      jdMethod === m ? "bg-violet-600 text-white" : "text-muted-foreground"
                    )}
                  >
                    {m === "paste" ? (
                      <><ClipboardPaste className="inline w-3 h-3 mr-1" /> Paste text</>
                    ) : (
                      <><Link className="inline w-3 h-3 mr-1" /> URL</>
                    )}
                  </button>
                ))}
              </div>

              {jdMethod === "paste" ? (
                <textarea
                  value={jdText}
                  onChange={(e) => setJDText(e.target.value)}
                  placeholder="Paste the full job description here…"
                  rows={6}
                  className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-violet-500 text-sm"
                />
              ) : (
                <input
                  value={jdUrl}
                  onChange={(e) => setJDUrl(e.target.value)}
                  placeholder="https://jobs.example.com/role/12345"
                  className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Role Title</label>
                  <input
                    value={jdTitle}
                    onChange={(e) => setJDTitle(e.target.value)}
                    placeholder="e.g. Senior Engineer"
                    className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Company</label>
                  <input
                    value={jdCompany}
                    onChange={(e) => setJDCompany(e.target.value)}
                    placeholder="e.g. Google"
                    className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
              </div>

              {jdError && (
                <p className="text-sm text-red-400">{jdError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setJDDialogOpen(false); setJDError(null); }}
                  className="flex-1 py-2.5 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddJD}
                  disabled={isAddingJD}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-foreground text-sm font-medium rounded-xl transition-all"
                >
                  {isAddingJD ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ResumeCard
// ─────────────────────────────────────────────────────────────────

function ResumeCard({
  resume, isActive, onSetActive, onDelete,
}: {
  resume: any; isActive: boolean;
  onSetActive: () => void; onDelete: () => void;
}) {
  const activeVersion = resume.versions?.find((v: any) => v.id === resume.active_version_id)
    ?? resume.versions?.[0];

  return (
    <div className={cn(
      "bg-secondary border rounded-2xl p-5 flex items-center gap-4 transition-all",
      isActive ? "border-violet-500/40 bg-violet-600/5" : "border-border hover:border-border"
    )}>
      <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">{resume.title}</p>
          {isActive && (
            <span className="px-2 py-0.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs rounded-full shrink-0">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {activeVersion?.file_name ?? "—"}
          {activeVersion?.file_size_bytes && (
            <> · {(activeVersion.file_size_bytes / 1024).toFixed(0)} KB</>
          )}
        </p>
        <ParseStatusBadge status={activeVersion?.parse_status} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isActive && (
          <button
            onClick={onSetActive}
            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground text-xs rounded-lg transition-all"
          >
            Set Active
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// JDCard
// ─────────────────────────────────────────────────────────────────

function JDCard({
  jd, isActive, onSetActive, activeResumeId, onRunGap,
}: {
  jd: any; isActive: boolean; onSetActive: () => void;
  activeResumeId: string | null; onRunGap: (resumeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "bg-secondary border rounded-2xl overflow-hidden transition-all",
      isActive ? "border-emerald-500/40 bg-emerald-600/5" : "border-border hover:border-border"
    )}>
      <div className="p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground truncate">
              {jd.role_title ?? "Unknown Role"}
            </p>
            {isActive && (
              <span className="px-2 py-0.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs rounded-full shrink-0">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {jd.company_name ?? "Unknown company"} · {jd.input_method}
          </p>
          <ParseStatusBadge status={jd.parse_status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isActive && (
            <button
              onClick={onSetActive}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground text-xs rounded-lg transition-all"
            >
              Set Active
            </button>
          )}
          {activeResumeId && jd.parse_status === "ready" && (
            <button
              onClick={() => onRunGap(activeResumeId)}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg transition-all"
            >
              Gap Analysis
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && jd.parsed_data && (
        <div className="px-5 pb-5 pt-0 border-t border-border space-y-3">
          {jd.parsed_data.required_skills?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {jd.parsed_data.required_skills.map((s: string) => (
                  <span key={s} className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {jd.parsed_data.seniority_level && (
            <p className="text-xs text-muted-foreground">
              Level: <span className="text-foreground capitalize">{jd.parsed_data.seniority_level}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// GapAnalysisPanel
// ─────────────────────────────────────────────────────────────────

function GapAnalysisPanel({ gap }: { gap: any }) {
  return (
    <div className="bg-secondary border border-border rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
        <Star className="w-4 h-4 text-yellow-400" />
        Gap Analysis
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {gap.matched_skills?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-green-400 mb-2">✓ Matched Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {gap.matched_skills.map((s: string) => (
                <span key={s} className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-300 rounded text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}
        {gap.missing_skills?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-400 mb-2">✗ Missing Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {gap.missing_skills.map((s: string) => (
                <span key={s} className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-300 rounded text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}
        {gap.recommendations?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-violet-400 mb-2">→ Recommendations</p>
            <ul className="space-y-1">
              {gap.recommendations.map((r: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">-  {r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ParseStatusBadge
// ─────────────────────────────────────────────────────────────────

function ParseStatusBadge({ status }: { status?: string }) {
  if (!status || status === "ready") return null;
  const map: Record<string, { label: string; icon: any; color: string }> = {
    parsing: { label: "Parsing…",  icon: Loader2,       color: "text-yellow-400" },
    error:   { label: "Parse failed", icon: AlertCircle, color: "text-red-400" },
  };
  const config = map[status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs mt-0.5", config.color)}>
      <Icon className={cn("w-3 h-3", status === "parsing" && "animate-spin")} />
      {config.label}
    </span>
  );
}
