import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Edit2,
  Filter,
  FlaskConical,
  Loader2,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { questionsDB } from "@/lib/supabase/database";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  exam_type: string | null;
  correct_answer: string;
  explanation: string | null;
  created_at: string;
  is_verified: boolean;
}

type SortKey =
  | "question_text"
  | "subject"
  | "topic"
  | "difficulty"
  | "exam_type"
  | "created_at";

type SortDir = "asc" | "desc";

const ALL = "__ALL__";

const DIFFICULTY_COLOR: Record<string, string> = {
  EASY: "border-green-500/20 bg-green-500/10 text-green-600",
  MEDIUM: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  HARD: "border-red-500/20 bg-red-500/10 text-red-600",
};

function compareValues(a: string | null, b: string | null, dir: SortDir) {
  const left = (a ?? "").toLowerCase();
  const right = (b ?? "").toLowerCase();

  if (left < right) return dir === "asc" ? -1 : 1;
  if (left > right) return dir === "asc" ? 1 : -1;
  return 0;
}

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return sortDir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

function EditModal({
  question,
  onClose,
  onSaved,
}: {
  question: Question;
  onClose: () => void;
  onSaved: (updated: Question) => void;
}) {
  const [form, setForm] = useState<Question>({ ...question });
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof Question>(key: K, value: Question[K]) {
    setForm((prev) => ({ ...prev, value }));
  }

  async function handleSave() {
    if (!form.question_text.trim()) {
      toast.error("Question text is required.");
      return;
    }

    if (!form.topic.trim()) {
      toast.error("Topic is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        question_text: form.question_text.trim(),
        subject: form.subject,
        topic: form.topic.trim(),
        difficulty: form.difficulty,
        correct_answer: form.correct_answer,
        explanation: form.explanation,
        exam_type: form.exam_type,
      };

      await questionsDB.update(question.id, payload);

      const updated: Question = {
        ...question,
        ...payload,
      };

      toast.success("Question updated.");
      onSaved(updated);
    } catch (error) {
      console.error("[MyQuestions/EditModal] save failed:", error);
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
          <DialogDescription className="sr-only">
            Edit question text, subject, topic, and answer options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Question Text</Label>
            <Textarea
              className="min-h-[100px] font-mono text-sm"
              value={form.question_text}
              onChange={(e) => setField("question_text", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setField("subject", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Input
                value={form.topic}
                onChange={(e) => setField("topic", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select
                value={form.difficulty}
                onValueChange={(value) =>
                  setField("difficulty", value as Question["difficulty"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                onChange={(e) =>
                  setField("exam_type", e.target.value.trim() || null)
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Correct Answer</Label>
            <Input
              value={form.correct_answer}
              onChange={(e) => setField("correct_answer", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Explanation</Label>
            <Textarea
              className="min-h-[80px] text-sm"
              value={form.explanation ?? ""}
              onChange={(e) => setField("explanation", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyQuestions() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingTest, setCreatingTest] = useState(false);

  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState(ALL);
  const [filterDifficulty, setFilterDifficulty] = useState(ALL);
  const [filterExamType, setFilterExamType] = useState(ALL);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Question | null>(null);

  const loadQuestions = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    setLoadError(null);

    try {
      const data = await questionsDB.list({
        uploadedBy: user.id,
        columns:
          "id, question_text, question_type, subject, topic, difficulty, exam_type, correct_answer, explanation, created_at, is_verified",
      });
      setQuestions(data as Question[]);
    } catch (error) {
      console.error("[MyQuestions] load failed:", error);
      const message = error instanceof Error ? error.message : "Failed to load questions.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const subjects = useMemo(
    () => [...new Set(questions.map((q) => q.subject).filter(Boolean))].sort(),
    [questions]
  );

  const examTypes = useMemo(
    () =>
      [...new Set(questions.map((q) => q.exam_type).filter(Boolean) as string[])].sort(),
    [questions]
  );

  const filtered = useMemo(() => {
    const list = questions.filter((question) => {
      if (filterSubject !== ALL && question.subject !== filterSubject) return false;
      if (filterDifficulty !== ALL && question.difficulty !== filterDifficulty)
        return false;
      if (filterExamType !== ALL && question.exam_type !== filterExamType)
        return false;

      if (search.trim()) {
        const s = search.toLowerCase();
        if (
          !question.question_text.toLowerCase().includes(s) &&
          !question.topic.toLowerCase().includes(s) &&
          !question.subject.toLowerCase().includes(s)
        ) {
          return false;
        }
      }

      return true;
    });

    return list.sort((a, b) => {
      if (sortKey === "created_at") {
        const left = new Date(a.created_at).getTime();
        const right = new Date(b.created_at).getTime();
        return sortDir === "asc" ? left - right : right - left;
      }

      return compareValues(
        (a[sortKey] as string | null) ?? "",
        (b[sortKey] as string | null) ?? "",
        sortDir
      );
    });
  }, [
    questions,
    filterSubject,
    filterDifficulty,
    filterExamType,
    search,
    sortKey,
    sortDir,
  ]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((question) => selected.has(question.id));

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((question) => question.id)));
    }
  }

  async function handleDelete(id: string) {
    try {
      await questionsDB.delete(id);

      setQuestions((prev) => prev.filter((question) => question.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      toast.success("Question deleted.");
    } catch (error) {
      console.error("[MyQuestions] delete failed:", error);
      toast.error("Failed to delete question.");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;

    try {
      await questionsDB.deleteMany(ids);

      setQuestions((prev) => prev.filter((question) => !ids.includes(question.id)));
      setSelected(new Set());

      toast.success(`${ids.length} question${ids.length > 1 ? "s" : ""} deleted.`);
    } catch (error) {
      console.error("[MyQuestions] bulk delete failed:", error);
      toast.error("Failed to delete selected questions.");
    }
  }

  async function handleCreateTestFromSelected() {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one question.");
      return;
    }

    setCreatingTest(true);

    try {
      const config = {
        exam_type: "CUSTOM",
        test_name: `Custom Selected Test (${ids.length})`,
        subjects: [],
        topics: [],
        source_types: ["USER_UPLOAD"],
        year_range: null,
        difficulty_distribution: { EASY: 20, MEDIUM: 60, HARD: 20 },
        question_count: ids.length,
        duration_minutes: Math.max(10, ids.length * 2),
        marks_positive: 4,
        marks_negative: 1,
        randomize_order: true,
        shuffle_options: true,
      };

      const data = await fetchEdgeJson<{
        test_id?: string;
        test?: { id?: string };
        error?: string;
      }>("create-test", {
        test_name: config.test_name,
        config,
        question_ids: ids,
      });

      if (data.error) throw new Error(data.error);

      const testId = data.test_id ?? data.test?.id;
      if (!testId) throw new Error("No test ID returned.");

      toast.success("Custom test created.");
      navigate(`/app/mock-test/session/${testId}`);
    } catch (error) {
      console.error("[MyQuestions] create test failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create test.");
    } finally {
      setCreatingTest(false);
    }
  }

  function handleEdited(updated: Question) {
    setQuestions((prev) =>
      prev.map((question) => (question.id === updated.id ? updated : question))
    );
    setEditTarget(null);
  }

  function ColHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <button
        type="button"
        onClick={() => handleSort(col)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
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
            <Link
              to="/app/mock-test/upload"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary/60"
            >
              <Upload className="h-4 w-4" />
              Import PDF/Excel
            </Link>

            <Link
              to="/app/mock-test/upload?tab=manual"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/90/25"
            >
              <Plus className="h-4 w-4" />
              New Question
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search questions…"
            aria-label="Search questions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-1 h-4 w-4" />
              {filterSubject === ALL ? "Subject" : filterSubject}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterSubject(ALL)}>
              All Subjects
            </DropdownMenuItem>
            {subjects.map((subject) => (
              <DropdownMenuItem
                key={subject}
                onClick={() => setFilterSubject(subject)}
              >
                {subject}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {filterDifficulty === ALL ? "Difficulty" : filterDifficulty}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterDifficulty(ALL)}>
              All
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterDifficulty("EASY")}>
              Easy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterDifficulty("MEDIUM")}>
              Medium
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterDifficulty("HARD")}>
              Hard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {examTypes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {filterExamType === ALL ? "Exam" : filterExamType}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterExamType(ALL)}>
                All
              </DropdownMenuItem>
              {examTypes.map((examType) => (
                <DropdownMenuItem
                  key={examType}
                  onClick={() => setFilterExamType(examType)}
                >
                  {examType}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {selected.size > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCreateTestFromSelected()}
              disabled={creatingTest}
            >
              {creatingTest ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="mr-1 h-4 w-4" />
              )}
              Create Test ({selected.size})
            </Button>

            <Button variant="destructive" size="sm" onClick={() => void handleBulkDelete()}>
              <Trash2 className="mr-1 h-4 w-4" />
              Delete {selected.size}
            </Button>
          </>
        )}
      </div>

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void loadQuestions()} />
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={questions.length === 0 ? "No questions yet" : "No results for these filters"}
          description={
            questions.length === 0
              ? "Import a PDF/Excel file or create questions manually."
              : "Try adjusting the search or filters."
          }
          actionLabel={questions.length === 0 ? "Import Questions" : undefined}
          onAction={questions.length === 0 ? () => navigate("/app/mock-test/upload") : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 hover:text-foreground"
              aria-label="Select all"
            >
              {allFilteredSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>

            <span className="flex-1">
              <ColHeader label="Question" col="question_text" />
            </span>

            <span className="hidden w-28 sm:block">
              <ColHeader label="Subject" col="subject" />
            </span>

            <span className="hidden w-28 md:block">
              <ColHeader label="Topic" col="topic" />
            </span>

            <span className="w-16">
              <ColHeader label="Difficulty" col="difficulty" />
            </span>

            <span className="hidden w-24 xl:block">
              <ColHeader label="Exam" col="exam_type" />
            </span>

            <span className="hidden w-24 text-right lg:block">
              <ColHeader label="Added" col="created_at" />
            </span>

            <span className="w-16 text-right">Actions</span>
          </div>

          {filtered.map((question) => (
            <div
              key={question.id}
              className={cn(
                "flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-0",
                selected.has(question.id) ? "bg-primary/5" : "hover:bg-muted/20"
              )}
            >
              <button
                type="button"
                onClick={() => toggleSelect(question.id)}
                className="shrink-0"
                aria-label="Select question"
              >
                {selected.has(question.id) ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              <p className="flex-1 truncate text-sm text-foreground">
                {question.question_text.length > 75
                  ? `${question.question_text.slice(0, 75)}…`
                  : question.question_text}
              </p>

              <div className="hidden w-28 truncate text-xs text-muted-foreground sm:block">
                {question.subject}
              </div>

              <div className="hidden w-28 truncate text-xs text-muted-foreground md:block">
                {question.topic}
              </div>

              <span
                className={cn(
                  "inline-flex w-16 justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  DIFFICULTY_COLOR[question.difficulty] ??
                    "border-slate-500/20 bg-slate-500/10 text-slate-500"
                )}
              >
                {question.difficulty}
              </span>

              <div className="hidden w-24 truncate text-xs text-muted-foreground xl:block">
                {question.exam_type ?? <span className="italic">—</span>}
              </div>

              <div className="hidden w-24 text-right text-xs text-muted-foreground lg:block">
                {new Date(question.created_at).toLocaleDateString()}
              </div>

              <div className="flex w-16 items-center justify-end gap-1">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Edit"
                  onClick={() => setEditTarget(question)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                  onClick={() => setDeleteTarget(question.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the question from your bank. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && void handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
