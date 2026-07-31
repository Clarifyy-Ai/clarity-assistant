// Security-hardened build v2
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  BookmarkPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Menu,
  Send,
  X,
} from "lucide-react";
import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { resolveQuestionImageUrl } from "@/lib/mock-test/questionMedia";

interface QuestionOption {
  label: string;
  text: string;
}

interface Question {
  id: string;
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING";
  options: QuestionOption[] | null;
  correct_answer: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks_positive: number;
  marks_negative: number;
  image_url?: string | null;
  latex_present?: boolean | null;
}

type QuestionState =
  | "unattempted"
  | "visited"
  | "answered"
  | "marked"
  | "answered-marked";

interface ResponseState {
  answer: string;
  state: QuestionState;
}

interface MockTest {
  id: string;
  test_name: string;
  config: Record<string, unknown> | null;
  question_ids: string[];
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED";
  time_limit_minutes: number | null;
  started_at?: string | null;
}

interface TestResponseRow {
  question_id: string;
  user_answer: string | null;
  is_attempted: boolean | null;
  is_marked_review: boolean | null;
  time_spent_seconds: number | null;
}

interface MathSegment {
  start: number;
  end: number;
  latex: string;
  isBlock: boolean;
}

const STATE_COLORS: Record<QuestionState, string> = {
  unattempted: "bg-card text-foreground border-border hover:bg-muted",
  visited:
    "bg-yellow-500/10 text-yellow-600 border-yellow-500/40 dark:text-yellow-400",
  answered:
    "bg-green-500/10 text-green-600 border-green-500/40 dark:text-green-400",
  marked:
    "bg-purple-500/10 text-purple-600 border-purple-500/40 dark:text-purple-400",
  "answered-marked":
    "bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400",
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function computeRemainingSeconds(test: MockTest): number {
  const limitMins = Number(test.time_limit_minutes ?? 0);
  if (limitMins <= 0) return 0;
  const limitSecs = limitMins * 60;

  if (!test.started_at) return limitSecs;

  const elapsedMs = Date.now() - new Date(test.started_at).getTime();
  const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
  return Math.max(0, limitSecs - elapsedSecs);
}

function MathText({ text }: { text: string }) {
  if (!text) return null;

  // Normalize common LaTeX delimiters to $...$ / $$...$$
  const normalized = text
    .replace(/\\\(([\s\S]+?)\\\)/g, "$$1$")
    .replace(/\\\[([\s\S]+?)\\\]/g, "$$$1$$");

  const parts: React.ReactNode[] = [];
  const segments: MathSegment[] = [];

  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  const inlineRe = /\$((?:[^$\\]|\\.)+?)\$/g;

  let match: RegExpExecArray | null;

  blockRe.lastIndex = 0;
  while ((match = blockRe.exec(normalized)) !== null) {
    segments.push({
      start: match.index,
      end: match.index + match[0].length,
      latex: match[1],
      isBlock: true,
    });
  }

  inlineRe.lastIndex = 0;
  while ((match = inlineRe.exec(normalized)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlapsBlock = segments.some((seg) => start >= seg.start && end <= seg.end);
    if (!overlapsBlock) {
      segments.push({
        start,
        end,
        latex: match[1],
        isBlock: false,
      });
    }
  }

  segments.sort((a, b) => a.start - b.start);

  let cursor = 0;

  for (const seg of segments) {
    if (seg.start > cursor) parts.push(normalized.slice(cursor, seg.start));

    try {
      parts.push(
        seg.isBlock ? (
          <BlockMath key={seg.start} math={seg.latex} />
        ) : (
          <InlineMath key={seg.start} math={seg.latex} />
        )
      );
    } catch {
      parts.push(seg.latex);
    }

    cursor = seg.end;
  }

  if (cursor < normalized.length) parts.push(normalized.slice(cursor));

  return <>{parts}</>;
}

function transformImageUrl(url: string): string {
  if (!url) return url;
  let working = resolveQuestionImageUrl(url);
  // Google Drive: convert share/view links to direct image embed
  const driveMatch = working.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w800`;
  }
  const driveExport = working.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (driveExport) {
    return `https://drive.google.com/thumbnail?id=${driveExport[1]}&sz=w800`;
  }
  if (working.includes("dropbox.com") && !working.includes("raw=1")) {
    return working.replace(/dl=0/, "raw=1").replace(/\?$/, "?raw=1");
  }
  return working;
}

function QuestionImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [imgSrc, setImgSrc] = useState(transformImageUrl(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImgSrc(transformImageUrl(src));
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground", className)}>
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Image could not be loaded</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-primary underline">Open link</a>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        // If transformed URL fails, try original
        if (imgSrc !== src) {
          setImgSrc(src);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

function estimateLiveScore(
  questions: Question[],
  responses: Record<string, ResponseState>
) {
  let score = 0;
  let max = 0;

  for (const question of questions) {
    const marksPos = Number(question.marks_positive ?? 4);
    const marksNeg = Number(question.marks_negative ?? 1);

    max += marksPos;

    const response = responses[question.id];
    if (!response?.answer) continue;

    if (response.answer === question.correct_answer) score += marksPos;
    else score -= marksNeg;
  }

  return {
    score: Math.max(0, score),
    max: Math.max(0, max),
  };
}

function deriveResponseState(row: TestResponseRow): ResponseState {
  const answer = row.user_answer ?? "";
  const isAnswered = Boolean(answer);
  const isMarked = Boolean(row.is_marked_review);
  const isAttempted = Boolean(row.is_attempted);

  let state: QuestionState = "unattempted";

  if (isAnswered && isMarked) state = "answered-marked";
  else if (isAnswered) state = "answered";
  else if (isMarked) state = "marked";
  else if (isAttempted) state = "visited";

  return { answer, state };
}

export default function TestSession() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [test, setTest] = useState<MockTest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [startingTest, setStartingTest] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const responsesRef = useRef<Record<string, ResponseState>>({});
  const questionsRef = useRef<Question[]>([]);
  const questionEnterTsRef = useRef<number>(Date.now());
  const prevQuestionIdRef = useRef<string | null>(null);
  const timeSpentMapRef = useRef<Record<string, number>>({});
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);

  const currentQuestion = questions[currentIndex] ?? null;
  const currentResponse = currentQuestion
    ? responses[currentQuestion.id] ?? { answer: "", state: "visited" as QuestionState }
    : null;

  const hasTimer = useMemo(
    () => Number(test?.time_limit_minutes ?? 0) > 0,
    [test?.time_limit_minutes]
  );

  const answeredCount = useMemo(
    () => Object.values(responses).filter((r) => Boolean(r.answer)).length,
    [responses]
  );

  const markedCount = useMemo(
    () =>
      Object.values(responses).filter(
        (r) => r.state === "marked" || r.state === "answered-marked"
      ).length,
    [responses]
  );

  const visitedNoAnswerCount = useMemo(
    () => Object.values(responses).filter((r) => r.state === "visited").length,
    [responses]
  );

  const notVisitedCount = Math.max(0, questions.length - answeredCount - markedCount - visitedNoAnswerCount + markedCount);
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const subjectCounts = useMemo(() => {
    const counts: Record<string, { total: number; done: number }> = {};

    for (const question of questions) {
      if (!counts[question.subject]) counts[question.subject] = { total: 0, done: 0 };
      counts[question.subject].total += 1;
      if (responses[question.id]?.answer) counts[question.subject].done += 1;
    }

    return counts;
  }, [questions, responses]);

  const liveScore = useMemo(
    () => estimateLiveScore(questions, responses),
    [questions, responses]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!testId || !user?.id) return;
    void loadTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, user?.id]);

  // Keep refs in sync so autosave/unmount handlers see latest data without
  // having to recreate intervals on every keystroke.
  useEffect(() => { responsesRef.current = responses; }, [responses]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  useEffect(() => {
    if (!testId || !user?.id) return;

    autoSaveRef.current = setInterval(() => {
      void saveResponses();
    }, 30000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, user?.id]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      void saveResponses();
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentQuestion) return;

    const previousQuestionId = prevQuestionIdRef.current;

    if (previousQuestionId && previousQuestionId !== currentQuestion.id) {
      const elapsed = Math.max(
        0,
        Math.round((Date.now() - questionEnterTsRef.current) / 1000)
      );

      timeSpentMapRef.current[previousQuestionId] =
        (timeSpentMapRef.current[previousQuestionId] ?? 0) + elapsed;
    }

    questionEnterTsRef.current = Date.now();
    prevQuestionIdRef.current = currentQuestion.id;

    setResponses((prev) => {
      if (prev[currentQuestion.id]) return prev;
      return {
        ...prev,
        [currentQuestion.id]: { answer: "", state: "visited" },
      };
    });
  }, [currentQuestion?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);

      const previousQuestionId = prevQuestionIdRef.current;
      if (previousQuestionId) {
        const elapsed = Math.max(
          0,
          Math.round((Date.now() - questionEnterTsRef.current) / 1000)
        );
        timeSpentMapRef.current[previousQuestionId] =
          (timeSpentMapRef.current[previousQuestionId] ?? 0) + elapsed;
      }

      void saveResponses();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTest() {
    setLoading(true);

    try {
      const { data: testData, error: testError } = await supabase
        .from("mock_tests")
        .select("*")
        .eq("id", testId!)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (testError || !testData) {
        toast.error("Test not found.");
        navigate("/app/mock-test");
        return;
      }

      const loadedTest = testData as unknown as MockTest;

      if (loadedTest.status === "COMPLETED") {
        navigate(`/app/mock-test/results/${loadedTest.id}`);
        return;
      }

      const startedAt = loadedTest.started_at ?? null;

      // FIX: do NOT auto-promote DRAFT → IN_PROGRESS on page load. The user
      // must explicitly click "Start Test" so the timer doesn't silently begin
      // the moment they navigate to the page (production-readiness fix).

      const remainingSeconds = computeRemainingSeconds(loadedTest);

      const { data: questionRows, error: questionError } = await supabase
        .from("questions")
        .select("*")
        .in("id", loadedTest.question_ids);

      if (questionError) throw questionError;

      const questionMap: Record<string, Question> = {};
      for (const row of questionRows ?? []) {
        const question = row as unknown as Question;
        questionMap[question.id] = question;
      }

      const uniqueIds = [...new Set(loadedTest.question_ids)];
      const orderedQuestions = uniqueIds
        .map((id) => questionMap[id])
        .filter(Boolean);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? "";

      const responseFetch = await fetch(
        `${SUPABASE_URL}/rest/v1/test_responses?select=question_id,user_answer,is_attempted,is_marked_review,time_spent_seconds&test_id=eq.${loadedTest.id}&user_id=eq.${user!.id}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const responseRows: TestResponseRow[] = responseFetch.ok
        ? ((await responseFetch.json()) as TestResponseRow[])
        : [];

      const restoredResponses: Record<string, ResponseState> = {};
      const restoredTimeMap: Record<string, number> = {};

      for (const row of responseRows) {
        restoredResponses[row.question_id] = deriveResponseState(row);
        restoredTimeMap[row.question_id] = Number(row.time_spent_seconds ?? 0);
      }

      if (!mountedRef.current) return;

      setTest(loadedTest);
      setQuestions(orderedQuestions);
      setResponses(restoredResponses);
      setTimeLeft(remainingSeconds);
      timeSpentMapRef.current = restoredTimeMap;

      // Only auto-start the timer if the test is already IN_PROGRESS (resume).
      if (loadedTest.status === "IN_PROGRESS") {
        startTimer(loadedTest);
      }
    } catch (error) {
      console.error("[TestSession] load error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load test.");
      navigate("/app/mock-test");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function startTimer(forTest: MockTest) {
    if (timerRef.current) clearInterval(timerRef.current);
    if (Number(forTest.time_limit_minutes ?? 0) <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          void handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleStartTest() {
    if (!test || startingTest) return;
    setStartingTest(true);
    try {
      const startedAt = new Date().toISOString();
      const { error } = await supabase
        .from("mock_tests")
        .update({ status: "IN_PROGRESS", started_at: startedAt })
        .eq("id", test.id)
        .eq("user_id", user!.id);
      if (error) throw error;
      const updated: MockTest = { ...test, status: "IN_PROGRESS", started_at: startedAt };
      setTest(updated);
      setTimeLeft(computeRemainingSeconds(updated));
      setPaused(false);
      setPausedAt(null);
      startTimer(updated);
      toast.success("Test started — good luck!");
    } catch (err) {
      console.error("[TestSession] start error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to start test.");
    } finally {
      setStartingTest(false);
    }
  }

  function handlePause() {
    if (!test || paused) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPausedAt(Date.now());
    setPaused(true);
    void saveResponses();
    toast.message("Test paused. Resume when you're ready.");
  }

  async function handleResume() {
    if (!test || !paused) return;
    const pausedDurationMs = pausedAt ? Date.now() - pausedAt : 0;
    const pausedSeconds = Math.max(0, Math.round(pausedDurationMs / 1000));

    if (pausedSeconds > 0 && test.started_at) {
      // Push started_at forward so the math `remaining = limit - (now - started_at)`
      // continues to be correct after the pause window.
      const newStartedAt = new Date(
        new Date(test.started_at).getTime() + pausedDurationMs
      ).toISOString();
      try {
        const { error } = await supabase
          .from("mock_tests")
          .update({ started_at: newStartedAt })
          .eq("id", test.id)
          .eq("user_id", user!.id);
        if (error) throw error;
        const updated: MockTest = { ...test, started_at: newStartedAt };
        setTest(updated);
        setTimeLeft(computeRemainingSeconds(updated));
        setPaused(false);
        setPausedAt(null);
        startTimer(updated);
      } catch (err) {
        console.error("[TestSession] resume error:", err);
        toast.error("Failed to resume test.");
      }
    } else {
      setPaused(false);
      setPausedAt(null);
      startTimer(test);
    }
  }

  async function saveResponses() {
    if (!testId || !user?.id || questionsRef.current.length === 0) return;

    try {
      const currentId = currentQuestion?.id;
      if (currentId) {
        const elapsed = Math.max(
          0,
          Math.round((Date.now() - questionEnterTsRef.current) / 1000)
        );

        timeSpentMapRef.current[currentId] =
          (timeSpentMapRef.current[currentId] ?? 0) + elapsed;
        questionEnterTsRef.current = Date.now();
      }

      const responsesNow = responsesRef.current;
      const payload = questionsRef.current.map((question) => {
        const response = responsesNow[question.id] ?? {
          answer: "",
          state: "unattempted" as QuestionState,
        };

        return {
          test_id: testId,
          user_id: user.id,
          question_id: question.id,
          user_answer: response.answer || null,
          is_attempted: response.state !== "unattempted",
          is_marked_review:
            response.state === "marked" || response.state === "answered-marked",
          time_spent_seconds: timeSpentMapRef.current[question.id] ?? 0,
        };
      });

      const { error } = await supabase
        .from("test_responses")
        .upsert(payload, { onConflict: "test_id,question_id" });

      if (error) throw error;
    } catch (error) {
      console.warn("[TestSession] autosave failed:", error);
    }
  }

  function navigateTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
  }

  function updateAnswer(answer: string) {
    if (!currentQuestion) return;

    setResponses((prev) => {
      const existing = prev[currentQuestion.id] ?? {
        answer: "",
        state: "visited" as QuestionState,
      };

      const currentlyMarked =
        existing.state === "marked" || existing.state === "answered-marked";

      const nextState: QuestionState = currentlyMarked
        ? answer
          ? "answered-marked"
          : "marked"
        : answer
        ? "answered"
        : "visited";

      return {
        ...prev,
        [currentQuestion.id]: {
          answer,
          state: nextState,
        },
      };
    });
  }

  function clearResponse() {
    if (!currentQuestion) return;

    setResponses((prev) => {
      const existing = prev[currentQuestion.id] ?? {
        answer: "",
        state: "visited" as QuestionState,
      };

      const currentlyMarked =
        existing.state === "marked" || existing.state === "answered-marked";

      return {
        ...prev,
        [currentQuestion.id]: {
          answer: "",
          state: currentlyMarked ? "marked" : "visited",
        },
      };
    });
  }

  function toggleMarkCurrent() {
    if (!currentQuestion) return;

    setResponses((prev) => {
      const existing = prev[currentQuestion.id] ?? {
        answer: "",
        state: "visited" as QuestionState,
      };

      const hasAnswer = Boolean(existing.answer);
      const isMarked =
        existing.state === "marked" || existing.state === "answered-marked";

      const nextState: QuestionState = isMarked
        ? hasAnswer
          ? "answered"
          : "visited"
        : hasAnswer
        ? "answered-marked"
        : "marked";

      return {
        ...prev,
        [currentQuestion.id]: {
          ...existing,
          state: nextState,
        },
      };
    });
  }

  function handleMarkAndNext() {
    toggleMarkCurrent();
    if (currentIndex < questions.length - 1) navigateTo(currentIndex + 1);
  }

  function handleSaveAndNext() {
    if (!currentQuestion) return;

    setResponses((prev) => {
      const existing = prev[currentQuestion.id] ?? {
        answer: "",
        state: "visited" as QuestionState,
      };

      const nextState: QuestionState = existing.answer
        ? "answered"
        : existing.state === "marked"
        ? "marked"
        : "visited";

      return {
        ...prev,
        [currentQuestion.id]: {
          ...existing,
          state: nextState,
        },
      };
    });

    if (currentIndex < questions.length - 1) navigateTo(currentIndex + 1);
  }

  async function handleBookmarkCurrent() {
    if (!currentQuestion || !user?.id || !testId) return;

    setSavingBookmark(true);

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const payload = {
        user_id: user.id,
        question_id: currentQuestion.id,
        added_from_test_id: testId,
        next_review_date: tomorrow.toISOString().split("T")[0],
        interval_days: 1,
        review_count: 0,
        is_mastered: false,
      };

      const { error } = await supabase
        .from("revision_list")
        .upsert(payload, { onConflict: "user_id,question_id" });

      if (error) throw error;

      toast.success("Question added to revision list.");
    } catch (error) {
      console.error("[TestSession] bookmark failed:", error);
      toast.error("Failed to add to revision list.");
    } finally {
      setSavingBookmark(false);
    }
  }

  async function handleSubmit(autoSubmit = false) {
    if (!testId || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await saveResponses();

      await fetchEdgeJson("submit-test", { test_id: testId });

      toast.success(autoSubmit ? "Time's up! Test submitted." : "Test submitted.");
      navigate(`/app/mock-test/results/${testId}`);
    } catch (error) {
      console.error("[TestSession] submit failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to submit test.");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
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

  if (!test || !currentQuestion) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">No test session found.</p>
      </div>
    );
  }

  // Pre-start gate: test must be explicitly started by the user.
  if (test.status === "DRAFT") {
    const limitMins = Number(test.time_limit_minutes ?? 0);
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl text-center space-y-5">
          <h1 className="text-2xl font-black text-foreground">{test.test_name}</h1>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">{questions.length}</strong> questions</p>
            {limitMins > 0 && (
              <p><strong className="text-foreground">{limitMins} minutes</strong> time limit</p>
            )}
            <p className="text-xs">The timer starts only after you click Start. You can pause and resume during the test.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/app/mock-test")}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void handleStartTest()} disabled={startingTest}>
              {startingTest ? "Starting..." : "Start Test"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isMarked =
    currentResponse?.state === "marked" ||
    currentResponse?.state === "answered-marked";

  const timerTextClass =
    hasTimer && timeLeft <= 300
      ? "text-red-500 animate-pulse font-black"
      : "text-foreground font-bold";

  function NavigatorGrid() {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5">
        {questions.map((question, index) => {
          const response = responses[question.id] ?? {
            answer: "",
            state: "unattempted" as QuestionState,
          };

          return (
            <button
              key={question.id}
              type="button"
              onClick={() => navigateTo(index)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md border text-xs font-bold transition-all",
                STATE_COLORS[response.state],
                index === currentIndex &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-background scale-105"
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background font-sans">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[85vw] max-w-xs flex-col p-0">
              <div className="border-b p-4 font-bold bg-muted/20">Questions Navigator</div>
              <div className="flex-1 overflow-y-auto p-4">
                <NavigatorGrid />
              </div>
            </SheetContent>
          </Sheet>

          <span className="max-w-[150px] truncate text-sm font-semibold">
            {test.test_name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasTimer ? (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 font-mono text-base",
                timerTextClass
              )}
            >
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
          ) : (
            <div className="rounded-md border bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              No limit
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8"
            onClick={() => setShowSubmitModal(true)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-[240px] shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
          <div className="border-b border-border p-4">
            <h1 className="truncate text-sm font-bold text-foreground" title={test.test_name}>
              {test.test_name}
            </h1>
          </div>

          <div className="border-b border-border bg-muted/10 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Section Progress
            </p>
            <div className="space-y-1.5">
              {Object.entries(subjectCounts).map(([subject, counts]) => (
                <div key={subject} className="flex items-center justify-between text-xs">
                  <span
                    className="max-w-[120px] truncate text-muted-foreground"
                    title={subject}
                  >
                    {subject}
                  </span>
                  <span className="font-medium text-foreground">
                    {counts.done}/{counts.total}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
            <NavigatorGrid />
          </div>

          <div className="space-y-2 border-t border-border bg-muted/20 p-4">
            {[
              {
                label: "Not visited",
                color: "bg-card border-border",
              },
              {
                label: "Visited, no ans",
                color: "bg-yellow-500/10 border-yellow-500/40",
              },
              {
                label: "Answered",
                color: "bg-green-500/10 border-green-500/40",
              },
              {
                label: "For review",
                color: "bg-purple-500/10 border-purple-500/40",
              },
              {
                label: "Ans + review",
                color: "bg-red-500/10 border-red-500/40",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={cn("h-3.5 w-3.5 rounded border shrink-0", item.color)} />
                <span className="text-[10px] font-medium text-muted-foreground">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex flex-1 flex-col bg-background">
          <div className="z-10 hidden items-center justify-between border-b border-border bg-card px-6 py-3 shadow-sm md:flex">
            <div className="flex gap-2">
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                Q. {currentIndex + 1}{" "}
                <span className="text-muted-foreground">/ {questions.length}</span>
              </span>

              <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground">
                {currentQuestion.subject}
              </span>

              <span
                className={cn(
                  "flex items-center rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide",
                  currentQuestion.difficulty === "HARD"
                    ? "bg-red-500/10 text-red-500"
                    : currentQuestion.difficulty === "EASY"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-amber-500/10 text-amber-500"
                )}
              >
                {currentQuestion.difficulty}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm font-semibold">
              <div className="flex gap-1 text-muted-foreground">
                <span className="text-green-500">
                  +{Number(currentQuestion.marks_positive ?? 4)}
                </span>
                <span>/</span>
                <span className="text-red-400">
                  -{Number(currentQuestion.marks_negative ?? 1)}
                </span>
              </div>
            </div>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-32 pt-4 md:px-8 md:pt-8">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="mb-4 flex items-center justify-between md:hidden">
                <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">
                  Q. {currentIndex + 1}
                </span>
                <div className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {currentQuestion.subject} • +{Number(currentQuestion.marks_positive ?? 4)}/-
                  {Number(currentQuestion.marks_negative ?? 1)}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 text-[17px] font-medium leading-relaxed text-foreground shadow-sm md:text-lg">
                <MathText text={currentQuestion.question_text} />
                {currentQuestion.image_url && (
                  <QuestionImage src={currentQuestion.image_url} alt="Question" className="mt-3 max-w-full rounded-lg" />
                )}
              </div>

              {currentQuestion.question_type === "MCQ" ||
              currentQuestion.question_type === "TRUE_FALSE" ? (
                <div className="grid grid-cols-1 gap-3 pt-2">
                {(Array.isArray(currentQuestion.options)
                  ? currentQuestion.options
                  : Object.entries(currentQuestion.options ?? {}).map(([key, val]) => ({ label: key, text: String(val) }))
                ).map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => updateAnswer(option.label)}
                      className={cn(
                        "group flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all duration-200",
                        currentResponse?.answer === option.label
                          ? "border-blue-500 bg-blue-500/10 shadow-sm"
                          : "border-border hover:border-blue-500/40 hover:bg-muted/30"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                          currentResponse?.answer === option.label
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-muted-foreground text-muted-foreground group-hover:border-blue-500/50 group-hover:text-blue-500"
                        )}
                      >
                        {option.label}
                      </span>

                      <span className="text-[15px] text-foreground md:text-base">
                        <MathText text={option.text} />
                        {(/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)/i.test(option.text) || /drive\.google\.com|dropbox\.com|imgur\.com/i.test(option.text)) && (
                          <QuestionImage
                            src={option.text}
                            alt={`Option ${option.label}`}
                            className="mt-2 max-h-32 rounded-lg object-contain"
                          />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pt-2">
                  <input
                    type={
                      currentQuestion.question_type === "NUMERICAL" ? "number" : "text"
                    }
                    value={currentResponse?.answer ?? ""}
                    onChange={(e) => updateAnswer(e.target.value)}
                    placeholder={
                      currentQuestion.question_type === "NUMERICAL"
                        ? "Enter numerical value..."
                        : "Enter your answer..."
                    }
                    className="w-full rounded-xl border-2 border-border bg-background px-4 py-4 text-lg text-foreground shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-border bg-card shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
            <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 px-4 py-3 md:flex-row md:py-4">
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearResponse}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Clear
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleBookmarkCurrent()}
                  disabled={savingBookmark}
                >
                  <BookmarkPlus className="mr-1.5 h-4 w-4" />
                  Bookmark
                </Button>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 sm:flex-none",
                    isMarked
                      ? "border-purple-500/30 bg-purple-500/10 text-purple-600"
                      : "bg-muted/50"
                  )}
                  onClick={handleMarkAndNext}
                >
                  <Flag className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Mark for Review & Next</span>
                  <span className="sm:hidden">Mark & Next</span>
                </Button>

                <Button
                  className="flex-1 bg-green-600 text-white shadow-md shadow-green-600/20 hover:bg-green-700 sm:flex-none"
                  onClick={handleSaveAndNext}
                >
                  Save & Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 hidden w-[280px] shrink-0 flex-col border-l border-border bg-card shadow-lg lg:flex">
          <div className="border-b border-border bg-muted/10 p-6 text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Time Remaining
            </p>

            {hasTimer ? (
              <div className={cn("font-mono text-3xl font-black tracking-tight", timerTextClass)}>
                {formatTime(timeLeft)}
              </div>
            ) : (
              <div className="text-lg font-bold text-muted-foreground">No limit</div>
            )}
          </div>

          <div className="border-b border-border p-5 text-center">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-primary/80">
                Est. Score
              </p>
              <p className="text-3xl font-black text-primary">
                {liveScore.score}{" "}
                <span className="text-sm font-semibold text-muted-foreground">
                  / {liveScore.max}
                </span>
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Session Summary
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Answered
                  </span>
                </div>
                <span className="text-base font-bold text-green-500">{answeredCount}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Visited, no ans
                  </span>
                </div>
                <span className="text-base font-bold text-yellow-500">
                  {visitedNoAnswerCount}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  <span className="text-sm font-medium text-muted-foreground">
                    For Review
                  </span>
                </div>
                <span className="text-base font-bold text-purple-500">{markedCount}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Unanswered
                  </span>
                </div>
                <span className="text-base font-bold text-muted-foreground">
                  {unansweredCount}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-border bg-muted/5 p-5 space-y-2">
            {hasTimer && (
              paused ? (
                <Button variant="outline" size="sm" className="w-full" onClick={() => void handleResume()}>
                  Resume Test
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={handlePause}>
                  Pause Test
                </Button>
              )
            )}
            <Button
              size="lg"
              className="w-full text-base font-bold"
              onClick={() => setShowSubmitModal(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Submit Test
            </Button>
          </div>
        </div>
      </div>

      {paused && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl space-y-4">
            <h2 className="text-xl font-black text-foreground">Test Paused</h2>
            <p className="text-sm text-muted-foreground">
              The timer is on hold. Click resume to continue your test.
            </p>
            <Button className="w-full" onClick={() => void handleResume()}>
              Resume Test
            </Button>
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl md:p-8">
            <h2 className="mb-6 text-center text-2xl font-black text-foreground">
              Submit Assessment?
            </h2>

            <div className="mb-6 space-y-1 rounded-xl border border-border bg-muted/30 p-5">
              <div className="flex items-center justify-between border-b border-border/50 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Answered
                </span>
                <span className="font-bold text-green-500">{answeredCount}</span>
              </div>

              <div className="flex items-center justify-between border-b border-border/50 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Visited, no answer
                </span>
                <span className="font-bold text-yellow-500">{visitedNoAnswerCount}</span>
              </div>

              <div className="flex items-center justify-between border-b border-border/50 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Not visited
                </span>
                <span className="font-bold text-muted-foreground">{notVisitedCount}</span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Marked for review
                </span>
                <span className="font-bold text-purple-500">{markedCount}</span>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  You still have <strong>{unansweredCount} questions</strong> not fully
                  answered. After submission, answers cannot be changed.
                </p>
              </div>
            )}

            <div className="flex gap-3">
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
                onClick={() => void handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Yes, Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
