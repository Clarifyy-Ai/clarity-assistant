import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import {
  fetchPracticeWorkspaceQuestions,
  type PracticeQuestionSource,
  type PracticeWorkspaceQuestion,
} from "@/lib/practice/playablePracticeQuestions";
import {
  INTERVIEW_TYPES,
  scorePracticeAnswers,
  type InterviewType,
} from "@/lib/practice/workspaceScoring";
import {
  buildDraftExpiresAt,
  countAnswerStates,
  findInvalidAnswerIndex,
  initAnswerSlots,
  isDraftExpired,
  MAX_ANSWER_LENGTH,
  MIN_ANSWER_LENGTH,
  normalizeAnswerText,
  packPracticeAnswers,
  safeTrim,
} from "@/lib/practice/workspaceAnswers";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
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

type HistoryRow = {
  id: string;
  interview_type: string;
  scores: { overall?: number } | null;
  started_at: string;
  status?: string;
};

export default function PracticeWorkspacePage() {
  const user = useAuthStore((s) => s.user);
  const [role, setRole] = useState("Software Engineer");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [interviewType, setInterviewType] = useState<InterviewType>("Behavioral");
  const [started, setStarted] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<boolean[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [questions, setQuestions] = useState<PracticeWorkspaceQuestion[]>([]);
  const [questionSource, setQuestionSource] = useState<PracticeQuestionSource>("local");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [staleTab, setStaleTab] = useState(false);
  const [ending, setEnding] = useState(false);
  const persistTimerRef = useRef<number | null>(null);

  const counts = countAnswerStates(questions.length, answers, skipped);

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [started]);

  const refreshHistory = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("practice_workspace_sessions")
      .select("id,interview_type,scores,started_at,status")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(8);
    setHistory((data as HistoryRow[]) ?? []);
  }, [user?.id]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, started]);

  // Restore active draft on mount
  useEffect(() => {
    if (!user?.id) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("practice_workspace_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[practice-workspace] restore:", error.message);
        setRestoring(false);
        return;
      }
      if (!data) {
        setRestoring(false);
        return;
      }
      if (isDraftExpired(data.expires_at as string | null)) {
        await supabase
          .from("practice_workspace_sessions")
          .update({ status: "expired" })
          .eq("id", data.id)
          .eq("status", "active");
        toast.message("Previous practice session expired", {
          description: "Start a new session to continue practicing.",
        });
        setRestoring(false);
        return;
      }
      const order = (data.question_order as PracticeWorkspaceQuestion[]) ?? [];
      const restoredAnswers = Array.isArray(data.answers)
        ? (data.answers as Array<{ answer?: string }>).map((a) =>
            typeof a === "string" ? a : String(a?.answer ?? ""),
          )
        : [];
      const restoredSkipped = Array.isArray(data.skipped)
        ? (data.skipped as boolean[])
        : [];
      const slots = initAnswerSlots(order.length);
      for (let i = 0; i < order.length; i++) {
        slots.answers[i] = restoredAnswers[i] ?? "";
        slots.skipped[i] = Boolean(restoredSkipped[i]);
      }
      setDraftId(String(data.id));
      setDraftVersion(Number(data.version) || 1);
      setRole(String(data.role ?? "Software Engineer"));
      setDifficulty((data.difficulty as typeof difficulty) || "medium");
      setInterviewType((data.interview_type as InterviewType) || "Behavioral");
      setQuestions(order);
      setAnswers(slots.answers);
      setSkipped(slots.skipped);
      setIndex(Math.min(Math.max(0, Number(data.current_index) || 0), Math.max(0, order.length - 1)));
      setSeconds(Number(data.elapsed_seconds) || 0);
      setNotes(String(data.notes ?? ""));
      setQuestionSource((data.question_source as PracticeQuestionSource) || "local");
      setStarted(order.length > 0);
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const persistDraft = useCallback(async () => {
    if (!user?.id || !draftId || !started || staleTab) return;
    const packed = packPracticeAnswers(questions, answers, skipped);
    const nextVersion = draftVersion + 1;
    const { data, error } = await supabase
      .from("practice_workspace_sessions")
      .update({
        current_index: index,
        question_order: questions,
        answers: packed,
        skipped,
        notes,
        elapsed_seconds: seconds,
        expires_at: buildDraftExpiresAt(),
        version: nextVersion,
        mode: interviewType,
        question_source: questionSource,
        role,
        difficulty,
        interview_type: interviewType,
      })
      .eq("id", draftId)
      .eq("version", draftVersion)
      .eq("status", "active")
      .select("id,version")
      .maybeSingle();
    if (error) {
      console.warn("[practice-workspace] persist:", error.message);
      return;
    }
    if (!data) {
      setStaleTab(true);
      toast.error("This session was updated in another tab. Reload to continue.");
      return;
    }
    setDraftVersion(Number(data.version) || nextVersion);
  }, [
    user?.id,
    draftId,
    started,
    staleTab,
    questions,
    answers,
    skipped,
    index,
    notes,
    seconds,
    draftVersion,
    interviewType,
    questionSource,
    role,
    difficulty,
  ]);

  useEffect(() => {
    if (!started || !draftId) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      void persistDraft();
    }, 500);
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [started, draftId, answers, skipped, index, notes, seconds, persistDraft]);

  async function startSession() {
    if (!user?.id) return;
    setLoadingQuestions(true);
    try {
      // Close any leftover active draft before creating a new one
      await supabase
        .from("practice_workspace_sessions")
        .update({ status: "expired" })
        .eq("user_id", user.id)
        .eq("status", "active");

      const result = await fetchPracticeWorkspaceQuestions({
        interviewType,
        role,
        difficulty,
        count: 4,
      });
      const slots = initAnswerSlots(result.questions.length);
      const expiresAt = buildDraftExpiresAt();
      const { data: inserted, error } = await supabase
        .from("practice_workspace_sessions")
        .insert({
          user_id: user.id,
          role,
          difficulty,
          interview_type: interviewType,
          status: "active",
          current_index: 0,
          question_order: result.questions,
          answers: packPracticeAnswers(result.questions, slots.answers, slots.skipped),
          skipped: slots.skipped,
          notes: "",
          elapsed_seconds: 0,
          expires_at: expiresAt,
          version: 1,
          mode: interviewType,
          question_source: result.source,
          scores: null,
          ended_at: null,
        })
        .select("id,version")
        .single();
      if (error || !inserted) {
        toast.error(error?.message ?? "Could not start practice session.");
        return;
      }
      setDraftId(String(inserted.id));
      setDraftVersion(Number(inserted.version) || 1);
      setStaleTab(false);
      setQuestions(result.questions);
      setQuestionSource(result.source);
      setAnswers(slots.answers);
      setSkipped(slots.skipped);
      setIndex(0);
      setSeconds(0);
      setNotes("");
      setStarted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load practice questions.");
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function finish() {
    if (!user?.id || ending) return;
    setEnding(true);
    try {
      const invalidAnswerIndex = findInvalidAnswerIndex(answers, skipped);
      if (invalidAnswerIndex !== -1) {
        setShowEndConfirm(false);
        setIndex(invalidAnswerIndex);
        toast.error(
          `Answer ${invalidAnswerIndex + 1} must be at least ${MIN_ANSWER_LENGTH} characters, or mark it as skipped.`,
        );
        return;
      }
      const packed = packPracticeAnswers(questions, answers, skipped);
      const scores = scorePracticeAnswers(
        packed.map((p) => ({ question: p.question, answer: p.answer })),
        interviewType,
      );
      if (draftId) {
        const { data, error } = await supabase
          .from("practice_workspace_sessions")
          .update({
            status: "completed",
            ended_at: new Date().toISOString(),
            answers: packed,
            skipped,
            scores: {
              ...scores,
              preview: true,
              scoring_authority: "client_preview",
            },
            notes,
            current_index: index,
            elapsed_seconds: seconds,
            version: draftVersion + 1,
            expires_at: null,
          })
          .eq("id", draftId)
          .eq("status", "active")
          .select("id")
          .maybeSingle();
        if (error) {
          toast.error(error.message);
          return;
        }
        if (!data) {
          // Already completed idempotently elsewhere
          toast.message("Session already ended.");
        }
      } else {
        const { error } = await supabase.from("practice_workspace_sessions").insert({
          user_id: user.id,
          role,
          difficulty,
          interview_type: interviewType,
          status: "completed",
          ended_at: new Date().toISOString(),
          notes,
          answers: packed,
          skipped,
          scores: {
            ...scores,
            preview: true,
            scoring_authority: "client_preview",
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
      }
      setShowEndConfirm(false);
      setStarted(false);
      setDraftId(null);
      setAnswers([]);
      setSkipped([]);
      setQuestions([]);
      setIndex(0);
      setSeconds(0);
      void refreshHistory();
      toast.success(
        `Overall ${scores.overall}. Answered ${counts.answered}, skipped ${counts.skipped}, unanswered ${counts.unanswered}.`,
      );
    } finally {
      setEnding(false);
    }
  }

  function saveAnswer() {
    const text = safeTrim(answers[index]);
    if (!text) {
      toast.error("Type an answer before saving, or use Skip.");
      return;
    }
    if (text.length < MIN_ANSWER_LENGTH) {
      toast.error(`Answer must be at least ${MIN_ANSWER_LENGTH} characters.`);
      return;
    }
    setSkipped((current) => {
      const next = [...current];
      next[index] = false;
      return next;
    });
    toast.success("Answer saved");
    void persistDraft();
  }

  if (restoring) {
    return (
      <div className={PAGE_SHELL}>
        <PageHeader title="Interview Practice Workspace" description="Restoring your session…" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Interview Practice Workspace"
        description="Visible practice for interview preparation. This workspace is not a hidden overlay and cannot evade screen sharing."
      />
      {staleTab && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Another tab updated this session.{" "}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Reload
          </button>{" "}
          to continue.
        </div>
      )}
      {!started ? (
        <Card className="space-y-3">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Select role" />
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
            <SelectTrigger><SelectValue placeholder="Difficulty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={interviewType} onValueChange={(v) => setInterviewType(v as InterviewType)}>
            <SelectTrigger><SelectValue placeholder="Interview type" /></SelectTrigger>
            <SelectContent>
              {INTERVIEW_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            loading={loadingQuestions}
            data-testid="practice-start-session"
            onClick={() => void startSession()}
          >
            Start session
          </Button>
          <h2 className="pt-4 text-sm font-semibold">Practice history</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {history.map((row) => (
              <li key={row.id}>
                {new Date(row.started_at).toLocaleString()} · {row.interview_type} · overall {row.scores?.overall ?? "—"}
              </li>
            ))}
          </ul>
          <Link className="text-sm text-primary underline" to="/app/mock">Open existing mock interview</Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <p className="text-xs text-muted-foreground" data-testid="practice-session-meta">
              Timer {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              {" · "}Q{index + 1}/{questions.length}
              {" · "}Answered {counts.answered} · Skipped {counts.skipped} · Unanswered {counts.unanswered}
            </p>
            <h2 className="mt-2 font-semibold">Interview question</h2>
            <p className="mt-2 text-sm" data-testid="practice-question-text">{questions[index]?.question}</p>
            {skipped[index] && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                Marked as skipped — you can still edit and save an answer.
              </p>
            )}
            <h3 className="mt-4 text-sm font-semibold">Candidate answer</h3>
            <Textarea
              className="mt-2 min-h-[140px]"
              data-testid="practice-answer-input"
              value={answers[index] ?? ""}
              aria-invalid={
                !skipped[index] &&
                safeTrim(answers[index]).length > 0 &&
                safeTrim(answers[index]).length < MIN_ANSWER_LENGTH
              }
              onChange={(e) => {
                const value = normalizeAnswerText(e.target.value);
                setAnswers((current) => {
                  const next = [...current];
                  while (next.length < questions.length) next.push("");
                  next[index] = value;
                  return next;
                });
                if (safeTrim(value)) {
                  setSkipped((current) => {
                    const next = [...current];
                    while (next.length < questions.length) next.push(false);
                    next[index] = false;
                    return next;
                  });
                }
              }}
            />
            {!skipped[index] &&
              safeTrim(answers[index]).length > 0 &&
              safeTrim(answers[index]).length < MIN_ANSWER_LENGTH && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  Answer must be at least {MIN_ANSWER_LENGTH} characters, or use Skip.
                </p>
              )}
            <p className="mt-1 text-xs text-muted-foreground">
              {(answers[index] ?? "").length}/{MAX_ANSWER_LENGTH} characters. Answers need at least{" "}
              {MIN_ANSWER_LENGTH} characters; use Skip if you do not know.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={index >= questions.length - 1}
                onClick={() => {
                  const answer = safeTrim(answers[index]);
                  if (answer && answer.length < MIN_ANSWER_LENGTH && !skipped[index]) {
                    toast.error(`Answer must be at least ${MIN_ANSWER_LENGTH} characters, or choose Skip.`);
                    return;
                  }
                  setIndex((i) => i + 1);
                }}
              >
                Next
              </Button>
              <Button
                variant="outline"
                data-testid="practice-skip"
                onClick={() => {
                  setSkipped((current) => {
                    const next = [...current];
                    while (next.length < questions.length) next.push(false);
                    next[index] = true;
                    return next;
                  });
                  if (index < questions.length - 1) setIndex((i) => i + 1);
                }}
              >
                Skip / I don&apos;t know
              </Button>
              <Button variant="secondary" data-testid="practice-save-answer" onClick={saveAnswer}>
                Save Answer
              </Button>
              <Button data-testid="practice-end-session" onClick={() => setShowEndConfirm(true)}>
                End session
              </Button>
            </div>
          </Card>
          <Card className="min-w-0">
            <h3 className="text-sm font-semibold">Notes</h3>
            <Textarea className="mt-2 min-h-[180px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {skipped.some(Boolean) && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <h4 className="text-sm font-semibold">Skipped questions</h4>
                <p className="mt-1 text-xs text-muted-foreground">Review any skipped question before ending the session.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {skipped.map((wasSkipped, questionIndex) => wasSkipped && (
                    <Button key={questions[questionIndex]?.id ?? questionIndex} size="xs" variant="outline" onClick={() => setIndex(questionIndex)}>
                      Question {questionIndex + 1}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Everything on this page is visible. Use it to rehearse, not to hide assistance.
              {questionSource === "local"
                ? " Questions are from the local practice bank because the playable bank had no interview-topic matches."
                : " Questions are from the playable practice bank."}
            </p>
          </Card>
        </div>
      )}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this practice session?</AlertDialogTitle>
            <AlertDialogDescription>
              Answered {counts.answered}, skipped {counts.skipped}, unanswered {counts.unanswered}
              {counts.invalid ? `, invalid ${counts.invalid}` : ""}. Your answers will be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={ending}
              data-testid="practice-end-confirm"
              onClick={() => void finish()}
            >
              End Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
