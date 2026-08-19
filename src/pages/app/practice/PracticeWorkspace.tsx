import { useEffect, useState } from "react";
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

const MIN_ANSWER_LENGTH = 10;
const MAX_ANSWER_LENGTH = 5000;

export default function PracticeWorkspacePage() {
  const user = useAuthStore((s) => s.user);
  const [role, setRole] = useState("Software Engineer");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [interviewType, setInterviewType] = useState<InterviewType>("Behavioral");
  const [started, setStarted] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<boolean[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [questions, setQuestions] = useState<PracticeWorkspaceQuestion[]>([]);
  const [questionSource, setQuestionSource] = useState<PracticeQuestionSource>("local");
  const [history, setHistory] = useState<Array<{ id: string; interview_type: string; scores: { overall?: number } | null; started_at: string }>>([]);

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [started]);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("practice_workspace_sessions")
      .select("id,interview_type,scores,started_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setHistory((data as typeof history) ?? []));
  }, [user?.id, started]);

  async function startSession() {
    setLoadingQuestions(true);
    try {
      const result = await fetchPracticeWorkspaceQuestions({
        interviewType,
        role,
        difficulty,
        count: 4,
      });
      setQuestions(result.questions);
      setQuestionSource(result.source);
      setAnswers([]);
      setSkipped([]);
      setIndex(0);
      setSeconds(0);
      setStarted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load practice questions.");
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function finish() {
    if (!user?.id) return;
    const invalidAnswerIndex = answers.findIndex(
      (answer, i) => !skipped[i] && answer.trim().length > 0 && answer.trim().length < MIN_ANSWER_LENGTH,
    );
    if (invalidAnswerIndex !== -1) {
      setShowEndConfirm(false);
      setIndex(invalidAnswerIndex);
      toast.error(`Answer ${invalidAnswerIndex + 1} must be at least ${MIN_ANSWER_LENGTH} characters, or mark it as skipped.`);
      return;
    }
    const packed = questions.map((q, i) => ({
      question: q.question,
      answer: answers[i] ?? "",
      status: skipped[i] || !(answers[i] ?? "").trim() ? "skipped" : "answered",
    }));
    const scores = scorePracticeAnswers(packed, interviewType);
    const { error } = await supabase.from("practice_workspace_sessions").insert({
      user_id: user.id,
      role,
      difficulty,
      interview_type: interviewType,
      ended_at: new Date().toISOString(),
      notes,
      answers: packed,
      scores,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setShowEndConfirm(false);
    setStarted(false);
    setAnswers([]);
    setSkipped([]);
    setIndex(0);
    setSeconds(0);
    toast.success(`Overall ${scores.overall}. This is a practice rubric, not an official score.`);
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Interview Practice Workspace"
        description="Visible practice for interview preparation. This workspace is not a hidden overlay and cannot evade screen sharing."
      />
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
          <Button loading={loadingQuestions} onClick={() => void startSession()}>
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
            <p className="text-xs text-muted-foreground">Timer {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>
            <h2 className="mt-2 font-semibold">Interview question</h2>
            <p className="mt-2 text-sm">{questions[index]?.question}</p>
            <h3 className="mt-4 text-sm font-semibold">Candidate answer</h3>
            <Textarea
              className="mt-2 min-h-[140px]"
              value={answers[index] ?? ""}
              onChange={(e) => {
                const value = e.target.value.slice(0, MAX_ANSWER_LENGTH);
                const next = [...answers];
                next[index] = value;
                setAnswers(next);
                if (value.trim()) {
                  setSkipped((current) => {
                    const next = [...current];
                    next[index] = false;
                    return next;
                  });
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {(answers[index] ?? "").length}/{MAX_ANSWER_LENGTH} characters. Answers need at least {MIN_ANSWER_LENGTH} characters; use Skip if you do not know.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Previous</Button>
              <Button variant="outline" disabled={index >= questions.length - 1} onClick={() => {
                const answer = (answers[index] ?? "").trim();
                if (answer && answer.length < MIN_ANSWER_LENGTH) {
                  toast.error(`Answer must be at least ${MIN_ANSWER_LENGTH} characters, or choose Skip.`);
                  return;
                }
                setIndex((i) => i + 1);
              }}>Next</Button>
              <Button variant="outline" onClick={() => {
                setSkipped((current) => {
                  const next = [...current];
                  next[index] = true;
                  return next;
                });
                if (index < questions.length - 1) setIndex((i) => i + 1);
              }}>Skip / I don't know</Button>
              <Button onClick={() => setShowEndConfirm(true)}>End session</Button>
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
            <AlertDialogDescription>Are you sure you want to end this session? Your answers and skipped questions will be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void finish()}>End Session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
