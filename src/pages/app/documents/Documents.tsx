// @ts-nocheck
import { useState, useRef } from "react";
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
  FileText, Upload, Trash2, CheckCircle,
  Download, RefreshCw, Eye, AlertTriangle,
  Plus, Zap, Star, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// Documents — resume + JD management
// ─────────────────────────────────────────────────────────────────

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
        <TabsContent value="resumes">
          <ResumeManager />
        </TabsContent>
        <TabsContent value="jds">
          <JDManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ResumeManager
// ─────────────────────────────────────────────────────────────────

function ResumeManager() {
  const docStore  = useDocumentStore();
  const docMgr    = useDocumentManager();
  const { user }  = useAuthStore();

  const [dragOver,    setDragOver]    = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [previewId,   setPreviewId]   = useState<string | null>(null);
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resumes      = docStore.resumes;
  const activeResume = docStore.activeResume;

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) return;
    if (!file.name.endsWith(".pdf") && !file.name.endsWith(".docx")) return;
    setUploading(true);
    await docMgr.uploadResume(file);
    setUploading(false);
  }

  const preview = resumes.find((r) => r.id === previewId);

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
          "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
          dragOver
            ? "border-violet-500/60 bg-violet-500/5"
            : "border-white/10 hover:border-white/20 bg-white/3"
        )}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading and parsing…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drop resume here or <span className="text-violet-400 underline">browse</span>
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
          <FileText className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No resumes uploaded yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {resumes.map((r) => (
            <Card key={r.id} padding="sm">
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">
                      {r.file_name}
                    </p>
                    {r.is_active && (
                      <Badge variant="emerald" size="sm" dot>Active</Badge>
                    )}
                    {r.parse_status === "pending" && (
                      <Badge variant="amber" size="sm">Parsing…</Badge>
                    )}
                    {r.parse_status === "failed" && (
                      <Badge variant="red" size="sm">Parse failed</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(r.created_at), "MMM d, yyyy")} ·{" "}
                    {(r.file_size / 1024).toFixed(0)} KB
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {!r.is_active && (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => docMgr.setActiveResume(r.id)}
                      leftIcon={<Star className="w-3 h-3" />}
                    >
                      Set active
                    </Button>
                  )}
                  <button
                    onClick={() => setPreviewId(r.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {r.parse_status === "failed" && (
                    <button
                      onClick={() => docMgr.retryParse(r.id)}
                      className="p-1.5 rounded-lg text-amber-600 hover:text-amber-400 hover:bg-accent/5 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
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
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Modal
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        title={preview?.file_name ?? "Preview"}
        size="xl"
      >
        {preview?.parsed_text ? (
          <div className="max-h-96 overflow-y-auto bg-black/30 rounded-xl p-4">
            <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-mono">
              {preview.parsed_text}
            </pre>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No parsed text available.</p>
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
          This will permanently delete the resume. This action cannot be undone.
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
  const { user } = useAuthStore();

  const [addOpen,  setAddOpen]  = useState(false);
  const [title,    setTitle]    = useState("");
  const [company,  setCompany]  = useState("");
  const [text,     setText]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const jds = docStore.jds ?? [];

  async function handleAdd() {
    if (!title.trim() || !text.trim()) return;
    setSaving(true);
    await docMgr.addJobDescription({ title, company, text });
    setSaving(false);
    setAddOpen(false);
    setTitle(""); setCompany(""); setText("");
  }

  return (
    <div className="space-y-4">
      {/* Add JD button */}
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

      {/* JD list */}
      {jds.length === 0 ? (
        <Card className="text-center py-10">
          <ClipboardList className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No job descriptions added yet.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Add a JD to improve AI answer relevance.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {jds.map((jd) => (
            <Card key={jd.id} padding="sm">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{jd.title}</p>
                    {jd.is_active && (
                      <Badge variant="emerald" size="sm" dot>Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {jd.company && `${jd.company} · `}
                    {format(new Date(jd.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!jd.is_active && (
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
          ))}
        </div>
      )}

      {/* Add JD modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add job description" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Job title</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Company</p>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Google"
                className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Job description text</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={8}
              className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-violet-500"
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
              await docMgr.deleteJD(deleteId!);
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
