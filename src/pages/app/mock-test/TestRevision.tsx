import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle,
  ChevronDown,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

const INTERVALS = [1, 3, 7, 14, 30];

function nextInterval(currentInterval: number): number {
  const index = INTERVALS.indexOf(currentInterval);

  if (index === -1 || index === INTERVALS.length - 1) {
    return INTERVALS[INTERVALS.length - 1];
  }

  return INTERVALS[index + 1];
}

function addDays(days: number): string {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return date.toISOString().split("T")[0];
}

interface RevisionOption {
  label: string;
  text: string;
}

interface RevisionQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: RevisionOption[];
  correct_answer: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: string;
}

interface RevisionItem {
  id: string;
  question_id: string;
  interval_days: number;
  review_count: number;
  question: RevisionQuestion;
}

function normalizeOptions(options: unknown): RevisionOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .filter(
      (option) =>
        option &&
        typeof option === "object" &&
        typeof (option as any).label === "string" &&
        typeof (option as any).text === "string"
    )
    .map((option) => ({
      label: String((option as any).label).slice(0, 2),
      text: String((option as any).text).trim(),
    }));
}

function normalizeQuestion(question: any): RevisionQuestion {
  return {
    id: String(question?.id ?? crypto.randomUUID()),
    question_text: String(question?.question_text ?? ""),
    question_type: String(question?.question_type ?? "SHORT_ANSWER"),
    options: normalizeOptions(question?.options),
    correct_answer: String(question?.correct_answer ?? ""),
    explanation: String(question?.explanation ?? ""),
    subject: String(question?.subject ?? "General"),
    topic: String(question?.topic ?? "General"),
    difficulty: String(question?.difficulty ?? "MEDIUM"),
  };
}

export default function TestRevision() {
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void loadRevisionItems();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const currentItem = items[currentIndex] ?? null;

  const isDone = currentIndex >= items.length;

  const progressPercent = useMemo(() => {
    if (items.length === 0) {
      return 0;
    }

    return Math.round((doneCount / items.length) * 100);
  }, [doneCount, items.length]);

  async function loadRevisionItems() {
    setLoading(true);

    try {
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("revision_list")
        .select(
          `
            id,
            question_id,
            interval_days,
            review_count,
            question:questions!revision_list_question_id_fkey (
              id,
              question_text,
              question_type,
              options,
              correct_answer,
              explanation,
              subject,
              topic,
              difficulty
            )
          `
        )
        .eq("user_id", user!.id)
        .eq("is_mastered", false)
        .lte("next_review_date", today)
        .order("next_review_date", { ascending: true })
        .limit(50);

      if (error) {
        throw error;
      }

      const normalized: RevisionItem[] = Array.isArray(data)
        ? data
            .filter((item: any) => item?.question)
            .map((item: any) => ({
              id: String(item.id),
              question_id: String(item.question_id),
              interval_days: Number(item.interval_days ?? 1),
              review_count: Number(item.review_count ?? 0),
              question: normalizeQuestion(item.question),
            }))
            .filter(
              (item) =>
                item.question &&
                item.question.question_text.length > 0
            )
        : [];

      setItems(normalized);
      setCurrentIndex(0);
      setDoneCount(0);
      setShowAnswer(false);
    } catch (error) {
      console.error("[TestRevision] load failed:", error);

      toast.error("Failed to load revision items.");
    } finally {
      setLoading(false);
    }
  }

  async function updateRevision(
    item: RevisionItem,
    payload: Record<string, unknown>,
    successMessage?: string
  ) {
    setUpdating(true);

    try {
      const { error } = await supabase
        .from("revision_list")
        .update(payload)
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      if (successMessage) {
        toast.success(successMessage);
      }

      advance();
    } catch (error) {
      console.error("[TestRevision] update failed:", error);

      toast.error("Failed to update revision progress.");
    } finally {
      setUpdating(false);
    }
  }

  function advance() {
    setDoneCount((prev) => prev + 1);

    setShowAnswer(false);

    setCurrentIndex((prev) => {
      if (prev + 1 >= items.length) {
        return items.length;
      }

      return prev + 1;
    });
  }

  async function handleKnew() {
    if (!currentItem) {
      return;
    }

    const next = nextInterval(
      Number(currentItem.interval_days ?? 1)
    );

    await updateRevision(currentItem, {
      next_review_date: addDays(next),
      interval_days: next,
      review_count:
        Number(currentItem.review_count ?? 0) + 1,
    });
  }

  async function handleStruggling() {
    if (!currentItem) {
      return;
    }

    await updateRevision(currentItem, {
      next_review_date: addDays(1),
      interval_days: 1,
      review_count:
        Number(currentItem.review_count ?? 0) + 1,
    });
  }

  async function handleMastered() {
    if (!currentItem) {
      return;
    }

    await updateRevision(
      currentItem,
      {
        is_mastered: true,
      },
      "Marked as mastered!"
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Revision List"
        description="Spaced repetition review — questions due for review today."
      />

      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>

          <span className="shrink-0 text-xs text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </div>
      )}

      {(isDone || items.length === 0) && (
        <Card className="border-green-500/30">
          <CardContent className="flex flex-col items-center justify-center space-y-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <Award className="h-8 w-8 text-green-400" />
            </div>

            <h3 className="text-lg font-bold text-foreground">
              {items.length === 0
                ? "No reviews due today!"
                : "All done! Great work!"}
            </h3>

            <p className="max-w-xs text-sm text-muted-foreground">
              {items.length === 0
                ? "You have no questions due for review."
                : "You've reviewed all due questions."}
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRevisionItems()}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reload
            </Button>
          </CardContent>
        </Card>
      )}

      {!isDone && currentItem && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {currentItem.question.subject} ·{" "}
              {currentItem.question.topic}
            </span>

            <span>
              Interval: {currentItem.interval_days}d · Reviews:{" "}
              {currentItem.review_count}
            </span>
          </div>

          <Card>
            <CardContent className="py-5">
              <p className="leading-relaxed text-sm text-foreground">
                {currentItem.question.question_text}
              </p>

              {currentItem.question.question_type === "MCQ" &&
                currentItem.question.options.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {currentItem.question.options.map(
                      (option) => (
                        <div
                          key={`${option.label}-${option.text}`}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-3 text-sm transition-all",
                            showAnswer &&
                              option.label ===
                                currentItem.question.correct_answer
                              ? "border-green-500/50 bg-green-500/10 text-green-400"
                              : "border-border text-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                              showAnswer &&
                                option.label ===
                                  currentItem.question.correct_answer
                                ? "border-green-500 bg-green-500 text-white"
                                : "border-border"
                            )}
                          >
                            {option.label}
                          </span>

                          <span>{option.text}</span>
                        </div>
                      )
                    )}
                  </div>
                )}

              {!showAnswer ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowAnswer(true)}
                >
                  <ChevronDown className="mr-1.5 h-4 w-4" />
                  Show Answer
                </Button>
              ) : (
                <div className="mt-4 space-y-3">
                  {currentItem.question.correct_answer && (
                    <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400">
                      Answer:{" "}
                      {currentItem.question.correct_answer}
                    </div>
                  )}

                  {currentItem.question.explanation && (
                    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs text-foreground/80">
                      <span className="mb-1 block font-semibold text-violet-400">
                        Explanation
                      </span>

                      {currentItem.question.explanation}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {showAnswer && (
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant="outline"
                onClick={() => void handleStruggling()}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                disabled={updating}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Struggling
              </Button>

              <Button
                onClick={() => void handleKnew()}
                className="bg-green-600 text-white hover:bg-green-700"
                disabled={updating}
              >
                <CheckCircle className="mr-1.5 h-4 w-4" />
                I Knew It
              </Button>

              <Button
                variant="outline"
                onClick={() => void handleMastered()}
                className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                disabled={updating}
              >
                <Award className="mr-1.5 h-4 w-4" />
                Mastered
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
