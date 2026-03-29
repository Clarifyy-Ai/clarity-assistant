// @ts-nocheck
import { EDGE_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Flag, X, Clock, AlertCircle,
  Send, BookmarkPlus, Menu, CheckCircle2, Pause
} from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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

// 5-state navigator model
type QuestionState = "unattempted" | "visited" | "answered" | "marked" | "answered-marked";

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
  const elapsedMs  = Date.now() - new Date(test.started_at).getTime();
  const elapsedSecs = Math.floor(elapsedMs / 1000);
  return Math.max(0, limitSecs - elapsedSecs);
}

// 5-state color map matched to Prompt 3 specs
const STATE_COLORS: Record<QuestionState, string> = {
  unattempted:      "bg-card text-foreground border-border hover:bg-muted",
  visited:          "bg-yellow-500/10 text-yellow-600 border-yellow-500/40 dark:text-yellow-400",
  answered:         "bg-green-500/10 text-green-600 border-green-500/40 dark:text-green-400",
  marked:           "bg-purple-500/10 text-purple-600 border-purple-500/40 dark:text-purple-400",
  "answered-marked":"bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400",
};

interface MathSegment {
  start: number;
  end: number;
  latex: string;
  isBlock: boolean;
}

function MathText({ text }: { text: string }): React.ReactElement {
  const parts: React.ReactNode[] = [];
  const segments: MathSegment[] = [];

  const blockRe  = /\$\$([\s\S]+?)\$\$/g;
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

// Live score estimation
function estimateLiveScore(
  questions: Question[],
  responses: Record<string, ResponseState>
): { score: number; max: number } {
  let score = 0;
  let max   = 0;
  for (const q of questions) {
    const marksPos = Number(q.marks_positive ?? 4);
    const marksNeg = Number(q.marks_negative ?? 1);
    max += marksPos;
    const r = responses[q.id];
    if (r?.answer) {
      score += marksPos * 0.6 - marksNeg * 0.4;
    }
  }
  return { score: Math.round(Math.max(0, score)), max: Math.round(max) };
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function TestSession(): React.ReactElement {
  const { testId } = useParams<{ testId: string }>();
  const navigate   = useNavigate();
  const user       = useAuthStore((s) => s.user);

  const [test, setTest]               = useState<MockTest | null>(null);
  const [questions, setQuestions]     = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses]     = useState<Record<string, ResponseState>>({});
  const [timeLeft, setTimeLeft]       = useState(0);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const timeSpentMap     = useRef<Record<string, number>>({});
  const isMounted        = useRef(true);

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

  // When moving away from a question — mark as "visited" if opened but unanswered
  useEffect(() => {
    questionStartRef.current = Date.now();
    const prevIndex = currentIndex;
    return () => {
      const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      if (elapsed > 0 && questions[prevIndex]) {
        const qid = questions[prevIndex].id;
        timeSpentMap.current[qid] = (timeSpentMap.current[qid] ?? 0) + elapsed;
        setResponses((prev) => {
          const current = prev[qid];
          if (!current || current.state === "unattempted") {
            return { ...prev, [qid]: { answer: "", state: "visited" } };
          }
          return prev;
        });
      }
    };
  }, [currentIndex, questions]);

  useEffect(() => {
    if (questions.length > 0) {
      const qid = questions[0].id;
      setResponses((prev) => {
        if (!prev[qid] || prev[qid].state === "unattempted") {
          return { ...prev, [qid]: { answer: prev[qid]?.answer ?? "", state: "visited" } };
        }
        return prev;
      });
    }
  }, [questions]);

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

      const loadedTest = testData as unknown as MockTest;

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
        .select("*")
        .in("id", qIds);

      const qMap: Record<string, Question> = {};
      for (const rawQ of (qData ?? [])) {
        const q = rawQ as unknown as Question;
        qMap[q.id] = q;
      }
      const orderedQuestions = qIds.map((id) => qMap[id]).filter(Boolean) as Question[];

      if (!isMounted.current) return;
      setQuestions(orderedQuestions);

      // Fetch responses
      const { data: sessionForResp } = await supabase.auth.getSession();
      const respFetch = await fetch(
        `${SUPABASE_URL}/rest/v1/test_responses?select=question_id,user_answer,is_marked_review,is_attempted,time_spent_seconds&test_id=eq.${testId}&user_id=eq.${user!.id}`,
        {
          headers: {
            apikey:        SUPABASE_ANON_KEY as string,
            Authorization: `Bearer ${sessionForResp?.session?.access_token ?? ""}`,
          },
        }
      );
      const respData = respFetch.ok ? (await respFetch.json()) : [];

      const respMap: Record<string, ResponseState> = {};
      const timeMap: Record<string, number> = {};
      for (const r of respData) {
        const isAnswered = Boolean(r.user_answer);
        const isMarked   = Boolean(r.is_marked_review);
        let state: QuestionState;
        if (isAnswered && isMarked) state = "answered-marked";
        else if (isAnswered) state = "answered";
        else if (isMarked) state = "marked";
        else if (r.is_attempted) state = "visited";
        else state = "unattempted";
        respMap[r.question_id] = { answer: r.user_answer ?? "", state };
        if (r.time_spent_seconds) timeMap[r.question_id] = r.time_spent_seconds;
      }
      if (!isMounted.current) return;
      setResponses(respMap);
      timeSpentMap.current = timeMap;

      // Mark as IN_PROGRESS
      if (loadedTest.status === "DRAFT") {
        const startedAt = new Date().toISOString();
        await supabase
          .from("mock_tests")
          .update({ status: "IN_PROGRESS", started_at: startedAt })
          .eq("id", testId!);
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

  async function saveResponses() {
    if (!testId || !user?.id || Object.keys(responses).length === 0) return;
    try {
      const upserts = Object.entries(responses).map(([qId, r]) => ({
        test_id:            testId,
        question_id:        qId,
        user_id:            user!.id,
        user_answer:        r.answer || null,
        is_attempted:       r.state !== "unattempted",
        is_marked_review:   r.state === "marked" || r.state === "answered-marked",
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
      const wasMarked = current?.state === "marked" || current?.state === "answered-marked";
      const newState: QuestionState = wasMarked && answer
        ? "answered-marked"
        : answer
          ? "answered"
          : "visited";
      return { ...prev, [q.id]: { answer, state: newState } };
    });
  }

  function navigateTo(index: number) {
    setCurrentIndex(index);
    const q = questions[index];
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id];
      if (!current || current.state === "unattempted") {
        return { ...prev, [q.id]: { answer: "", state: "visited" } };
      }
      return prev;
    });
  }

  function toggleMarkForReview() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
      const hasAnswer  = Boolean(current.answer);
      const isMarked   = current.state === "marked" || current.state === "answered-marked";
      const newState: QuestionState = isMarked
        ? (hasAnswer ? "answered" : "visited")
        : (hasAnswer ? "answered-marked" : "marked");
      return { ...prev, [q.id]: { ...current, state: newState } };
    });
  }

  function clearResponse() {
    const q = getCurrentQuestion();
    if (!q) return;
    setResponses((prev) => {
      const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
      const isMarked = current.state === "marked" || current.state === "answered-marked";
      return { ...prev, [q.id]: { answer: "", state: isMarked ? "marked" : "visited" } };
    });
  }

  // Action Buttons Handlers
  function handleSaveAndNext() {
    const q = getCurrentQuestion();
    if (q) {
      setResponses((prev) => {
        const current = prev[q.id];
        // Remove marked status if saving
        if (current?.answer) {
          return { ...prev, [q.id]: { ...current, state: "answered" } };
        }
        return prev;
      });
    }
    if (currentIndex < questions.length - 1) navigateTo(currentIndex + 1);
  }

  function handleMarkAndNext() {
    const q = getCurrentQuestion();
    if (q) {
      setResponses((prev) => {
        const current = prev[q.id] ?? { answer: "", state: "unattempted" as QuestionState };
        const newState = current.answer ? "answered-marked" : "marked";
        return { ...prev, [q.id]: { ...current, state: newState } };
      });
    }
    if (currentIndex < questions.length - 1) navigateTo(currentIndex + 1);
  }

  async function handleSubmit(autoSubmit = false) {
    if (submitting) return;
    setSubmitting(true);
    try {
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
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const q = getCurrentQuestion();
  if (!q) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">No questions found.</p>
      </div>
    );
  }

  const currentResp = responses[q.id] ?? { answer: "", state: "visited" as QuestionState };
  const isMarked    = currentResp.state === "marked" || currentResp.state === "answered-marked";

  const answered    = Object.values(responses).filter((r) => r.answer).length;
  const markedCount = Object.values(responses).filter(
    (r) => r.state === "marked" || r.state === "answered-marked"
  ).length;
  const visitedCount = Object.values(responses).filter((r) => r.state === "visited").length;
  const unanswered   = questions.length - answered;

  const timerColor =
    timeLeft <= 300 ? "text-red-500 animate-pulse font-black" :
    "text-foreground font-bold";

  // Calculate subject counts
  const subjectCounts: Record<string, { total: number; done: number }> = {};
  for (const question of questions) {
    if (!subjectCounts[question.subject]) subjectCounts[question.subject] = { total: 0, done: 0 };
    subjectCounts[question.subject].total++;
    if (responses[question.id]?.answer) subjectCounts[question.subject].done++;
  }

  const { score: liveScore, max: liveMax } = estimateLiveScore(questions, responses);

  // Reusable Nav Grid Component
  const NavGrid = () => (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {questions.map((qq, i) => {
        const r = responses[qq.id] ?? { state: "unattempted" as QuestionState };
        return (
          <button
            key={qq.id}
            type="button"
            onClick={() => navigateTo(i)}
            className={cn(
              "w-9 h-9 rounded-md text-xs font-bold border transition-all flex items-center justify-center",
              STATE_COLORS[r.state as QuestionState],
              i === currentIndex && "ring-2 ring-primary ring-offset-1 ring-offset-background scale-105"
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden font-sans">
      
      {/* ─── Mobile Top Bar ─── */}
      <div className="md:hidden flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
              <div className="p-4 border-b font-bold bg-muted/20">Questions Navigator</div>
              <div className="p-4 flex-1 overflow-y-auto"><NavGrid /></div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-sm truncate max-w-[150px]">{test?.test_name}</span>
        </div>
        <div className={cn("flex items-center gap-1.5 font-mono text-base bg-muted/30 px-2.5 py-1 rounded-md border", timerColor)}>
          <Clock className="h-4 w-4" />
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* ─── Main 3-Panel Layout ─── */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL: Navigator (Hidden on Mobile) */}
        <div className="hidden md:flex flex-col w-[240px] border-r border-border bg-card overflow-hidden shrink-0">
          <div className="p-4 border-b border-border">
            <h1 className="font-bold text-foreground text-sm truncate" title={test?.test_name}>
              {test?.test_name || "Test Session"}
            </h1>
          </div>
          
          <div className="p-3 border-b border-border bg-muted/10">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Section Progress</p>
            <div className="space-y-1.5">
              {Object.entries(subjectCounts).map(([subj, counts]) => (
                <div key={subj} className="flex justify-between items-center text-xs">
                  <span className="truncate text-muted-foreground max-w-[120px]" title={subj}>{subj}</span>
                  <span className="font-medium text-foreground">{counts.done}/{counts.total}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <NavGrid />
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-border bg-muted/20 space-y-2">
            {[
              { state: "unattempted", label: "Not visited", color: "bg-card border-border" },
              { state: "visited", label: "Visited, no ans", color: "bg-yellow-500/10 border-yellow-500/40" },
              { state: "answered", label: "Answered", color: "bg-green-500/10 border-green-500/40" },
              { state: "marked", label: "For review", color: "bg-purple-500/10 border-purple-500/40" },
              { state: "answered-marked", label: "Ans + review", color: "bg-red-500/10 border-red-500/40" },
            ].map((item) => (
              <div key={item.state} className="flex items-center gap-2">
                <div className={cn("w-3.5 h-3.5 rounded border shrink-0", item.color)} />
                <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER PANEL: Question Area */}
        <div className="flex-1 flex flex-col relative bg-background">
          {/* Desktop Top Header inside Center Panel */}
          <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-card shadow-sm z-10">
            <div className="flex gap-2">
              <span className="text-sm font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-md">
                Q. {currentIndex + 1} <span className="text-muted-foreground">/ {questions.length}</span>
              </span>
              <span className="text-sm font-medium bg-muted px-2.5 py-1 rounded-md text-muted-foreground">{q.subject}</span>
              <span className={cn(
                  "text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide flex items-center",
                  q.difficulty === "HARD" ? "text-red-500 bg-red-500/10" : 
                  q.difficulty === "EASY" ? "text-green-500 bg-green-500/10" : 
                  "text-amber-500 bg-amber-500/10"
                )}>
                  {q.difficulty}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold">
              <div className="flex gap-1 text-muted-foreground">
                <span className="text-green-500">+{q.marks_positive}</span>
                <span>/</span>
                <span className="text-red-400">-{q.marks_negative}</span>
              </div>
            </div>
          </div>

          {/* Question Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar pb-32">
            <div className="max-w-3xl mx-auto space-y-6">
              
              {/* Mobile Question Header */}
              <div className="md:hidden flex justify-between items-center mb-4">
                <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-1 rounded-md">
                  Q. {currentIndex + 1}
                </span>
                <div className="text-xs font-medium bg-muted px-2 py-1 rounded-md text-muted-foreground">
                  {q.subject} • +{q.marks_positive}/-{q.marks_negative}
                </div>
              </div>

              <div className="text-[17px] md:text-lg text-foreground font-medium leading-relaxed bg-card p-5 rounded-xl border border-border shadow-sm">
                <MathText text={q.question_text} />
                {q.image_url && (
                  <img src={q.image_url} alt="Question Diagram" className="mt-4 max-w-full md:max-w-[80%] rounded-lg border object-contain" />
                )}
              </div>

              {(q.question_type === "MCQ" || q.question_type === "TRUE_FALSE") ? (
                <div className="grid grid-cols-1 gap-3 pt-2">
                  {(q.options ?? []).map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => updateResponse(opt.label)}
                      className={cn(
                        "w-full text-left flex items-center gap-4 rounded-xl border-2 p-4 transition-all group duration-200",
                        currentResp.answer === opt.label
                          ? "border-blue-500 bg-blue-500/10 shadow-sm"
                          : "border-border hover:border-blue-500/40 hover:bg-muted/30"
                      )}
                    >
                      <span className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                        currentResp.answer === opt.label
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-muted-foreground text-muted-foreground group-hover:border-blue-500/50 group-hover:text-blue-500"
                      )}>
                        {opt.label}
                      </span>
                      <span className="text-[15px] md:text-base text-foreground">
                        <MathText text={opt.text} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pt-2">
                  <input
                    type={q.question_type === "NUMERICAL" ? "number" : "text"}
                    value={currentResp.answer}
                    onChange={(e) => updateResponse(e.target.value)}
                    placeholder={q.question_type === "NUMERICAL" ? "Enter numerical value..." : "Enter your answer..."}
                    className="w-full rounded-xl border-2 border-border bg-background px-4 py-4 text-lg text-foreground focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] z-20">
            <div className="max-w-4xl mx-auto px-4 py-3 md:py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              
              {/* Left Actions */}
              <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-2">
                <Button variant="ghost" size="sm" onClick={clearResponse} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4 mr-1.5" /> Clear
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    toast.success("Added to revision list");
                    void supabase.from("revision_list").insert({
                      user_id: user!.id, question_id: q.id, added_from_test_id: testId,
                      next_review_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
                      interval_days: 1, is_mastered: false,
                    }).catch(console.warn);
                  }}
                >
                  <BookmarkPlus className="w-4 h-4 mr-1.5" /> Bookmark
                </Button>
              </div>

              {/* Right Actions */}
              <div className="flex w-full sm:w-auto items-center gap-2">
                <Button 
                  variant="outline" 
                  className={cn("flex-1 sm:flex-none", isMarked ? "bg-purple-500/10 text-purple-600 border-purple-500/30" : "bg-muted/50")}
                  onClick={handleMarkAndNext}
                >
                  <Flag className="w-4 h-4 mr-1.5" /> 
                  <span className="hidden sm:inline">Mark for Review & Next</span>
                  <span className="sm:hidden">Mark & Next</span>
                </Button>
                
                <Button 
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/20"
                  onClick={handleSaveAndNext}
                >
                  Save & Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Stats & Submit (Hidden on Mobile) */}
        <div className="hidden lg:flex flex-col w-[280px] border-l border-border bg-card shrink-0 shadow-lg z-10 relative">
          
          {/* Timer Block */}
          <div className="p-6 border-b border-border bg-muted/10 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Time Remaining</p>
            <div className={cn("text-3xl font-black font-mono tracking-tight", timerColor)}>
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Live Score */}
          <div className="p-5 border-b border-border text-center">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-widest mb-1">Est. Score</p>
              <p className="text-3xl font-black text-primary">
                {liveScore} <span className="text-sm font-semibold text-muted-foreground">/ {liveMax}</span>
              </p>
            </div>
          </div>

          {/* Session Stats */}
          <div className="p-6 flex-1 overflow-y-auto">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary" /> Session Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg border border-border bg-background shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-muted-foreground">Answered</span>
                </div>
                <span className="text-base font-bold text-green-500">{answered}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg border border-border bg-background shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-sm font-medium text-muted-foreground">Unanswered</span>
                </div>
                <span className="text-base font-bold text-muted-foreground">{unanswered}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg border border-border bg-background shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="text-sm font-medium text-muted-foreground">For Review</span>
                </div>
                <span className="text-base font-bold text-purple-500">{markedCount}</span>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="p-5 mt-auto border-t border-border bg-muted/5">
            <Button size="lg" className="w-full font-bold shadow-lg text-base" onClick={() => setShowSubmitModal(true)}>
              <Send className="w-4 h-4 mr-2" />
              Submit Test
            </Button>
          </div>
        </div>

      </div>

      {/* ─── Submit Confirmation Modal ─── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 md:p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-foreground mb-6 text-center">Submit Assessment?</h2>
            
            <div className="space-y-1 bg-muted/30 p-5 rounded-xl border border-border mb-6">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground font-medium text-sm">Answered</span>
                <span className="font-bold text-green-500">{answered}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground font-medium text-sm">Visited, no answer</span>
                <span className="font-bold text-yellow-500">{visitedCount}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground font-medium text-sm">Not visited</span>
                <span className="font-bold text-muted-foreground">{unanswered - visitedCount}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground font-medium text-sm">Marked for review</span>
                <span className="font-bold text-purple-500">{markedCount}</span>
              </div>
            </div>
            
            {unanswered > 0 && (
              <div className="flex items-start gap-3 p-3 bg-amber-500/10 text-amber-600 rounded-lg border border-amber-500/20 mb-6 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>You have <strong>{unanswered} questions</strong> left unattempted. Once submitted, you cannot change your answers.</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowSubmitModal(false)} disabled={submitting}>
                Go Back
              </Button>
              <Button className="flex-1" onClick={() => { void handleSubmit(false); }} loading={submitting}>
                {submitting ? "Submitting..." : "Yes, Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
