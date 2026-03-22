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

interface QuestionOption {
  label: string;
  text: string;
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: QuestionOption[] | null;
  correct_answer: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
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

interface MockTest {
  id: string;
  test_name: string;
  config: Record<string, unknown>;
  question_ids: string[];
  status: string;
  time_limit_minutes: number;
  started_at?: string;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function computeRemainingSeconds(test: MockTest): number {
  const limitSecs = (test.time_limit_minutes ?? 60) * 60;
  if (!test.started_at) return limitSecs;
  const elapsedMs = Date.now() - new Date(test.started_at).getTime();
  const elapsedSecs = Math.floor(elapsedMs / 1000);
  return Math.max(0, limitSecs - elapsedSecs);
}

const STATE_COLORS: Record<QuestionState, string> = {
  unattempted:          "bg-muted text-muted-foreground border-border",
  attempted:            "bg-green-500/20 text-green-400 border-green-500/30",
  marked:               "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "attempted-marked":   "bg-purple-500/20 text-purple-400 border-purple-500/30",
  bookmarked:           "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

// Regex segments for LaTeX rendering
interface MathSegment {
  start: number;
  end: number;
  latex: string;
  isBlock: boolean;
}

function MathText({ text }: { text: string }): React.ReactElement {
  const parts: React.ReactNode[] = [];
  const segments: MathSegment[] = [];

  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  const inlineRe = /\$([^$]+?)\$/g;

  let match: RegExpExecArray | null;

  blockRe.lastIndex = 0;
  while ((match = blockRe.exec(text)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, latex: match[1], isBlock: true });
  }

  inlineRe.lastIndex = 0;
  while ((match = inlineRe.exec(text)) !== null) {
    const inBlock = segments.some((b) => match!.index >= b.start && match!.index < b.end);
    if (!inBlock) {
      segments.push({ start: match.index, end: match.index + match[0].length, latex: match[1], isBlock: false });
    }
  }

  segments.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const seg of segments) {
    if (seg.start > cursor) parts.push(text.slice(cursor, seg.start));
    try {
      parts.push(
        seg.isBlock
          ? <BlockMath key={seg.start} math={seg.latex} />
          : <InlineMath key={seg.start} math={seg.latex} />
      );
    } catch {
      parts.push(seg.latex);
    }
    cursor = seg.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export default function TestSession(): React.ReactElement {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [test, setTest] = useState<MockTest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const timeSpentMap = useRef<Record<string, number>>({});
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!testId || !user?.id) return;
    void loadTest();
  }, [testId, user?.id]);

  useEffect(() => {
    autoSaveRef.current = setInterval(() => { void saveResponses(); }, 30_000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [responses]);

  async function loadTest() {
    setLoading(true);
    try {
      const { data: testData, error: testErr } = await supabase
        .from("mock_tests")
        .select("*")
        .eq("id", testId!)
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

      const loadedTest = testData as MockTest;

      // If IN_PROGRESS, derive remaining time from started_at
      let remaining: number;
      if (loadedTest.status === "IN_PROGRESS" && loadedTest.started_at) {
        remaining = computeRemainingSeconds(loadedTest);
      } else {
        remaining = (loadedTest.time_limit_minutes ?? 60) * 60;
      }

      if (!isMounted.current) return;
      setTest(loadedTest);
      setTimeLeft(remaining);

      const qIds = loadedTest.question_ids;
      const { data: qData } = await supabase
        .from("questions")
        .select("id, question_text, question_type, options, correct_answer, subject, topic, difficulty, marks_positive, marks_negative, image_url, latex_present")
        .in("id", qIds);

      const qMap: Record<string, Question> = {};
      for (const q of (qData ?? [])) qMap[q.id] = q as Question;
      const orderedQuestions = qIds.map((id) => qMap[id]).filter(Boolean) as Question[];

      if (!isMounted.current) return;
      setQuestions(orderedQuestions);

      const { data: respData } = await supabase
        .from("test_responses")
        .select("question_id, user_answer, is_marked_review, is_attempted, time_spent_seconds")
        .eq("test_id", testId!)
        .eq("user_id", user!.id);

      const respMap: Record<string, ResponseState> = {};
      const timeMap: Record<string, number> = {};
      for (const r of (respData ?? [])) {
        const state: QuestionState = r.is_marked_review
          ? (r.is_attempted ? "attempted-marked" : "marked")
          : (r.is_attempted ? "attempted" : "unattempted");
        respMap[r.question_id] = { answer: r.user_answer ?? "", state };
        if (r.time_spent_seconds) timeMap[r.question_id] = r.time_spent_seconds as number;
      }
      if (!isMounted.current) return;
      setResponses(respMap);
      timeSpentMap.current = timeMap;

      // Mark as IN_PROGRESS if first time starting
      if (loadedTest.status === "DRAFT") {
        const startedAt = new Date().toISOString();
        await supabase
          .from("mock_tests")
          .update({ status: "IN_PROGRESS", started_at: startedAt })
          .eq("id", testId!);
        // Update local copy so timer uses correct started_at
        setTest((prev) => prev ? { ...prev, status: "IN_PROGRESS", started_at: startedAt } : prev);
      }

      // Start countdown
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (!isMounted.current) return;
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            void handleSubmit(true);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("[TestSession] load error:", err);
      toast.error("Failed to load test");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Track time spent on current question
  useEffect(() => {
    questionStartRef.current = Date.now();
    const prevIndex = currentIndex;
    return () => {
      const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      if (elapsed > 0 && questions[prevIndex]) {
        const qid = questions[prevIndex].id;
        timeSpentMap.current[qid] = (timeSpentMap.current[qid] ?? 0) + elapsed;
      }
    };
  }, [currentIndex, questions]);

  async function saveResponses() {
    if (!testId || !user?.id || Object.keys(responses).length === 0) return;
    try {
      const upserts = Object.entries(responses).map(([qId, r]) => ({
        test_id:            testId,
        question_id:        qId,
        user_id:            user!.id,
        user_answer:        r.answer || null,
        is_attempted:       Boolean(r.answer),
        is_marked_review:   r.state === "marked" || r.state === "attempted-marked",
        time_spent_seconds: timeSpentMap.current[qId] ?? 0,
      }));
      await supabase
        .from("test_responses")
        .upsert(upserts, { onConflict: "test_id,question_id" });
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
      const newState: QuestionState = wasMarked && answer
        ? "attempted-marked"
        : answer
          ? "attempted"
          : "unattempted";
      return { ...prev, [q.id]: { answer, state: newState } };
    });
  }

  function toggleMarkForReview() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
      const hasAnswer = Boolean(current.answer);
      const isCurrentlyMarked = current.state === "marked" || current.state === "attempted-marked";
      const newState: QuestionState = isCurrentlyMarked
        ? (hasAnswer ? "attempted" : "unattempted")
        : (hasAnswer ? "attempted-marked" : "marked");
      return { ...prev, [q.id]: { ...current, state: newState } };
    });
  }

  function clearResponse() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
      const isMarked = current.state === "marked" || current.state === "attempted-marked";
      return { ...prev, [q.id]: { answer: "", state: isMarked ? "marked" : "unattempted" } };
    });
  }

  function addToRevision() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => ({
      ...prev,
      [q.id]: { ...(prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState }), state: "bookmarked" },
    }));
    toast.success("Bookmarked for revision");
  }

  async function handleSubmit(autoSubmit = false) {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Record final time on current question
      const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      const q = getCurrentQuestion();
      if (q && elapsed > 0) {
        timeSpentMap.current[q.id] = (timeSpentMap.current[q.id] ?? 0) + elapsed;
      }
      await saveResponses();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("submit-test", {
        body: { test_id: testId },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) throw new Error(res.error.message);
      const data = res.data as { error?: string };
      if (data?.error) throw new Error(data.error);

      toast.success(autoSubmit ? "Time's up! Test submitted." : "Test submitted!");
      navigate(`/app/mock-test/results/${testId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[TestSession] submit error:", err);
      toast.error("Failed to submit: " + message);
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
  if (!q) return <div className="flex h-screen items-center justify-center bg-background"><p className="text-muted-foreground">No questions found.</p></div>;

  const currentResp = responses[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
  const isMarked = currentResp.state === "marked" || currentResp.state === "attempted-marked";

  const attempted   = Object.values(responses).filter((r) => r.answer).length;
  const markedCount = Object.values(responses).filter(
    (r) => r.state === "marked" || r.state === "attempted-marked"
  ).length;
  const unattempted = questions.length - attempted;

  const timerColor =
    timeLeft <= 300 ? "text-red-400" :
    timeLeft <= 600 ? "text-amber-400" :
    "text-foreground";

  // Subject-wise counts
  const subjectCounts: Record<string, { total: number; done: number }> = {};
  for (const question of questions) {
    if (!subjectCounts[question.subject]) subjectCounts[question.subject] = { total: 0, done: 0 };
    subjectCounts[question.subject].total++;
    if (responses[question.id]?.answer) subjectCounts[question.subject].done++;
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top bar */}
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
          <Button size="sm" variant="outline" onClick={() => setShowSubmitModal(true)} disabled={submitting}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Submit
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: question navigator */}
        <div className="hidden md:flex flex-col w-48 border-r border-border overflow-y-auto p-3 gap-2 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Navigator
          </p>
          <div className="grid grid-cols-5 gap-1">
            {questions.map((qq, i) => {
              const r = responses[qq.id] ?? { state: "unattempted" as QuestionState };
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
          <div className="mt-2 space-y-1.5">
            {(["unattempted", "attempted", "marked", "attempted-marked"] as QuestionState[]).map((state) => (
              <div key={state} className="flex items-center gap-1.5">
                <div className={cn("w-4 h-4 rounded border", STATE_COLORS[state])} />
                <span className="text-[10px] text-muted-foreground">
                  {state === "unattempted" ? "Not visited" :
                   state === "attempted" ? "Answered" :
                   state === "marked" ? "For review" : "Ans + review"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: question */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto space-y-5">
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

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-foreground leading-relaxed">
                <MathText text={q.question_text} />
              </div>
              {q.image_url && (
                <img src={q.image_url} alt="Question" className="mt-3 max-h-48 rounded-lg object-contain" />
              )}
            </div>

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
              <span className="text-xs text-muted-foreground">{currentIndex + 1} / {questions.length}</span>
              {currentIndex < questions.length - 1 ? (
                <Button size="sm" onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}>
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

        {/* Right: subject-wise counts and live stats */}
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

      {/* Submit modal */}
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
              <Button className="flex-1" onClick={() => { void handleSubmit(false); }} loading={submitting}>
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
