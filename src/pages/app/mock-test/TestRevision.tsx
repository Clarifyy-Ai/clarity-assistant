// @ts-nocheck
import { useEffect, useState } from "react";
import {
  CheckCircle, XCircle, Award, ChevronDown, RotateCcw,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// Spaced repetition intervals (days)
// I knew this: 1 → 3 → 7 → 14 → 30
// ─────────────────────────────────────────────────────────────────

const INTERVALS = [1, 3, 7, 14, 30];

function nextInterval(currentInterval: number): number {
  const idx = INTERVALS.indexOf(currentInterval);
  if (idx === -1 || idx === INTERVALS.length - 1) return INTERVALS[INTERVALS.length - 1];
  return INTERVALS[idx + 1];
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

interface RevisionItem {
  id: string;
  question_id: string;
  interval_days: number;
  review_count: number;
  question: {
    id: string;
    question_text: string;
    question_type: string;
    options: Array<{ label: string; text: string }> | null;
    correct_answer: string;
    explanation: string;
    subject: string;
    topic: string;
    difficulty: string;
  };
}

export default function TestRevision() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    loadRevisionItems();
  }, [user?.id]);

  async function loadRevisionItems() {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("revision_list")
        .select(`
          id, question_id, interval_days, review_count,
          question:questions!revision_list_question_id_fkey (
            id, question_text, question_type, options,
            correct_answer, explanation, subject, topic, difficulty
          )
        `)
        .eq("user_id", user!.id)
        .eq("is_mastered", false)
        .lte("next_review_date", today)
        .order("next_review_date", { ascending: true })
        .limit(50);

      if (error) throw error;
      setItems((data ?? []) as unknown as RevisionItem[]);
    } catch (err: unknown) {
      console.error("[TestRevision] load error:", err);
      const _m = err instanceof Error ? err.message : "Failed to load revision items. Please try again.";
      toast.error(_m);
    } finally {
      setLoading(false);
    }
  }

  async function handleKnew() {
    const item = items[currentIndex];
    if (!item) return;
    const next = nextInterval(item.interval_days);
    try {
      await supabase
        .from("revision_list")
        .update({
          next_review_date: addDays(next),
          interval_days: next,
          review_count: item.review_count + 1,
        })
        .eq("id", item.id);
      advance();
    } catch (err) {
      toast.error("Failed to update");
    }
  }

  async function handleStruggling() {
    const item = items[currentIndex];
    if (!item) return;
    try {
      await supabase
        .from("revision_list")
        .update({
          next_review_date: addDays(1),
          interval_days: 1,
          review_count: item.review_count + 1,
        })
        .eq("id", item.id);
      advance();
    } catch (err) {
      toast.error("Failed to update");
    }
  }

  async function handleMastered() {
    const item = items[currentIndex];
    if (!item) return;
    try {
      await supabase
        .from("revision_list")
        .update({ is_mastered: true })
        .eq("id", item.id);
      toast.success("Marked as mastered!");
      advance();
    } catch (err) {
      toast.error("Failed to update");
    }
  }

  function advance() {
    setDoneCount((c) => c + 1);
    setShowAnswer(false);
    if (currentIndex + 1 >= items.length) {
      setCurrentIndex(items.length); // done state
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const isDone = currentIndex >= items.length;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Revision List"
        description="Spaced repetition review — questions due for review today."
      />

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-300"
              style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {doneCount}/{items.length}
          </span>
        </div>
      )}

      {/* All done / empty state */}
      {(isDone || items.length === 0) && (
        <Card className="border-green-500/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <Award className="h-8 w-8 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">
              {items.length === 0 ? "No reviews due today!" : "All done! Great work!"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {items.length === 0
                ? "You have no questions due for review. Keep practicing to build your revision queue."
                : "You've reviewed all questions due today. Check back tomorrow for the next batch."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentIndex(0);
                setDoneCount(0);
                setShowAnswer(false);
                loadRevisionItems();
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reload
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Flashcard */}
      {!isDone && items.length > 0 && (() => {
        const item = items[currentIndex];
        const q = item.question;
        return (
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{q.subject} · {q.topic}</span>
              <span>Interval: {item.interval_days}d · Reviews: {item.review_count}</span>
            </div>

            {/* Question card */}
            <Card>
              <CardContent className="py-5">
                <p className="text-sm text-foreground leading-relaxed">{q.question_text}</p>

                {/* Options for MCQ */}
                {q.question_type === "MCQ" && q.options && (
                  <div className="mt-4 space-y-2">
                    {q.options.map((opt) => (
                      <div
                        key={opt.label}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 text-sm transition-all",
                          showAnswer && opt.label === q.correct_answer
                            ? "border-green-500/50 bg-green-500/10 text-green-400"
                            : "border-border text-foreground"
                        )}
                      >
                        <span className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                          showAnswer && opt.label === q.correct_answer
                            ? "border-green-500 bg-green-500 text-white"
                            : "border-border"
                        )}>
                          {opt.label}
                        </span>
                        {opt.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Show/hide answer */}
                {!showAnswer ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setShowAnswer(true)}
                  >
                    <ChevronDown className="h-4 w-4 mr-1.5" />
                    Show Answer
                  </Button>
                ) : (
                  <div className="mt-4 space-y-3">
                    {q.question_type !== "MCQ" && (
                      <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-2 text-sm font-semibold text-green-400">
                        Answer: {q.correct_answer}
                      </div>
                    )}
                    {q.explanation && (
                      <div className="rounded-lg bg-muted/20 border border-border px-4 py-3 text-xs text-foreground/80">
                        <span className="font-semibold text-violet-400 block mb-1">Explanation</span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action buttons */}
            {showAnswer && (
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  onClick={handleStruggling}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Struggling
                </Button>
                <Button
                  onClick={handleKnew}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  I Knew It
                </Button>
                <Button
                  variant="outline"
                  onClick={handleMastered}
                  className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                >
                  <Award className="h-4 w-4 mr-1.5" />
                  Mastered
                </Button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
