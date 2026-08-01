import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { answerBankDB } from "@/lib/supabase/database";
import type { Tables } from "@/integrations/supabase";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { toast } from "sonner";
import {
  BookOpen, Search, Star, Trash2,
  ChevronDown, ChevronUp, Copy,
  Edit2, Check, Plus, Sparkles, ExternalLink, Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

// ─────────────────────────────────────────────────────────────────
// AnswerBank — saved STAR answers + session saves
// ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Behavioural", "Technical", "Leadership", "System Design", "HR"];

export default function AnswerBank() {
  const { user }  = useAuthStore();

  const [answers,   setAnswers]   = useState<Tables<"answer_bank">[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search,    setSearch]    = useState("");
  const [category,  setCategory]  = useState("All");
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editText,  setEditText]  = useState("");
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [addOpen,   setAddOpen]   = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchAnswers();
  }, [user?.id]);

  async function fetchAnswers() {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await answerBankDB.listByUserId(user.id);
      setAnswers(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load answers";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      if (!user?.id) return;
      await answerBankDB.update(user.id, editId, { answer_text: editText });
      setAnswers((p) =>
        p.map((a) => a.id === editId ? { ...a, answer_text: editText } : a)
      );
      setEditId(null);
      toast.success("Answer updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update answer.");
    }
  }

  async function deleteAnswer() {
    if (!deleteId || !user?.id) return;
    try {
      await answerBankDB.delete(user.id, deleteId);
      setAnswers((p) => p.filter((a) => a.id !== deleteId));
      setDeleteId(null);
      toast.success("Answer deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete answer.");
    }
  }

  const filtered = answers.filter((a) => {
    if (category !== "All" && a.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.question_text?.toLowerCase().includes(q) ||
        a.answer_text?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 max-w-4xl">
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void fetchAnswers()} />
      )}

      <PageHeader
        title={PRODUCT_NAMES.answerBank}
        description="Your saved STAR answers and best responses"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddOpen(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add answer
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search answers…"
          aria-label="Search answers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          fullWidth={false}
          className="sm:w-64"
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                category === c
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Answers list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No saved answers yet"
            description="Save answers from sessions or build them in Prep Lab."
            actionLabel="Add answer"
            onAction={() => setAddOpen(true)}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((ansRaw) => {
            const ans = ansRaw as any;
            const isOpen = expanded[ans.id];
            const isEditing = editId === ans.id;

            return (
              <Card key={ans.id}>
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <Link
                    to={`/app/answers/${ans.id}`}
                    className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 hover:bg-primary/20 transition-colors"
                    aria-label="Open answer detail"
                  >
                    <Star className="w-3.5 h-3.5 text-primary" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/app/answers/${ans.id}`}
                      className="text-sm font-medium text-foreground leading-snug hover:text-primary transition-colors block"
                    >
                      {ans.question_text}
                    </Link>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {ans.category && (
                        <Badge variant="default" size="sm">{ans.category}</Badge>
                      )}
                      {ans.score !== null && ans.score !== undefined && (
                        <Badge
                          variant={ans.score >= 75 ? "emerald" : ans.score >= 50 ? "amber" : "red"}
                          size="sm"
                        >
                          {ans.score}/100
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(ans.created_at), "MMM d, yyyy")}
                      </span>
                      {ans.source === "prep_lab" && (
                        <Badge variant="blue" size="sm">Prep Lab</Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      to="/app/live"
                      state={{ practicePrompt: ans.question_text }}
                      className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-all"
                      title="Practice this with Coach"
                      aria-label="Practice this with Coach"
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </Link>
                    <Link
                      to={`/app/answers/${ans.id}`}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                      title="Open detail"
                      aria-label="Open detail"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => navigator.clipboard.writeText(ans.answer_text ?? "")}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                      title="Copy answer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditId(ans.id);
                        setEditText(ans.answer_text ?? "");
                        setExpanded((p) => ({ ...p, [ans.id]: true }));
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(ans.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-accent/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [ans.id]: !p[ans.id] }))}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                    >
                      {isOpen
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {isEditing ? (
                      <>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={6}
                          className="w-full bg-background border border-primary/50 text-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={saveEdit}
                            leftIcon={<Check className="w-3 h-3" />}
                          >
                            Save changes
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {ans.answer_text}
                      </p>
                    )}

                    {/* STAR breakdown */}
                    {ans.star_breakdown && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {Object.entries(ans.star_breakdown).map(([k, v]) => (
                          <div
                            key={k}
                            className="bg-secondary border border-border rounded-xl p-3"
                          >
                            <p className="text-[10px] font-bold text-primary uppercase mb-1">
                              {k}
                            </p>
                            <p className="text-xs text-muted-foreground">{v as string}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete answer?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete this saved answer.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" fullWidth onClick={deleteAnswer}>
            Delete
          </Button>
        </div>
      </Modal>

      {/* Add new answer modal */}
      <AddAnswerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(a) => { setAnswers((p) => [a, ...p]); setAddOpen(false); }}
        userId={user?.id ?? ""}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AddAnswerModal
// ─────────────────────────────────────────────────────────────────

function AddAnswerModal({
  open, onClose, onSaved, userId,
}: {
  open:    boolean;
  onClose: () => void;
  onSaved: (a: Tables<"answer_bank">) => void;
  userId:  string;
}) {
  const [question, setQuestion] = useState("");
  const [answer,   setAnswer]   = useState("");
  const [category, setCategory] = useState("Behavioural");
  const [saving,   setSaving]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState(false);

  async function handleGenerateWithAi() {
    if (!question.trim() || generating) return;
    setGenerating(true);
    try {
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "star_method",
        input: `Interview question:\n${question.trim()}\n\nDraft a complete STAR answer from scratch for this question. Invent plausible, specific details the candidate can edit.`,
      });
      const text = (data.result ?? "").trim();
      if (!text) throw new Error("AI returned an empty answer.");
      setAnswer(text);
      setAiDraft(true);
      await refreshCredits();
      toast.success("Draft generated — review before saving");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate answer.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      const data = await answerBankDB.create(userId, {
        question_text: question.trim(),
        answer_text:   answer.trim(),
        category,
        source:        aiDraft ? "prep_lab" : "manual",
      });
      onSaved(data);
      setQuestion("");
      setAnswer("");
      setCategory("Behavioural");
      setAiDraft(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save answer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add answer to bank" size="lg">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Question</p>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Tell me about a time you failed…"
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <p className="text-xs text-muted-foreground">Your answer</p>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              loading={generating}
              disabled={!question.trim() || generating || saving}
              onClick={() => void handleGenerateWithAi()}
              leftIcon={<Sparkles className="w-3 h-3" />}
            >
              Generate with AI
            </Button>
          </div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write your STAR answer here, or generate a draft with AI…"
            rows={6}
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c !== "All").map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                  category === c
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            loading={saving}
            disabled={!question.trim() || !answer.trim() || generating}
            onClick={handleSave}
            leftIcon={<Star className="w-3.5 h-3.5" />}
          >
            Save to bank
          </Button>
        </div>
      </div>
    </Modal>
  );
}
