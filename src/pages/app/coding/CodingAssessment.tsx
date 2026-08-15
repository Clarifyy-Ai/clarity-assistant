import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/authStore";
import { runVisibleJavascriptTests } from "@/lib/interview/jsVisibleRunner";
import { remainingSubmissions, stripHiddenTestCases } from "@/lib/coding/assessment";
import { PAGE_SHELL, SPLIT_STACK } from "@/lib/ui/responsivePage";

type Question = {
  id: string;
  title: string;
  description: string;
  constraints: string | null;
  sample_input: string | null;
  sample_output: string | null;
  starter_code: string;
  language: string;
  time_limit_ms: number;
  max_submissions: number;
  evaluation_mode: string;
};

type SampleCase = { id: string; name: string; input: unknown; expected: unknown };
type HistoryRow = { id: string; submitted_at: string; status: string; score: number | null };

export default function CodingAssessmentPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const user = useAuthStore((s) => s.user);
  const [question, setQuestion] = useState<Question | null>(null);
  const [code, setCode] = useState("");
  const [sample, setSample] = useState<SampleCase[]>([]);
  const [sampleOut, setSampleOut] = useState<string>("");
  const [serverResult, setServerResult] = useState<string>("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!questionId || !user?.id) return;
    const { data } = await supabase
      .from("coding_questions")
      .select("id,title,description,constraints,sample_input,sample_output,starter_code,language,time_limit_ms,max_submissions,evaluation_mode")
      .eq("id", questionId)
      .maybeSingle();
    setQuestion(data as Question | null);
    setCode((data?.starter_code as string) ?? "");
    const { data: cases } = await supabase
      .from("coding_test_cases")
      .select("id,name,input_json,expected_json,is_hidden")
      .eq("question_id", questionId)
      .eq("is_hidden", false);
    const publicCases = stripHiddenTestCases(
      ((cases ?? []) as Array<{ id: string; name: string; input_json: unknown; expected_json: unknown; is_hidden: boolean }>).map((c) => ({
        id: c.id,
        name: c.name,
        input: c.input_json,
        expected: c.expected_json,
        is_hidden: c.is_hidden,
      })),
    );
    setSample(publicCases);
    const { data: subs } = await supabase
      .from("coding_submissions")
      .select("id,submitted_at,status,score")
      .eq("user_id", user.id)
      .eq("question_id", questionId)
      .order("submitted_at", { ascending: false });
    setHistory((subs as HistoryRow[]) ?? []);
  }, [questionId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = useMemo(
    () => remainingSubmissions(history.length, question?.max_submissions ?? 20),
    [history.length, question?.max_submissions],
  );

  function runSample() {
    const outcome = runVisibleJavascriptTests(code, sample, question?.time_limit_ms ?? 800);
    setSampleOut(
      outcome.blockedReason
        ? outcome.blockedReason
        : outcome.results.map((r) => `${r.name}: ${r.passed ? "pass" : "fail"}${r.error ? ` (${r.error})` : ""}`).join("\n"),
    );
  }

  async function submit() {
    if (!user?.id || !questionId || left <= 0) {
      toast.error("No submissions remaining.");
      return;
    }
    setBusy(true);
    setServerResult("");
    try {
      const result = await fetchEdgeJson<{
        status: string;
        score: number | null;
        passed_tests?: number;
        failed_tests?: number;
        execution_status?: string;
        message?: string;
      }>("score-coding-submission", {
        question_id: questionId,
        code,
        language: question?.language ?? "javascript",
      });
      setServerResult(
        result.message
          ?? `Status ${result.status}. Score ${result.score ?? "pending"}. Passed ${result.passed_tests ?? "—"}. Failed ${result.failed_tests ?? "—"}.`,
      );
      void load();
    } catch {
      const { error: insertError } = await supabase.from("coding_submissions").insert({
        user_id: user.id,
        question_id: questionId,
        code,
        language: question?.language ?? "javascript",
        status: "submitted",
        score: null,
        result_payload: { note: "Awaiting server evaluation. Client scores are not trusted." },
      });
      setServerResult(
        insertError
          ? insertError.message
          : "Submission stored. Score will appear after server evaluation — client results are not used.",
      );
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={question?.title ?? "Coding assessment"}
        description="Interview preparation only. Hidden tests stay on the server."
        breadcrumbs={[{ label: "Coding", href: "/app/coding" }, { label: question?.title ?? "Problem" }]}
        actions={<span className="text-sm tabular-nums">Timer {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}
      />
      <div className={SPLIT_STACK}>
        <Card className="min-w-0 flex-1">
          <h2 className="font-semibold">Problem</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{question?.description}</p>
          <h3 className="mt-4 text-sm font-semibold">Examples</h3>
          <p className="text-sm">Input: {question?.sample_input}</p>
          <p className="text-sm">Output: {question?.sample_output}</p>
          <h3 className="mt-4 text-sm font-semibold">Constraints</h3>
          <p className="text-sm">{question?.constraints}</p>
        </Card>
        <Card className="min-w-0 flex-1">
          <label className="text-sm font-semibold" htmlFor="code-editor">Code editor</label>
          <textarea
            id="code-editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-2 h-64 w-full min-w-0 rounded-xl border border-border bg-background p-3 font-mono text-xs"
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCode(question?.starter_code ?? "")}>Reset code</Button>
            <Button variant="outline" onClick={runSample}>Run sample</Button>
            <Button onClick={() => void submit()} loading={busy} disabled={left <= 0}>Submit assessment</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{left} submissions remaining</p>
          {sampleOut && (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-secondary/50 p-3 text-xs">Sample results{"\n"}{sampleOut}</pre>
          )}
          {serverResult && (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-secondary/50 p-3 text-xs">Test results{"\n"}{serverResult}</pre>
          )}
          <h3 className="mt-4 text-sm font-semibold">Submission history</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {history.map((row) => (
              <li key={row.id}>
                {new Date(row.submitted_at).toLocaleString()} · {row.status} · {row.score ?? "unscored"}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
