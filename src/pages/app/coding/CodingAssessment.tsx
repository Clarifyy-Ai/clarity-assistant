import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { useAuthStore } from "@/store/authStore";
import { remainingSubmissions, stripHiddenTestCases } from "@/lib/coding/assessment";
import { formatCodingExecutionSummary, isCodingInfrastructureFailure } from "@/lib/coding/sampleResult";
import { CodingCaseResultsTable } from "@/components/coding/CodingCaseResultsTable";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import type { SolveCaseResult } from "@/lib/coding/javascriptSolveRunner";
import { resolveJavascriptSolveStarter } from "@/lib/coding/starterCode";
import {
  APPROVED_CODING_LANGUAGES,
  isAutoExecutedLanguage,
  languageLabel,
  languageOptionLabel,
} from "@/lib/coding/languages";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { cn } from "@/lib/utils";

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

/** Immutable starter contract for javascript_solve assessments (TC-COD-004). */

export default function CodingAssessmentPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const user = useAuthStore((s) => s.user);
  const [question, setQuestion] = useState<Question | null>(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [sample, setSample] = useState<SampleCase[]>([]);
  const [sampleOut, setSampleOut] = useState<string>("");
  const [sampleCases, setSampleCases] = useState<SolveCaseResult[]>([]);
  const [serverResult, setServerResult] = useState<string>("");
  const [submitCases, setSubmitCases] = useState<SolveCaseResult[]>([]);
  const [sampleInfraError, setSampleInfraError] = useState(false);
  const [submitInfraError, setSubmitInfraError] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const loadedQuestionRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!questionId || !user?.id) return;
    const { data } = await supabase
      .from("coding_questions")
      .select("id,title,description,constraints,sample_input,sample_output,starter_code,language,time_limit_ms,max_submissions,evaluation_mode")
      .eq("id", questionId)
      .maybeSingle();
    setQuestion(data as Question | null);
    // Refreshing history after a submit must not wipe the user's draft.
    // Only initialize the editor when the question itself changes.
    if (loadedQuestionRef.current !== questionId) {
      setCode(resolveJavascriptSolveStarter(data?.starter_code as string | undefined));
      loadedQuestionRef.current = questionId;
    }
    const qLang = String(data?.language ?? "javascript").toLowerCase();
    setLanguage(
      (APPROVED_CODING_LANGUAGES as readonly string[]).includes(qLang) ? qLang : "javascript",
    );
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

  const autoScore =
    isAutoExecutedLanguage(language) && question?.evaluation_mode === "javascript_solve";

  async function ensureSession(): Promise<boolean> {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return true;
    toast.error("Your session expired. Please sign in again to submit.");
    return false;
  }

  async function runSample() {
    if (!user?.id || !questionId) return;
    if (!(await ensureSession())) return;
    if (language !== String(question?.language ?? "javascript").toLowerCase()) {
      toast.error(`This problem requires ${question?.language ?? "javascript"}.`);
      return;
    }
    if (!autoScore) {
      setSampleOut("Sample runs are only available for JavaScript solve() assessments. This language is not executed.");
      return;
    }
    setSampleBusy(true);
    setSampleOut("");
    setSampleCases([]);
    setSampleInfraError(false);
    try {
      const result = await fetchEdgeJson<{
        status: string;
        score: number | null;
        passed_tests?: number;
        failed_tests?: number;
        execution_status?: string;
        message?: string;
        blocked_reason?: string;
        primary_error?: string;
        case_results?: SolveCaseResult[];
      }>("score-coding-submission", {
        question_id: questionId,
        code,
        language,
        sample_only: true,
      });
      setSampleOut(
        formatCodingExecutionSummary({
          execution_status: result.execution_status,
          message: result.message,
          blocked_reason: result.blocked_reason,
          primary_error: result.primary_error,
          passed_tests: result.passed_tests,
          failed_tests: result.failed_tests,
          case_results: result.case_results,
        }),
      );
      setSampleCases(result.case_results ?? []);
      setSampleInfraError(isCodingInfrastructureFailure(result.execution_status));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSampleOut("Unauthorized — sign in again, then retry the sample run.");
      } else {
        setSampleOut(error instanceof Error ? error.message : "Sample run unavailable.");
        setSampleInfraError(true);
      }
    } finally {
      setSampleBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (!user?.id || !questionId || left <= 0) {
      toast.error("No submissions remaining.");
      return;
    }
    if (!code.trim()) {
      toast.error("Enter a solution before submitting.");
      return;
    }
    if (!(await ensureSession())) return;
    if (language !== String(question?.language ?? "javascript").toLowerCase()) {
      toast.error(`This problem requires ${question?.language ?? "javascript"}.`);
      return;
    }
    setBusy(true);
    setServerResult("");
    setSubmitCases([]);
    setSubmitInfraError(false);
    try {
      const result = await fetchEdgeJson<{
        status: string;
        score: number | null;
        passed_tests?: number;
        failed_tests?: number;
        execution_status?: string;
        message?: string;
        blocked_reason?: string;
        primary_error?: string;
        case_results?: SolveCaseResult[];
      }>("score-coding-submission", {
        question_id: questionId,
        code,
        language,
      });
      setServerResult(
        formatCodingExecutionSummary({
          execution_status: result.execution_status,
          message:
            result.message ??
            `Status ${result.status}. Score ${result.score ?? "pending"}. Passed ${result.passed_tests ?? "—"}. Failed ${result.failed_tests ?? "—"}.`,
          blocked_reason: result.blocked_reason,
          primary_error: result.primary_error,
          passed_tests: result.passed_tests,
          failed_tests: result.failed_tests,
          case_results: result.case_results,
        }),
      );
      setSubmitCases(result.case_results ?? []);
      setSubmitInfraError(isCodingInfrastructureFailure(result.execution_status));
      // compile_error responses may not persist a submission — still refresh history when scored
      if (result.status !== "compile_error") {
        void load();
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setServerResult("Unauthorized (401) — sign in again, then resubmit.");
        toast.error("Session expired. Please sign in again.");
      } else if (
        error instanceof ApiClientError &&
        (error.status === 429 || error.code === "RATE_LIMITED")
      ) {
        setServerResult("Too many submissions. Wait a moment, then reset and resubmit.");
        toast.error("Rate limited — try again shortly.");
      } else {
        setServerResult(error instanceof Error ? error.message : "Code execution service is temporarily unavailable.");
        setSubmitInfraError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function resetCode() {
    setCode(resolveJavascriptSolveStarter(question?.starter_code));
    setSampleOut("");
    setSampleCases([]);
    setServerResult("");
    setSubmitCases([]);
    setSampleInfraError(false);
    setSubmitInfraError(false);
  }

  return (
    <div
      data-testid="dd-layout-root"
      className={cn(PAGE_SHELL, "flex flex-col gap-4 min-h-[calc(100vh-7.5rem)]")}
    >
      <PageHeader
        title={question?.title ?? "Coding assessment"}
        description="Interview preparation only. JavaScript may be scored on the server; other languages are not executed and are stored for pending review. The browser never evaluates your solution. There is no multi-language sandbox."
        breadcrumbs={[{ label: "Coding", href: "/app/coding" }, { label: question?.title ?? "Problem" }]}
        actions={<span className="text-sm tabular-nums">Timer {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}
        className="mb-0 shrink-0"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
        <div data-testid="coding-problem-panel" className="min-w-0 flex-1 flex">
          <Card className="min-w-0 w-full flex-1 overflow-y-auto">
            <h2 className="font-semibold">Problem</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{question?.description}</p>
            <h3 className="mt-4 text-sm font-semibold">Examples</h3>
            <p className="text-sm">Input: {question?.sample_input}</p>
            <p className="text-sm">Output: {question?.sample_output}</p>
            <h3 className="mt-4 text-sm font-semibold">Constraints</h3>
            <p className="text-sm">{question?.constraints}</p>
            {sample.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {sample.length} visible sample case{sample.length === 1 ? "" : "s"} (hidden cases stay on the server).
              </p>
            )}
          </Card>
        </div>
        <div data-testid="coding-editor-panel" className="min-w-0 flex-1 flex">
          <Card className="min-w-0 w-full flex-1 flex flex-col">
            <div className="flex flex-wrap items-end justify-between gap-3 shrink-0">
              <label className="text-sm font-semibold" htmlFor="code-editor">Code editor</label>
              <div className="flex flex-col items-end gap-1">
                <label className="text-xs text-muted-foreground" htmlFor="coding-language">
                  Language
                </label>
                <select
                  id="coding-language"
                  value={language}
                  disabled
                  aria-disabled="true"
                  title="Language is set by the problem. Only JavaScript is auto-scored."
                  onChange={(e) => setLanguage(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-80"
                >
                  {APPROVED_CODING_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {languageOptionLabel(lang)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground shrink-0">
              {autoScore
                ? "Automated scoring runs JavaScript solve(input) on the server. Your solution must define function solve(input) { ... }. Use Reset code to restore the starter template."
                : `${languageLabel(language)} is not executed — submission is stored for pending review. Only JavaScript is auto-scored.`}
            </p>
            <textarea
              id="code-editor"
              data-testid="coding-editor-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-2 min-h-[min(52vh,28rem)] flex-1 w-full min-w-0 rounded-xl border border-border bg-background p-3 font-mono text-xs"
              spellCheck={false}
            />
            <div className="mt-3 flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" onClick={resetCode}>Reset code</Button>
              <Button variant="outline" onClick={() => void runSample()} loading={sampleBusy} disabled={!autoScore || busy || sampleBusy}>
                Run sample (server)
              </Button>
              <Button onClick={() => void submit()} loading={busy} disabled={busy || sampleBusy || left <= 0 || !question}>Submit assessment</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground shrink-0">{left} submissions remaining</p>
            {sampleOut && (
              <div className="mt-3 shrink-0 space-y-2">
                {sampleInfraError ? (
                  <InlineErrorRetry
                    message={sampleOut}
                    onRetry={() => void runSample()}
                    compact
                  />
                ) : (
                  <pre className="whitespace-pre-wrap rounded-lg bg-secondary/50 p-3 text-xs">
                    Sample results{"\n"}
                    {sampleOut}
                  </pre>
                )}
                <CodingCaseResultsTable cases={sampleCases} data-testid="coding-sample-case-results" />
              </div>
            )}
            {serverResult && (
              <div className="mt-3 shrink-0 space-y-2">
                {submitInfraError ? (
                  <InlineErrorRetry
                    message={serverResult}
                    onRetry={() => void submit()}
                    compact
                  />
                ) : (
                  <pre className="whitespace-pre-wrap rounded-lg bg-secondary/50 p-3 text-xs">
                    Test results{"\n"}
                    {serverResult}
                  </pre>
                )}
                <CodingCaseResultsTable cases={submitCases} data-testid="coding-submit-case-results" />
              </div>
            )}
            <h3 className="mt-4 text-sm font-semibold shrink-0">Submission history</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground shrink-0">
              {history.map((row) => (
                <li key={row.id}>
                  {new Date(row.submitted_at).toLocaleString()} · {row.status} · {row.score ?? "unscored"}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
