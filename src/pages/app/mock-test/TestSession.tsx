// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Flag, X, Clock, AlertCircle,
  Send, BookmarkPlus,
} from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; text: string }> | null;
  correct_answer: string;
  subject: string;
  topic: string;
  difficulty: string;
  marks_positive: number;
  marks_negative: number;
  image_url?: string;
  latex_present?: boolean;
}

type QuestionState = "unattempted" | "attempted" | "marked" | "attempted-marked" | "bookmarked";

interface ResponseState {
  answer: string;
  state: QuestionState;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATE_COLORS: Record<QuestionState, string> = {
  unattempted:          "bg-muted text-muted-foreground border-border",
  attempted:            "bg-green-500/20 text-green-400 border-green-500/30",
  marked:               "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "attempted-marked":   "bg-purple-500/20 text-purple-400 border-purple-500/30",
  bookmarked:           "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

/**
 * Render text that may contain LaTeX.
 * Inline: $...$  Block: $$...$$
 */
function MathText({ text }: { text: string }) {
  if (!text) return null;

  // Split on $$ (block) or $ (inline)
  const parts: React.ReactNode[] = [];
  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  const inlineRe = /\$([^\$]+?)\$/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const merged = text;
  const blockMatches: Array<{ start: number; end: number; latex: string; isBlock: boolean }> = [];

  // Find block math first
  blockRe.lastIndex = 0;
  while ((match = blockRe.exec(merged)) !== null) {
    blockMatches.push({ start: match.index, end: match.index + match[0].length, latex: match[1], isBlock: true });
  }

  // Find inline math, excluding already-captured block ranges
  inlineRe.lastIndex = 0;
  while ((match = inlineRe.exec(merged)) !== null) {
    const inBlock = blockMatches.some((b) => match!.index >= b.start && match!.index < b.end);
    if (!inBlock) {
      blockMatches.push({ start: match.index, end: match.index + match[0].length, latex: match[1], isBlock: false });
    }
  }

  blockMatches.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const segment of blockMatches) {
    if (segment.start > cursor) {
      parts.push(merged.slice(cursor, segment.start));
    }
    try {
      parts.push(
        segment.isBlock
          ? <BlockMath key={segment.start} math={segment.latex} />
          : <InlineMath key={segment.start} math={segment.latex} />
      );
    } catch {
      parts.push(segment.latex);
    }
    cursor = segment.end;
  }
  if (cursor < merged.length) {
    parts.push(merged.slice(cursor));
  }

  return <>{parts}</>;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function TestSession() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const autoSaveRef = useRef<ReturnType<typeof setInterval>>();
  const timerRef    = useRef<ReturnType<typeof setInterval>>();
  const questionStartRef = useRef<number>(Date.now());
  const timeSpentMap = useRef<Record<string, number>>({});
  const timerStartedRef = useRef(false);

  useEffect(() => {
    if (!testId || !user?.id) return;
    loadTest();
  }, [testId, user?.id]);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => { saveResponses(); }, 30_000);
    return () => clearInterval(autoSaveRef.current!);
  }, [responses]);

  async function loadTest() {
    setLoading(true);
    try {
      const { data: testData, error: testErr } = await supabase
        .from("mock_tests")
        .select("*")
        .eq("id", testId)
        .eq("user_id", user!.id)
        .single();

      if (testErr || !testData) {
        toast.error("Test not found");
        navigate("/app/mock-test");
        return;
      }

      if (testData.status === "COMPLETED") {
        navigate(`/app/mock-test/results/${testId}`);
        return;
      }

      setTest(testData);
      const secs = (testData.time_limit_minutes ?? 60) * 60;
      setTimeLeft(secs);

      const qIds = testData.question_ids as string[];
      const { data: qData } = await supabase
        .from("questions")
        .select("id, question_text, question_type, options, correct_answer, subject, topic, difficulty, marks_positive, marks_negative, image_url, latex_present")
        .in("id", qIds);

      const qMap: Record<string, Question> = {};
      for (const q of (qData ?? [])) qMap[q.id] = q;
      const orderedQuestions = qIds.map((id) => qMap[id]).filter(Boolean);
      setQuestions(orderedQuestions);

      const { data: respData } = await supabase
        .from("test_responses")
        .select("question_id, user_answer, is_marked_review, is_attempted, time_spent_seconds")
        .eq("test_id", testId)
        .eq("user_id", user!.id);

      const respMap: Record<string, ResponseState> = {};
      const timeMap: Record<string, number> = {};
      for (const r of (respData ?? [])) {
        respMap[r.question_id] = {
          answer: r.user_answer ?? "",
          state: r.is_marked_review
            ? (r.is_attempted ? "attempted-marked" : "marked")
            : (r.is_attempted ? "attempted" : "unattempted"),
        };
        if (r.time_spent_seconds) timeMap[r.question_id] = r.time_spent_seconds;
      }
      setResponses(respMap);
      timeSpentMap.current = timeMap;

      if (testData.status === "DRAFT") {
        await supabase
          .from("mock_tests")
          .update({ status: "IN_PROGRESS", started_at: new Date().toISOString() })
          .eq("id", testId);
      }
    } catch (err) {
      console.error("[TestSession] load error:", err);
      toast.error("Failed to load test");
    } finally {
      setLoading(false);
    }
  }

  // Start timer only after loading
  useEffect(() => {
    if (!test || timerStartedRef.current || timeLeft <= 0) return;
    timerStartedRef.current = true;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [test, timeLeft]);

  // Track time on question
  useEffect(() => {
    const prev = currentIndex;
    questionStartRef.current = Date.now();
    return () => {
      const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      if (elapsed > 0 && questions[prev]) {
        const qid = questions[prev].id;
        timeSpentMap.current[qid] = (timeSpentMap.current[qid] ?? 0) + elapsed;
      }
    };
  }, [currentIndex]);

  async function saveResponses() {
    if (!testId || !user?.id || Object.keys(responses).length === 0) return;
    try {
      const upserts = Object.entries(responses).map(([qId, r]) => ({
        test_id:           testId,
        question_id:       qId,
        user_id:           user!.id,
        user_answer:       r.answer || null,
        is_attempted:      !!r.answer,
        is_marked_review:  r.state === "marked" || r.state === "attempted-marked",
        time_spent_seconds: timeSpentMap.current[qId] ?? 0,
      }));
      await supabase.from("test_responses").upsert(upserts, { onConflict: "test_id,question_id" });
    } catch (err) {
      console.warn("[TestSession] auto-save error:", err);
    }
  }

  function getCurrentQuestion(): Question | null {
    return questions[currentIndex] ?? null;
  }

  function updateResponse(answer: string) {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id];
      const wasMarked = current?.state === "marked" || current?.state === "attempted-marked";
      return {
        ...prev,
        [q.id]: {
          answer,
          state: wasMarked && answer ? "attempted-marked" : answer ? "attempted" : "unattempted",
        },
      };
    });
  }

  function toggleMarkForReview() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
      const hasAnswer = !!current.answer;
      let newState: QuestionState;
      if (current.state === "marked" || current.state === "attempted-marked") {
        newState = hasAnswer ? "attempted" : "unattempted";
      } else {
        newState = hasAnswer ? "attempted-marked" : "marked";
      }
      return { ...prev, [q.id]: { ...current, state: newState } };
    });
  }

  function clearResponse() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
      return {
        ...prev,
        [q.id]: {
          answer: "",
          state: current.state === "marked" || current.state === "attempted-marked" ? "marked" : "unattempted",
        },
      };
    });
  }

  function addToRevision() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => ({
      ...prev,
      [q.id]: { ...prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState }, state: "bookmarked" },
    }));
    toast.success("Bookmarked for revision");
  }

  async function handleSubmit(autoSubmit = false) {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Final save with current time tracking
      const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      const q = getCurrentQuestion();
      if (q && elapsed > 0) {
        timeSpentMap.current[q.id] = (timeSpentMap.current[q.id] ?? 0) + elapsed;
      }

      await saveResponses();

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await supabase.functions.invoke("submit-test", {
        body: { test_id: testId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast.success(autoSubmit ? "Time's up! Test submitted." : "Test submitted!");
      navigate(`/app/mock-test/results/${testId}`);
    } catch (err: any) {
      console.error("[TestSession] submit error:", err);
      toast.error("Failed to submit: " + (err.message ?? "Unknown error"));
    } finally {
      setSubmitting(false);
      setShowSubmitModal(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const q = getCurrentQuestion();
  if (!q) return null;

  const currentResp = responses[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
  const isMarked = currentResp.state === "marked" || currentResp.state === "attempted-marked";

  const attempted   = Object.values(responses).filter((r) => r.answer).length;
  const markedCount = Object.values(responses).filter((r) => r.state === "marked" || r.state === "attempted-marked").length;
  const unattempted = questions.length - attempted;

  const timerColor =
    timeLeft <= 300 ? "text-red-400" :
    timeLeft <= 600 ? "text-amber-400" :
    "text-foreground";

  // Compute subject-wise counts for right panel
  const subjectCounts: Record<string, { total: number; done: number }> = {};
  for (const question of questions) {
    if (!subjectCounts[question.subject]) subjectCounts[question.subject] = { total: 0, done: 0 };
    subjectCounts[question.subject].total++;
    if (responses[question.id]?.answer) subjectCounts[question.subject].done++;
  }

  // Live score (optimistic)
  let liveScore = 0;
  for (const qq of questions) {
    const r = responses[qq.id];
    if (!r?.answer) continue;
    const marksPos = parseFloat(qq.marks_positive as any ?? 4);
    const marksNeg = parseFloat(qq.marks_negative as any ?? 1);
    // Can't know if correct without ground truth — show attempted count instead
    liveScore += marksPos * 0.6; // rough optimistic estimate — displayed as approx
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0 gap-4">
        <p className="font-semibold text-foreground text-sm truncate max-w-xs hidden md:block">
          {test?.test_name ?? "Test Session"}
        </p>
        <div className={cn("flex items-center gap-1.5 font-mono text-lg font-bold", timerColor)}>
          <Clock className="h-4 w-4" />
          {formatTime(timeLeft)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {attempted}/{questions.length} done
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Submit
          </Button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: question navigator ── */}
        <div className="hidden md:flex flex-col w-48 border-r border-border overflow-y-auto p-3 gap-2 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Navigator
          </p>
          <div className="grid grid-cols-5 gap-1">
            {questions.map((qq, i) => {
              const r = responses[qq.id] ?? { state: "unattempted" };
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    "w-7 h-7 rounded-lg text-[11px] font-bold border transition-all",
                    STATE_COLORS[r.state as QuestionState],
                    i === currentIndex && "ring-2 ring-violet-500"
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-2 space-y-1.5">
            {[
              { state: "unattempted",      label: "Not visited" },
              { state: "attempted",        label: "Answered" },
              { state: "marked",           label: "For review" },
              { state: "attempted-marked", label: "Ans + review" },
            ].map(({ state, label }) => (
              <div key={state} className="flex items-center gap-1.5">
                <div className={cn("w-4 h-4 rounded border", STATE_COLORS[state as QuestionState])} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: question ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Question header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground">
                  Q{currentIndex + 1} / {questions.length}
                </span>
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  q.difficulty === "EASY" ? "bg-green-500/10 text-green-400" :
                  q.difficulty === "HARD" ? "bg-red-500/10 text-red-400" :
                  "bg-amber-500/10 text-amber-400"
                )}>
                  {q.difficulty}
                </span>
                <span className="text-[10px] text-muted-foreground">{q.subject} · {q.topic}</span>
              </div>
              <div className="text-[10px] text-muted-foreground shrink-0">
                +{q.marks_positive} / −{q.marks_negative}
              </div>
            </div>

            {/* Question text with LaTeX */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-foreground leading-relaxed">
                <MathText text={q.question_text} />
              </div>
              {q.image_url && (
                <img src={q.image_url} alt="Question" className="mt-3 max-h-48 rounded-lg object-contain" />
              )}
            </div>

            {/* Answer area */}
            {(q.question_type === "MCQ" || q.question_type === "TRUE_FALSE") ? (
              <div className="space-y-2">
                {(q.options ?? []).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => updateResponse(opt.label)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 rounded-xl border p-3 transition-all",
                      currentResp.answer === opt.label
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-border hover:border-violet-500/30 hover:bg-accent/5"
                    )}
                  >
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      currentResp.answer === opt.label
                        ? "border-violet-500 bg-violet-500 text-white"
                        : "border-border text-muted-foreground"
                    )}>
                      {opt.label}
                    </span>
                    <span className="text-sm text-foreground">
                      <MathText text={opt.text} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <input
                type={q.question_type === "NUMERICAL" ? "number" : "text"}
                value={currentResp.answer}
                onChange={(e) => updateResponse(e.target.value)}
                placeholder={q.question_type === "NUMERICAL" ? "Enter numerical answer" : "Enter your answer"}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleMarkForReview}
                className={cn(isMarked && "border-amber-500/50 text-amber-400 bg-amber-500/10")}
              >
                <Flag className="h-3.5 w-3.5 mr-1.5" />
                {isMarked ? "Unmark" : "Mark for Review"}
              </Button>
              <Button size="sm" variant="outline" onClick={clearResponse}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Clear
              </Button>
              <Button size="sm" variant="outline" onClick={addToRevision}>
                <BookmarkPlus className="h-3.5 w-3.5 mr-1.5" />
                Bookmark
              </Button>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} / {questions.length}
              </span>
              {currentIndex < questions.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => setShowSubmitModal(true)}>
                  <Send className="h-4 w-4 mr-1.5" />
                  Submit Test
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: subject-wise counts + live stats ── */}
        <div className="hidden lg:flex flex-col w-44 border-l border-border overflow-y-auto p-3 gap-3 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Progress
          </p>
          <div className="space-y-2">
            {Object.entries(subjectCounts).map(([subj, counts]) => (
              <div key={subj} className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground truncate mr-1">{subj}</span>
                  <span className="font-bold text-foreground shrink-0">{counts.done}/{counts.total}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${counts.total > 0 ? (counts.done / counts.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-muted/20 p-2 space-y-1.5 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Attempted</p>
              <p className="text-sm font-bold text-green-400">{attempted}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Skipped</p>
              <p className="text-sm font-bold text-muted-foreground">{unattempted}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">For review</p>
              <p className="text-sm font-bold text-amber-400">{markedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Submit confirmation modal ── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground">Submit Test?</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attempted</span>
                <span className="font-semibold text-green-400">{attempted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unattempted</span>
                <span className="font-semibold text-red-400">{unattempted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marked for review</span>
                <span className="font-semibold text-amber-400">{markedCount}</span>
              </div>
            </div>
            {unattempted > 0 && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {unattempted} question{unattempted > 1 ? "s" : ""} unattempted
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                Go Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleSubmit(false)}
                loading={submitting}
              >
                <Send className="h-4 w-4 mr-1.5" />
                Confirm Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
