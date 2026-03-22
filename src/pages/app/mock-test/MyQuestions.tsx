import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Search, Trash2, ChevronDown, ChevronUp,
  BookOpen, Upload, Filter, CheckSquare, Square,
  FlaskConical, ChevronsUpDown, Edit2, Check, X, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  exam_type: string | null;
  correct_answer: string;
  explanation: string;
  created_at: string;
  is_verified: boolean;
}

type SortKey = "question_text" | "subject" | "topic" | "difficulty" | "exam_type" | "created_at";
type SortDir = "asc" | "desc";

const DIFFICULTY_COLOR: Record<string, string> = {
  EASY:   "bg-green-500/10 text-green-600 border-green-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  HARD:   "bg-red-500/10  text-red-600   border-red-500/20",
};

const ALL = "__ALL__";

// ─────────────────────────────────────────────────────────────────────────────
// Inline Edit Modal
// ─────────────────────────────────────────────────────────────────────────────

function EditModal({
  question,
  onClose,
  onSaved,
}: {
  question: Question;
  onClose: () => void;
  onSaved: (updated: Question) => void;
}) {
  const [form, setForm] = useState({ ...question });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Question>(key: K, val: Question[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.question_text.trim()) { toast.error("Question text is required."); return; }
    if (!form.topic.trim()) { toast.error("Topic is required."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("questions").update({
        question_text: form.question_text.trim(),
        subject:       form.subject,
        topic:         form.topic.trim(),
        difficulty:    form.difficulty,
        correct_answer: form.correct_answer,
        explanation:   form.explanation,
        exam_type:     form.exam_type,
      }).eq("id", question.id);
      if (error) throw error;
      toast.success("Question updated.");
      onSaved({ ...question, ...form });
    } catch (err) {
      console.error("[EditModal] save error:", err);
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Question Text</Label>
            <Textarea
              className="min-h-[100px] font-mono text-sm"
              value={form.question_text}
              onChange={(e) => set("question_text", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Input value={form.topic} onChange={(e) => set("topic", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={form.difficulty} onValueChange={(v) => set("difficulty", v as Question["difficulty"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EASY">Easy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Exam Type</Label>
              <Input
                placeholder="e.g. JEE_MAIN"
                value={form.exam_type ?? ""}
                onChange={(e) => set("exam_type", e.target.value || null)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Correct Answer</Label>
            <Input value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Explanation</Label>
            <Textarea
              className="min-h-[80px] text-sm"
              value={form.explanation ?? ""}
              onChange={(e) => set("explanation", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort Icon
// ─────────────────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3" />
    : <ChevronDown className="h-3 w-3" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MyQuestions() {
  const user = useAuthStore((s) => s.user);

  const [questions, setQuestions]   = useState<Question[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [filterSubject, setFilterSubject]       = useState(ALL);
  const [filterDifficulty, setFilterDifficulty] = useState(ALL);
  const [filterExamType, setFilterExamType]     = useState(ALL);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget]     = useState<Question | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("created_at");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");

  const loadQuestions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, subject, topic, difficulty, exam_type, correct_answer, explanation, created_at, is_verified")
        .eq("uploaded_by", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuestions((data ?? []) as Question[]);
    } catch (err) {
      console.error("[MyQuestions] load error:", err);
      toast.error("Failed to load questions.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // ── Derived options ───────────────────────────────────────────────────────

  const subjects  = [...new Set(questions.map((q) => q.subject))].sort();
  const examTypes = [...new Set(questions.map((q) => q.exam_type).filter(Boolean))].sort() as string[];

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = questions
    .filter((q) => {
      if (filterSubject !== ALL && q.subject !== filterSubject) return false;
      if (filterDifficulty !== ALL && q.difficulty !== filterDifficulty) return false;
      if (filterExamType !== ALL && q.exam_type !== filterExamType) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!q.question_text.toLowerCase().includes(s) && !q.topic.toLowerCase().includes(s)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((q) => q.id)));
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Question deleted.");
    } catch (err) {
      console.error("[MyQuestions] delete error:", err);
      toast.error("Failed to delete question.");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    try {
      const { error } = await supabase.from("questions").delete().in("id", ids);
      if (error) throw error;
      setQuestions((prev) => prev.filter((q) => !ids.includes(q.id)));
      setSelected(new Set());
      toast.success(`${ids.length} question${ids.length > 1 ? "s" : ""} deleted.`);
    } catch (err) {
      console.error("[MyQuestions] bulk delete error:", err);
      toast.error("Failed to delete questions.");
    }
  }

  function handleEdited(updated: Question) {
    setQuestions((prev) => prev.map((q) => q.id === updated.id ? updated : q));
    setEditTarget(null);
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));

  // ── Column header renderer ─────────────────────────────────────────────────

  function ColHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <button
        type="button"
        onClick={() => handleSort(col)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label} <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Question Bank"
        description={`${questions.length} question${questions.length !== 1 ? "s" : ""} in your personal bank.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/mock-test/upload">
                <Upload className="h-4 w-4 mr-2" />
                Import PDF
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/mock-test/upload?tab=manual">
                <Plus className="h-4 w-4 mr-2" />
                New Question
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search questions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1" />
              {filterSubject === ALL ? "Subject" : filterSubject}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterSubject(ALL)}>All Subjects</DropdownMenuItem>
            {subjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setFilterSubject(s)}>{s}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {filterDifficulty === ALL ? "Difficulty" : filterDifficulty}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterDifficulty(ALL)}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterDifficulty("EASY")}>Easy</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterDifficulty("MEDIUM")}>Medium</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterDifficulty("HARD")}>Hard</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {examTypes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {filterExamType === ALL ? "Exam" : filterExamType}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterExamType(ALL)}>All</DropdownMenuItem>
              {examTypes.map((e) => (
                <DropdownMenuItem key={e} onClick={() => setFilterExamType(e)}>{e}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {selected.size > 0 && (
          <>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete {selected.size}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/app/mock-test/configure?question_ids=${[...selected].join(",")}`}>
                <FlaskConical className="h-4 w-4 mr-1" />
                Create Test
              </Link>
            </Button>
          </>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">
              {questions.length === 0 ? "No questions yet" : "No results for these filters"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {questions.length === 0
                ? "Import a PDF or create questions manually."
                : "Try adjusting the search or filters."}
            </p>
            {questions.length === 0 && (
              <Button size="sm" className="mt-4" asChild>
                <Link to="/app/mock-test/upload">
                  <Upload className="h-4 w-4 mr-2" /> Import Questions
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 hover:text-foreground"
              aria-label="Select all"
            >
              {allFilteredSelected ? (
                <CheckSquare className="h-4 w-4 text-violet-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <span className="flex-1">
              <ColHeader label="Question" col="question_text" />
            </span>
            <span className="w-28 hidden sm:block">
              <ColHeader label="Subject" col="subject" />
            </span>
            <span className="w-28 hidden md:block">
              <ColHeader label="Topic" col="topic" />
            </span>
            <span className="w-16">
              <ColHeader label="Difficulty" col="difficulty" />
            </span>
            <span className="w-24 hidden xl:block">
              <ColHeader label="Exam" col="exam_type" />
            </span>
            <span className="w-24 hidden lg:block text-right">
              <ColHeader label="Added" col="created_at" />
            </span>
            <span className="w-16 text-right">Actions</span>
          </div>

          {/* Rows */}
          {filtered.map((q) => (
            <div
              key={q.id}
              className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 transition-colors ${
                selected.has(q.id) ? "bg-violet-500/5" : "hover:bg-muted/20"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSelect(q.id)}
                className="shrink-0"
                aria-label="Select"
              >
                {selected.has(q.id) ? (
                  <CheckSquare className="h-4 w-4 text-violet-600" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              <p className="flex-1 text-sm text-foreground truncate">
                {q.question_text.length > 75
                  ? q.question_text.slice(0, 75) + "…"
                  : q.question_text}
              </p>

              <div className="w-28 hidden sm:block text-xs text-muted-foreground truncate">
                {q.subject}
              </div>

              <div className="w-28 hidden md:block text-xs text-muted-foreground truncate">
                {q.topic}
              </div>

              <Badge
                variant="outline"
                className={`w-16 text-center text-xs ${DIFFICULTY_COLOR[q.difficulty] ?? ""}`}
              >
                {q.difficulty}
              </Badge>

              <div className="w-24 hidden xl:block text-xs text-muted-foreground truncate">
                {q.exam_type ?? <span className="italic">—</span>}
              </div>

              <div className="w-24 hidden lg:block text-xs text-muted-foreground text-right">
                {new Date(q.created_at).toLocaleDateString()}
              </div>

              <div className="w-16 flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Edit"
                  onClick={() => setEditTarget(q)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Delete"
                  onClick={() => setDeleteTarget(q.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the question from your bank. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Inline Edit Modal ──────────────────────────────── */}
      {editTarget && (
        <EditModal
          question={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEdited}
        />
      )}
    </div>
  );
}
