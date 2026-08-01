import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { answerBankDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { BookOpen, Edit, Trash2, Save, X, Loader2, ArrowLeft, AlertCircle, Mic } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import type { Tables } from "@/integrations/supabase";

type Answer = Tables<"answer_bank">;

export default function AnswerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const data = await answerBankDB.getById(user.id, id);
        setAnswer(data);
        setEditText(data.answer_text ?? "");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load answer";
        setFetchError(msg);
        setAnswer(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id]);

  async function handleSave() {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const updated = await answerBankDB.update(user.id, id, { answer_text: editText });
      setAnswer(updated);
      setEditing(false);
      toast.success("Answer updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !user?.id) return;
    setDeleting(true);
    try {
      await answerBankDB.delete(user.id, id);
      toast.success("Answer deleted");
      navigate("/app/answers");
    } catch {
      toast.error("Failed to delete answer. Please try again.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse h-32" />
        <Card className="animate-pulse h-48" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-4">
        <Link to="/app/answers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Answer Bank
        </Link>
        <Card className="p-6 border-destructive/30 bg-destructive/5">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">Could not load answer</p>
              <p className="text-sm text-muted-foreground mt-1">{fetchError}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!answer) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Answer not found</p>
        <Link to="/app/answers" className="text-sm text-primary hover:underline mt-2 inline-block">
          Back to Answer Bank
        </Link>
      </Card>
    );
  }

  const answerAny = answer as any;
  const star = answerAny.star_breakdown as
    | { situation?: string; task?: string; action?: string; result?: string }
    | null
    | undefined;
  const tags = (answerAny.tags ?? []) as string[];

  return (
    <div>
      <PageHeader
        title={answer.question_text ?? "Saved answer"}
        description={`${answer.category ?? "General"} · ${answer.source === "prep_lab" ? "Prep Lab" : "Manual"}`}
        icon={<BookOpen className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: "Answer Bank", href: "/app/answers" },
          { label: "Detail" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Mic className="w-4 h-4" />}
              onClick={() =>
                navigate("/app/live", {
                  state: { practicePrompt: answer.question_text },
                })
              }
            >
              Practice with {PRODUCT_NAMES.practiceCoach}
            </Button>
            {!editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} leftIcon={<Edit className="w-4 h-4" />}>
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-red-400 hover:text-red-300"
              aria-label="Delete answer"
            >
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}
                  leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditText(answer.answer_text ?? ""); }}
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

        {star && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">STAR Breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["situation", "task", "action", "result"] as const).map((key) => (
                <div key={key} className="p-3 rounded-xl bg-muted/50 border border-border">
                  <p className="text-[10px] font-semibold text-primary uppercase mb-1">{key}</p>
                  <p className="text-xs text-foreground">{star[key] || "—"}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {answerAny.ai_feedback && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">AI Feedback</h3>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {answerAny.ai_feedback}
            </div>
          </Card>
        )}

        {answerAny.score != null && (
          <Card className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Quality Score</p>
            <p className="text-2xl font-bold text-foreground">{answerAny.score}<span className="text-sm text-muted-foreground">/100</span></p>
          </Card>
        )}

        {tags.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this answer?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
