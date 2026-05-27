// @ts-nocheck
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileText, Download, Trash2, CheckCircle, Clock, Edit, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ─── Matches actual `resumes` table schema ────────────────────────────────────
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

// ─── Helpers to extract data from parsed content ─────────────────────────────

function parseSkills(content: string | null): string[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.skills)) return parsed.skills.slice(0, 20);
    if (typeof parsed?.skills === "string")
      return parsed.skills.split(",").map((s: string) => s.trim()).filter(Boolean);
  } catch {}
  return [];
}

function parseSummary(content: string | null): string {
  if (!content) return "";
  try {
    const parsed = JSON.parse(content);
    return parsed?.summary ?? parsed?.profile ?? "";
  } catch {
    return content.slice(0, 300);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ResumeDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();

  const [doc,        setDoc]        = useState<Resume | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editing,    setEditing]    = useState(false);
  const [editName,   setEditName]   = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await supabase
        .from("resumes")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (error) {
        setFetchError(error.message);
        setDoc(null);
      } else {
        setDoc(data as Resume | null);
        setEditName(data?.name ?? "");
      }
      setLoading(false);
    })();
  }, [id, user?.id]);

  async function handleSaveEdit() {
    if (!id || !user?.id) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("resumes")
        .update({ name: editName })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      setDoc((prev) => prev ? { ...prev, name: editName } : prev);
      setEditing(false);
      toast.success("Resume updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!id || !user?.id || !confirm("Delete this resume?")) return;
    const { error } = await supabase
      .from("resumes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to delete resume. Please try again.");
    } else {
      toast.success("Resume deleted");
      navigate("/app/documents");
    }
  }

  if (loading) return <Card className="animate-pulse h-48" />;

  if (fetchError) {
    return (
      <Card className="text-center py-12 border-destructive/30 bg-destructive/5">
        <p className="text-foreground font-medium">Could not load resume</p>
        <p className="text-sm text-muted-foreground mt-1">{fetchError}</p>
        <Link to="/app/documents" className="text-sm text-violet-500 hover:underline mt-3 inline-block">
          Back to Documents
        </Link>
      </Card>
    );
  }

  if (!doc) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Resume not found</p>
        <Link to="/app/documents" className="text-sm text-violet-500 hover:underline mt-2 inline-block">
          Back to Documents
        </Link>
      </Card>
    );
  }

  const skills  = parseSkills(doc.content);
  const summary = parseSummary(doc.content);
  const fileName = doc.file_path?.split("/").pop() ?? "—";

  return (
    <div>
      <PageHeader
        title={doc.name || "Resume"}
        description={`Uploaded ${new Date(doc.created_at).toLocaleDateString()}`}
        icon={<FileText className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Documents", href: "/app/documents" },
          { label: doc.name || "Resume" },
        ]}
        actions={
          <div className="flex gap-2">
            {!editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
                leftIcon={<Edit className="w-4 h-4" />}
              >
                Edit
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
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {editing && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Edit Name</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
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
                onClick={() => { setEditing(false); setEditName(doc?.name ?? ""); }}
                leftIcon={<X className="w-4 h-4" />}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

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
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-500 dark:text-violet-300"
                >
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}

        {doc.content && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Parsed Content</h3>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(doc.content!), null, 2);
                } catch {
                  return doc.content;
                }
              })()}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
