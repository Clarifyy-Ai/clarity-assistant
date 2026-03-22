// @ts-nocheck
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { BookOpen, Edit, Trash2, Save, X, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface Answer {
  id: string;
  question_text: string;
  answer_text: string;
  category: string;
  source: string;
  tags: string[];
  created_at: string;
  star_breakdown?: { situation?: string; task?: string; action?: string; result?: string };
  score?: number;
  ai_feedback?: string;
}

export default function AnswerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("answer_bank")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      setAnswer(data as Answer | null);
      setEditText(data?.answer_text ?? "");
      setLoading(false);
    })();
  }, [id, user?.id]);

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("answer_bank")
        .update({ answer_text: editText, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user?.id);
      if (error) throw error;
      setAnswer((prev) => prev ? { ...prev, answer_text: editText } : prev);
      setEditing(false);
      toast.success("Answer updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !user?.id || !confirm("Delete this answer?")) return;
    await supabase.from("answer_bank").delete().eq("id", id).eq("user_id", user.id);
    toast.success("Answer deleted");
    navigate("/app/answers");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse h-32" />
        <Card className="animate-pulse h-48" />
      </div>
    );
  }

  if (!answer) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Answer not found</p>
        <Link to="/app/answers" className="text-sm text-violet-500 hover:underline mt-2 inline-block">
          Back to Answer Bank
        </Link>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={answer.question_text}
        description={`${answer.category ?? "General"} · ${answer.source === "prep_lab" ? "Prep Lab" : "Manual"}`}
        icon={<BookOpen className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Answer Bank", href: "/app/answers" },
          { label: "Detail" },
        ]}
        actions={
          <div className="flex gap-2">
            {!editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} leftIcon={<Edit className="w-4 h-4" />}>
                Edit
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Answer</h3>
          {editing ? (
            <div className="space-y-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}
                  leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditText(answer.answer_text); }}
                  leftIcon={<X className="w-4 h-4" />}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {answer.answer_text}
            </div>
          )}
        </Card>

        {answer.star_breakdown && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">STAR Breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["situation", "task", "action", "result"] as const).map((key) => (
                <div key={key} className="p-3 rounded-xl bg-muted/50 border border-border">
                  <p className="text-[10px] font-semibold text-violet-500 uppercase mb-1">{key}</p>
                  <p className="text-xs text-foreground">{answer.star_breakdown?.[key] || "—"}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {answer.ai_feedback && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">AI Feedback</h3>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {answer.ai_feedback}
            </div>
          </Card>
        )}

        {answer.score != null && (
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Quality Score</p>
            <p className="text-2xl font-bold text-foreground">{answer.score}<span className="text-sm text-muted-foreground">/100</span></p>
          </Card>
        )}

        {answer.tags && answer.tags.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {answer.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground">
          Created {new Date(answer.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
