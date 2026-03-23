// @ts-nocheck -- retained: answer_bank table types not yet in Supabase generated schema (added via
// manual migration); removed type annotation would produce ~20 implicit-any errors on row access.
// Full fix requires regenerating types from DB schema.
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { toast } from "sonner";
import {
  BookOpen, Search, Star, Trash2,
  ChevronDown, ChevronUp, Copy,
  Edit2, Check, Filter, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// AnswerBank — saved STAR answers + session saves
// ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Behavioural", "Technical", "Leadership", "System Design", "HR"];

export default function AnswerBank() {
  const { user }  = useAuthStore();

  const [answers,   setAnswers]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
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
    setLoading(true);
    const { data } = await supabase
      .from("answer_bank")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    setAnswers(data ?? []);
    setLoading(false);
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      const { error } = await supabase
        .from("answer_bank")
        .update({ answer_text: editText })
        .eq("id", editId);
      if (error) throw error;
      setAnswers((p) =>
        p.map((a) => a.id === editId ? { ...a, answer_text: editText } : a)
      );
      setEditId(null);
      toast.success("Answer updated");
    } catch (err) {
      toast.error(err?.message ?? "Failed to update answer.");
    }
  }

  async function deleteAnswer() {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("answer_bank").delete().eq("id", deleteId);
      if (error) throw error;
      setAnswers((p) => p.filter((a) => a.id !== deleteId));
      setDeleteId(null);
      toast.success("Answer deleted");
    } catch (err) {
      toast.error(err?.message ?? "Failed to delete answer.");
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
      <PageHeader
        title="Answer Bank"
        subtitle="Your saved STAR answers and best responses"
        action={
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
        <Card className="text-center py-16">
          <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No saved answers yet.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Save answers from sessions or build them in Prep Lab.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((ans) => {
            const isOpen = expanded[ans.id];
            const isEditing = editId === ans.id;

            return (
              <Card key={ans.id}>
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Star className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {ans.question_text}
                    </p>
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
                            <p className="text-[10px] font-bold text-violet-400 uppercase mb-1">
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
  onSaved: (a: any) => void;
  userId:  string;
}) {
  const [question, setQuestion] = useState("");
  const [answer,   setAnswer]   = useState("");
  const [category, setCategory] = useState("Behavioural");
  const [saving,   setSaving]   = useState(false);

  async function handleSave() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);

    const { data } = await supabase
      .from("answer_bank")
      .insert({
        user_id:       userId,
        question_text: question.trim(),
        answer_text:   answer.trim(),
        category,
        source:        "manual",
      })
      .select()
      .single();

    setSaving(false);
    if (data) {
      onSaved(data);
      setQuestion(""); setAnswer(""); setCategory("Behavioural");
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
          <p className="text-xs text-muted-foreground mb-1.5">Your answer</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write your STAR answer here…"
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
            disabled={!question.trim() || !answer.trim()}
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
