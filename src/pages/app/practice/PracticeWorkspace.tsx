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
    const packed = questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? "" }));
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
    if (error) toast.error(error.message);
    setStarted(false);
    setAnswers([]);
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
                const next = [...answers];
                next[index] = e.target.value;
                setAnswers(next);
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Previous</Button>
              <Button variant="outline" disabled={index >= questions.length - 1} onClick={() => setIndex((i) => i + 1)}>Next</Button>
              <Button onClick={() => void finish()}>End session</Button>
            </div>
          </Card>
          <Card className="min-w-0">
            <h3 className="text-sm font-semibold">Notes</h3>
            <Textarea className="mt-2 min-h-[180px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="mt-3 text-xs text-muted-foreground">
              Everything on this page is visible. Use it to rehearse, not to hide assistance.
              {questionSource === "local"
                ? " Questions are from the local practice bank because the playable bank had no interview-topic matches."
                : " Questions are from the playable practice bank."}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
