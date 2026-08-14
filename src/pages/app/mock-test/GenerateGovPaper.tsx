import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import {
  CREATE_EXAM_PAPER_CREDIT_COST,
  createExamPaper,
  generateTopicPractice,
  getExamSyllabus,
  getPaperGenerationJob,
  searchGovExams,
  type GovExamSearchResult,
  type PaperJobResult,
} from "@/lib/gov-exam/api";
import {
  bankReadinessLabel,
  formatBankCoverage,
} from "@/lib/gov-exam/bankReadiness";
import {
  AI_GENERATED_PAPER_LABEL,
  CUSTOM_PRACTICE_PAPER_LABEL,
  GOV_EXAM_AFFILIATION_DISCLAIMER,
} from "@/lib/gov-exam/disclaimers";
import { flattenSyllabusTopicLabels } from "@/lib/gov-exam/topicFilter";
import { toast } from "sonner";

const STEPS = ["Exam", "Paper basis", "Customize", "Review"] as const;

function paperJobErrorMessage(job: PaperJobResult): string {
  const raw = [job.errorMessage, job.error, job.errorCode].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  ) ?? "Generation failed";
  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(raw)) {
    return "AI question generation is temporarily rate-limited. Wait a minute and try again.";
  }
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}…` : compact;
}

const JOB_STAGES = [
  "analyzing_pattern",
  "planning_blueprint",
  "selecting_questions",
  "generating_questions",
  "validating_questions",
  "checking_similarity",
  "assembling",
  "completed",
] as const;

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  analyzing_pattern: "Analyzing syllabus & pattern",
  planning_blueprint: "Building blueprint",
  selecting_questions: "Selecting reviewed questions",
  generating_questions: "Generating remaining unique questions with AI",
  validating_questions: "Validating answers",
  checking_similarity: "Checking duplicates",
  assembling: "Assembling paper",
  completed: "Final quality check complete",
  failed: "Failed",
};

export default function GenerateGovPaper(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [exams, setExams] = useState<GovExamSearchResult[]>([]);
  const [examId, setExamId] = useState(params.get("examId") ?? "");
  const [stageId, setStageId] = useState(params.get("stageId") ?? "");
  const [basis, setBasis] = useState<
    "latest_pattern" | "topic" | "quick" | "full_sim"
  >((params.get("basis") as "latest_pattern" | "topic" | "quick" | "full_sim") || "quick");
  const [language, setLanguage] = useState("en");
  const [questionCount, setQuestionCount] = useState(25);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [topicChoices, setTopicChoices] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState(params.get("topics") ?? "");
  const [difficulty, setDifficulty] = useState<"" | "EASY" | "MEDIUM" | "HARD">("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<PaperJobResult | null>(null);

  const selected = useMemo(
    () => exams.find((e) => e.examId === examId) ?? null,
    [exams, examId],
  );

  const bank = selected?.bankReadiness ?? null;
  const fullSimAvailable = bank?.fullSimulationAvailable === true;
  const bankCoverageLabel = bank
    ? formatBankCoverage(bank.approvedPublicCount, bank.requiredQuestions)
    : null;

  useEffect(() => {
    void searchGovExams({ q: "" })
      .then((d) => {
        setExams(d.results);
        if (!examId && d.results[0]) {
          const preferred =
            d.results.find((r) => r.family !== "state_psc" && r.code !== "APPSC_GROUP2") ??
            d.results[0];
          setExamId(preferred.examId);
          setStageId(preferred.stage?.id ?? preferred.stages[0]?.id ?? "");
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Search failed"));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const st = selected.stage ?? selected.stages[0];
    if (st && !stageId) setStageId(st.id);
    if (selected.pattern && basis === "full_sim") {
      setQuestionCount(selected.pattern.totalQuestions);
      setDurationMinutes(selected.pattern.durationMinutes);
    }
    if (basis === "topic" && questionCount > 100) {
      setQuestionCount(20);
    }
  }, [selected, basis]);

  useEffect(() => {
    if (basis !== "topic" || !examId || !stageId) return;
    let cancelled = false;
    void getExamSyllabus({ examId, stageId })
      .then((res) => {
        if (cancelled) return;
        const labels = flattenSyllabusTopicLabels(res.syllabus.topicsJson);
        setTopicChoices(labels);
        // Prefer URL topics / user picks; only seed defaults when nothing selected yet.
        setSelectedTopics((prev) => (prev.length || topicDraft.trim() ? prev : labels.slice(0, 3)));
      })
      .catch(() => {
        if (!cancelled) setTopicChoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [basis, examId, stageId]);

  const mode =
    basis === "full_sim"
      ? ("generated_mock" as const)
      : ("custom_mock" as const);

  const resolvedTopics = useMemo(() => {
    const fromDraft = topicDraft
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    return [...new Set([...selectedTopics, ...fromDraft])].slice(0, 20);
  }, [selectedTopics, topicDraft]);

  async function handleGenerate() {
    if (!examId || !stageId) {
      toast.error("Select an exam and stage");
      return;
    }
    if (basis === "topic" && resolvedTopics.length === 0) {
      toast.error("Select or enter at least one topic");
      return;
    }
    setBusy(true);
    setJob(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      if (basis === "topic") {
        const result = await generateTopicPractice({
          examId,
          stageId,
          topics: resolvedTopics,
          questionCount: Math.min(100, Math.max(5, questionCount)),
          language,
          difficulty: difficulty || null,
          idempotencyKey,
        });
        setJob(result);
        if (result.status === "failed" || !result.mockTestId) {
          toast.error(paperJobErrorMessage(result));
          return;
        }
        toast.success(
          result.shrunk
            ? `Custom Practice Set ready (${result.questionCount} questions)`
            : "Topic practice set ready",
        );
        navigate(`/app/mock-test/session/${result.mockTestId}`);
        return;
      }

      const result = await createExamPaper({
        examId,
        stageId,
        mode,
        language,
        sourceYears: [2024, 2023, 2022],
        questionCount: mode === "custom_mock" ? questionCount : undefined,
        durationMinutes: mode === "custom_mock" ? durationMinutes : undefined,
        idempotencyKey,
      });
      setJob(result);

      if (result.status === "failed") {
        toast.error(paperJobErrorMessage(result));
        return;
      }

      let current = result;
      let polls = 0;
      const maxPolls = 120;
      while (
        current.status !== "completed" &&
        current.status !== "failed" &&
        current.status !== "cancelled" &&
        polls < maxPolls
      ) {
        await new Promise((r) => setTimeout(r, 1500));
        current = await getPaperGenerationJob(result.jobId);
        setJob(current);
        polls += 1;
      }

      if (current.status === "completed" && current.mockTestId) {
        const expected =
          basis === "full_sim" ? selected?.pattern?.totalQuestions : questionCount;
        const actual = current.questionCount;
        const short =
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual < expected;
        const custom = current.paperClass === "custom_practice" || (basis !== "full_sim" && short);
        if (basis === "full_sim" && short) {
          toast.error(
            `Full mock needs ${expected} questions but only ${actual ?? 0} were assembled. Try a Custom Practice Set.`,
          );
          return;
        }
        toast.success(
          custom
            ? `Custom Practice Set ready (${actual ?? "available"} questions)`
            : actual
              ? `Practice paper ready (${actual} questions)`
              : "Practice paper ready",
        );
        navigate(`/app/mock-test/session/${current.mockTestId}`);
      } else if (current.status === "failed") {
        toast.error(paperJobErrorMessage(current));
      } else {
        toast.message(
          "Still generating unique questions on the server. This can take a few minutes when the bank is short — refresh Mock Tests shortly.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const currentStageIdx = job?.progressStage
    ? JOB_STAGES.indexOf(job.progressStage as (typeof JOB_STAGES)[number])
    : -1;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Generate practice paper"
        description="Pattern-based assembly from the approved registry — not an official or leaked paper."
        breadcrumbs={[
          { label: "Mock Tests", href: "/app/mock-test" },
          { label: "Generate" },
        ]}
      />

      <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2">
        {GOV_EXAM_AFFILIATION_DISCLAIMER}
      </p>

      <ol className="flex flex-wrap gap-2" aria-label="Generation steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${
              i === step
                ? "border-primary bg-primary/10 text-primary"
                : i < step
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-border text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
        <div className="space-y-4 rounded-2xl border border-border p-5">
          {step === 0 && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Select exam</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={examId}
                onChange={(e) => {
                  setExamId(e.target.value);
                  const ex = exams.find((x) => x.examId === e.target.value);
                  setStageId(ex?.stage?.id ?? ex?.stages[0]?.id ?? "");
                }}
              >
                {exams.map((e) => (
                  <option key={e.examId} value={e.examId}>
                    {e.name} ({e.recruitingBody?.code})
                  </option>
                ))}
              </select>
              {selected?.lastVerified && (
                <p className="text-xs text-muted-foreground">
                  Last verified pattern effective: {selected.lastVerified}
                </p>
              )}
              {bank && (
                <p
                  className={`text-xs ${
                    fullSimAvailable
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {bankCoverageLabel} · {bankReadinessLabel(bank.status)}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">Paper basis</legend>
              {[
                { id: "latest_pattern" as const, label: "Latest official pattern (practice size)" },
                { id: "quick" as const, label: "Quick practice (25 Q)" },
                {
                  id: "topic" as const,
                  label: "Topic-focused (Custom Practice Set from bank topics)",
                },
                {
                  id: "full_sim" as const,
                  label: "Full exam simulation (exact pattern count)",
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/30"
                >
                  <input
                    type="radio"
                    name="basis"
                    checked={basis === opt.id}
                    onChange={() => {
                      setBasis(opt.id);
                      if (opt.id === "quick") {
                        setQuestionCount(25);
                        setDurationMinutes(30);
                      }
                      if (opt.id === "topic") {
                        setQuestionCount(20);
                        setDurationMinutes(25);
                      }
                      if (opt.id === "full_sim" && selected?.pattern) {
                        setQuestionCount(selected.pattern.totalQuestions);
                        setDurationMinutes(selected.pattern.durationMinutes);
                      }
                    }}
                  />
                  <span>
                    {opt.label}
                    {opt.id === "full_sim" && bank && (
                      <span className="block text-xs text-muted-foreground">
                        {bankCoverageLabel}
                        {!fullSimAvailable
                          ? " — bank is short; remaining unique questions will be generated with AI (takes a few minutes)"
                          : ""}
                      </span>
                    )}
                  </span>
                </label>
              ))}
              {basis === "topic" && (
                <p className="text-xs text-muted-foreground">
                  Topic practice uses verified bank items first. If coverage is short, unique
                  AI-generated MCQs fill the rest — this can take a minute. Not an official paper.
                </p>
              )}
              {basis === "full_sim" && (
                <p className="text-xs text-muted-foreground">
                  Uses the exact pattern count. Unique bank questions are used first; remaining
                  slots are generated with AI and deduplicated. Not an official or leaked paper.
                </p>
              )}
              {!fullSimAvailable && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Approved bank coverage is {bankCoverageLabel ?? "unknown"}. Generation will take
                  longer while AI fills unique remaining questions for this exam.
                </p>
              )}
            </fieldset>
          )}

          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm space-y-1">
                <span className="font-medium">Language</span>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="font-medium">Questions</span>
                <input
                  type="number"
                  min={5}
                  max={basis === "topic" ? 100 : (selected?.pattern?.totalQuestions ?? 200)}
                  disabled={basis === "full_sim"}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                />
              </label>
              {basis !== "topic" && (
                <label className="text-sm space-y-1">
                  <span className="font-medium">Duration (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    max={360}
                    disabled={basis === "full_sim"}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  />
                </label>
              )}
              {basis === "topic" && (
                <>
                  <label className="text-sm space-y-1">
                    <span className="font-medium">Difficulty (optional)</span>
                    <select
                      className="w-full rounded-lg border border-border bg-background px-3 py-2"
                      value={difficulty}
                      onChange={(e) =>
                        setDifficulty(e.target.value as "" | "EASY" | "MEDIUM" | "HARD")
                      }
                    >
                      <option value="">Any</option>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </label>
                  <div className="sm:col-span-2 space-y-2">
                    <p className="text-sm font-medium">Topics</p>
                    {topicChoices.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {topicChoices.map((t) => {
                          const on = selectedTopics.includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() =>
                                setSelectedTopics((prev) =>
                                  on ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 20),
                                )
                              }
                              className={`rounded-md border px-2 py-1 text-xs ${
                                on
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted/40"
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <label className="text-sm space-y-1 block">
                      <span className="text-muted-foreground text-xs">
                        Or type topics (comma-separated)
                      </span>
                      <input
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={topicDraft}
                        onChange={(e) => setTopicDraft(e.target.value)}
                        placeholder="e.g. algebra, syllogism, polity"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Selected: {resolvedTopics.length ? resolvedTopics.join(", ") : "none"}
                    </p>
                  </div>
                </>
              )}
              {(mode === "custom_mock" || basis === "topic") && (
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Custom / topic sets are labeled “Custom Practice Set”, not a full exam simulation.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Exam</dt>
                <dd>{selected?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Stage</dt>
                <dd>{selected?.stage?.name ?? selected?.stages[0]?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Pattern</dt>
                <dd>{selected?.pattern?.version ?? "—"}</dd>
                <dt className="text-muted-foreground">Mode</dt>
                <dd>
                  {basis === "topic"
                    ? "Topic-focused Custom Practice Set"
                    : mode === "generated_mock"
                      ? "Full pattern simulation"
                      : "Custom practice"}
                </dd>
                <dt className="text-muted-foreground">Questions</dt>
                <dd>{basis === "full_sim" ? selected?.pattern?.totalQuestions : questionCount}</dd>
                {basis === "topic" && (
                  <>
                    <dt className="text-muted-foreground">Topics</dt>
                    <dd className="truncate">{resolvedTopics.join(", ") || "—"}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Bank coverage</dt>
                <dd>{bankCoverageLabel ?? "—"}</dd>
                <dt className="text-muted-foreground">Credits</dt>
                <dd>{CREATE_EXAM_PAPER_CREDIT_COST}</dd>
                <dt className="text-muted-foreground">Quality checks</dt>
                <dd>
                  {basis === "topic"
                    ? "Topic/subject match · uniqueness · bank approval"
                    : "Blueprint · uniqueness · bank + AI fill"}
                </dd>
              </dl>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {basis === "topic" ? CUSTOM_PRACTICE_PAPER_LABEL : AI_GENERATED_PAPER_LABEL}
              </p>

              {busy && job && (
                <ul className="space-y-1.5 mt-4" aria-live="polite">
                  {JOB_STAGES.map((s, i) => {
                    const done = currentStageIdx > i || job.status === "completed";
                    const active = job.progressStage === s || (job.status === s);
                    return (
                      <li key={s} className="flex items-center gap-2 text-xs">
                        {done ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : active ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-border" />
                        )}
                        {STAGE_LABEL[s] ?? s}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => Math.min(3, s + 1))} disabled={!examId}>
                Continue
              </Button>
            ) : (
              <Button
                onClick={() => void handleGenerate()}
                disabled={busy || !stageId}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate Practice Paper"
                )}
              </Button>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-border p-4 h-fit space-y-2 text-xs text-muted-foreground sticky top-4">
          <p className="font-medium text-foreground text-sm">Live summary</p>
          <p>{selected?.name ?? "No exam selected"}</p>
          <p>Pattern: {selected?.pattern?.version ?? "—"}</p>
          <p>
            Negative mark: {selected?.pattern?.negativeMark ?? "—"}
          </p>
          <p>Est. credits: {CREATE_EXAM_PAPER_CREDIT_COST}</p>
          <p>Bank: {bankCoverageLabel ?? "—"}</p>
          <p className="pt-2 border-t border-border">
            Official / AI label set from paper class after assembly.
          </p>
        </aside>
      </div>
    </div>
  );
}
