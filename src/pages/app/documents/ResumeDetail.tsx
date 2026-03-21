import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileText, Download, Trash2, CheckCircle, Clock, AlertTriangle, Edit, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Doc {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_size: number;
  content: string;
  is_active: boolean;
  parsed_skills: string[];
  parsed_summary: string;
  parsed_experience: any;
  parsed_education: any;
  created_at: string;
  updated_at: string;
}

export default function ResumeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id)
        .eq("type", "resume")
        .eq("user_id", user.id)
        .single();
      setDoc(data as Doc | null);
      setEditTitle(data?.title ?? "");
      setLoading(false);
    })();
  }, [id, user?.id]);

  async function handleSaveEdit() {
    if (!id || !user?.id) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({ title: editTitle, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      setDoc((prev) => prev ? { ...prev, title: editTitle } : prev);
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
    await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);
    toast.success("Resume deleted");
    navigate("/app/documents");
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) return <Card className="animate-pulse h-48" />;

  if (!doc) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Resume not found</p>
        <Link to="/app/documents" className="text-sm text-violet-500 hover:underline mt-2 inline-block">Back to Documents</Link>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={doc.title || doc.file_name || "Resume"}
        description={`Uploaded ${new Date(doc.created_at).toLocaleDateString()}`}
        icon={<FileText className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Documents", href: "/app/documents" },
          { label: doc.title || "Resume" },
        ]}
        actions={
          <div className="flex gap-2">
            {!editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} leftIcon={<Edit className="w-4 h-4" />}>
                Edit
              </Button>
            )}
            {doc.file_url && (
              <a href={doc.file_url} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />}>Download</Button>
              </a>
            )}
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {editing && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Edit Title</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={savingEdit}
                leftIcon={savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditTitle(doc?.title ?? ""); }}
                leftIcon={<X className="w-4 h-4" />}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Status</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              {doc.is_active ? (
                <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs text-emerald-500 font-medium">Active</span></>
              ) : (
                <><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Inactive</span></>
              )}
            </div>
          </Card>
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">File Size</p>
            <p className="text-sm font-semibold text-foreground mt-1">{formatSize(doc.file_size ?? 0)}</p>
          </Card>
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Skills Found</p>
            <p className="text-sm font-semibold text-foreground mt-1">{doc.parsed_skills?.length ?? 0}</p>
          </Card>
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">File</p>
            <p className="text-xs font-medium text-foreground mt-1 truncate">{doc.file_name ?? "—"}</p>
          </Card>
        </div>

        {doc.parsed_summary && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">AI Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{doc.parsed_summary}</p>
          </Card>
        )}

        {doc.parsed_skills && doc.parsed_skills.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {doc.parsed_skills.map((s: string) => (
                <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-500 dark:text-violet-300">{s}</span>
              ))}
            </div>
          </Card>
        )}

        {doc.content && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Parsed Content</h3>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {doc.content}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
