import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Search, Trash2, Edit2, ChevronDown,
  BookOpen, Upload, Filter, CheckSquare, Square,
  FlaskConical, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  created_at: string;
  is_verified: boolean;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  EASY:   "bg-green-500/10 text-green-600 border-green-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  HARD:   "bg-red-500/10  text-red-600   border-red-500/20",
};

const ALL = "__ALL__";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MyQuestions() {
  const user = useAuthStore((s) => s.user);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterSubject, setFilterSubject]     = useState(ALL);
  const [filterDifficulty, setFilterDifficulty] = useState(ALL);
  const [filterExamType, setFilterExamType]   = useState(ALL);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, subject, topic, difficulty, exam_type, correct_answer, created_at, is_verified")
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

  // ── Derived filter options ────────────────────────────────────────────────

  const subjects   = [...new Set(questions.map((q) => q.subject))].sort();
  const examTypes  = [...new Set(questions.map((q) => q.exam_type).filter(Boolean))].sort() as string[];

  const filtered = questions.filter((q) => {
    if (filterSubject !== ALL && q.subject !== filterSubject) return false;
    if (filterDifficulty !== ALL && q.difficulty !== filterDifficulty) return false;
    if (filterExamType !== ALL && q.exam_type !== filterExamType) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!q.question_text.toLowerCase().includes(s) && !q.topic.toLowerCase().includes(s)) return false;
    }
    return true;
  });

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

  const allFilteredSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));

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
                {filterExamType === ALL ? "Exam Type" : filterExamType}
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
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete {selected.size}
          </Button>
        )}

        {selected.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <Link to={`/app/mock-test/configure?question_ids=${[...selected].join(",")}`}>
              <FlaskConical className="h-4 w-4 mr-1" />
              Create Test
            </Link>
          </Button>
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
            <span className="flex-1">Question</span>
            <span className="w-28 hidden sm:block">Subject · Topic</span>
            <span className="w-16 hidden md:block">Type</span>
            <span className="w-16">Difficulty</span>
            <span className="w-20 text-right">Actions</span>
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
                {q.question_text.length > 80
                  ? q.question_text.slice(0, 80) + "…"
                  : q.question_text}
              </p>

              <div className="w-28 hidden sm:block text-xs text-muted-foreground truncate">
                <span className="font-medium text-foreground">{q.subject}</span>
                <br />
                <span>{q.topic}</span>
              </div>

              <span className="w-16 hidden md:block text-xs text-muted-foreground">
                {q.question_type}
              </span>

              <Badge
                variant="outline"
                className={`w-16 text-center text-xs ${DIFFICULTY_COLOR[q.difficulty] ?? ""}`}
              >
                {q.difficulty}
              </Badge>

              <div className="w-20 flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  asChild
                >
                  <Link to={`/app/mock-test/upload?tab=manual&edit=${q.id}`}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(q.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirmation dialog ─────────────────────── */}
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
    </div>
  );
}
