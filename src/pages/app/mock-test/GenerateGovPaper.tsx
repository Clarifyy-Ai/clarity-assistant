import { useEffect, useMemo, useRef, useState } from "react";
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
  isSearchUnavailableError,
  type GovExamSearchResult,
  type PaperJobResult,
} from "@/lib/gov-exam/api";
import {
  bankReadinessLabel,
  formatBankCoverage,
} from "@/lib/gov-exam/bankReadiness";
import {
  customPracticeSetLabel,
  decideQuestionInventory,
  formatInventoryCoverage,
  generateButtonLabel,
  generationSourceSummary,
} from "@/lib/gov-exam/questionInventoryPolicy";
import { planRank } from "@/lib/billing/planCatalog";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";
import { ApiClientError } from "@/lib/api/apiClient";
import { useAuthStore } from "@/store/userStore";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";
import { fetchSpendableCredits } from "@/lib/billing/fetchSpendableCredits";
import {
  AI_GENERATED_PAPER_LABEL,
  CUSTOM_PRACTICE_PAPER_LABEL,
  GOV_EXAM_AFFILIATION_DISCLAIMER,
} from "@/lib/gov-exam/disclaimers";
import { flattenSyllabusTopicLabels } from "@/lib/gov-exam/topicFilter";
import { toast } from "sonner";

const STEPS = ["Exam", "Paper basis", "Customize", "Review"] as const;

function paperJobErrorMessage(job: PaperJobResult): string {
  return formatGovExamOperationError({
    error: job.errorMessage ?? job.error ?? "Generation failed",
    code: job.errorCode ?? "",
    available: job.available,
    requested: job.requested ?? job.required,
    required: job.required,
    balance: job.balance,
    cost: job.creditsCharged,
  });
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
  const generatingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const profile = useAuthStore((s) => s.profile);
  const storeCredits = useAuthStore((s) => (s as { credits?: number }).credits);
  const isProfileLoaded = useAuthStore((s) => (s as { isProfileLoaded?: boolean }).isProfileLoaded);
  const creditBalance = resolveCreditBalance({
    isProfileLoaded,
    profileCredits: profile?.credits,
    storeCredits,
  });
  const [serverCredits, setServerCredits] = useState<number | null>(null);

  useEffect(() => {
    const userId = profile?.id;
    if (!userId) return;
    let cancelled = false;
    void fetchSpendableCredits(userId).then((balance) => {
      if (!cancelled && balance != null) setServerCredits(balance);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const displayCredits = serverCredits ?? (creditBalance.known ? creditBalance.balance : null);

  const selected = useMemo(
    () => exams.find((e) => e.examId === examId) ?? null,
    [exams, examId],
  );

  const bank = selected?.bankReadiness ?? null;
  const fullSimAvailable = bank?.fullSimulationAvailable === true;
  const bankCoverageLabel = bank
    ? formatBankCoverage(bank.approvedPublicCount, bank.requiredQuestions)
    : null;
  const requestedForConfig =
    basis === "full_sim"
      ? selected?.pattern?.totalQuestions ?? questionCount
      : questionCount;
  // AI generation of missing questions is a Pro-and-above capability (rank >= 2).
  // The server re-checks this; the flag only decides what the UI may offer.
  const aiFillAvailable = planRank(profile?.plan_id) >= 2;
  const inventory = decideQuestionInventory({
    available: bank?.approvedPublicCount ?? 0,
    requested: requestedForConfig,
    aiFillAvailable,
  });

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
      .catch((e) =>
        toast.error(
          isSearchUnavailableError(e)
            ? "Exam search is temporarily unavailable. Please try again."
            : e instanceof Error
              ? e.message
              : "Search failed",
        ),
      );
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

  async function handleGenerate(overrideCount?: number) {
    if (!examId || !stageId) {
      toast.error("Select an exam and stage");
      return;
    }
    if (generatingRef.current) return;
    if (basis === "topic" && resolvedTopics.length === 0) {
      toast.error("Select or enter at least one topic");
      return;
    }
    const requested = overrideCount ?? requestedForConfig;
    const liveInventory = decideQuestionInventory({
      available: bank?.approvedPublicCount ?? 0,
      requested,
      aiFillAvailable,
    });
    if (!liveInventory.canGenerateRequested) {
      toast.error(
        `Only ${liveInventory.available} approved questions are currently available for this configuration.`,
      );
      return;
    }
    generatingRef.current = true;
    setBusy(true);
    setJob(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = idempotencyKeyRef.current;
    try {
      if (basis === "topic") {
        const result = await generateTopicPractice({
          examId,
          stageId,
          topics: resolvedTopics,
          questionCount: Math.min(100, Math.max(5, requested)),
          language,
          difficulty: difficulty || null,
          idempotencyKey,
        });
        setJob(result);
        if (result.status === "failed" || !result.mockTestId) {
          idempotencyKeyRef.current = null;
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
        mode: overrideCount != null ? "custom_mock" : mode,
        language,
        sourceYears: [2024, 2023, 2022],
        questionCount:
          overrideCount != null || mode === "custom_mock" ? requested : undefined,
        durationMinutes:
          overrideCount != null || mode === "custom_mock" ? durationMinutes : undefined,
        idempotencyKey,
      });
      setJob(result);

      if (result.status === "failed") {
        idempotencyKeyRef.current = null;
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
        idempotencyKeyRef.current = null;
        toast.error(paperJobErrorMessage(current));
      } else {
        toast.message(
          "Paper generation is still running on the server. Open Mock Tests in a moment to start the attempt.",
        );
      }
    } catch (e) {
      if (e instanceof ApiClientError) {
        idempotencyKeyRef.current = null;
      }
      toast.error(formatGovExamOperationError(e));
    } finally {
      generatingRef.current = false;
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
                          ? aiFillAvailable
                            ? " — bank is short; the remaining questions are generated by AI to the official blueprint"
                            : " — bank is short; a full paper needs AI generation, available on Pro and above"
                          : ""}
                      </span>
                    )}
                  </span>
                </label>
              ))}
              {basis === "topic" && (
                <p className="text-xs text-muted-foreground">
                  Topic practice uses verified bank items only. If coverage is short, generate a
                  smaller Custom Practice Set — we do not invent missing questions. Not an official paper.
                </p>
              )}
              {basis === "full_sim" && (
                <p className="text-xs text-muted-foreground">
                  Builds the exact pattern count: approved bank items first, then AI-generated
                  questions written to the approved syllabus and blueprint. Not an official or
                  leaked paper.
                </p>
              )}
              {!fullSimAvailable && !aiFillAvailable && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Approved bank coverage is {bankCoverageLabel ?? "unknown"}. Generating the
                  remaining questions requires a Pro plan, or you can build a smaller Custom
                  Practice Set from the approved bank.
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
                <dd>{requestedForConfig}</dd>
                <dt className="text-muted-foreground">Approved inventory</dt>
                <dd>{formatInventoryCoverage(inventory.available, requestedForConfig)}</dd>
                <dt className="text-muted-foreground">Question sources</dt>
                <dd>{generationSourceSummary(inventory)}</dd>
                {basis === "topic" && (
                  <>
                    <dt className="text-muted-foreground">Topics</dt>
                    <dd className="truncate">{resolvedTopics.join(", ") || "—"}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Your credits</dt>
                <dd>{displayCredits ?? "…"}</dd>
                <dt className="text-muted-foreground">Operation cost</dt>
                <dd>{CREATE_EXAM_PAPER_CREDIT_COST}</dd>
                <dt className="text-muted-foreground">Quality checks</dt>
                <dd>
                  {basis === "topic"
                    ? "Topic/subject match · uniqueness · bank approval"
                    : "Blueprint · uniqueness · approved bank inventory"}
                </dd>
              </dl>
              {inventory.reason === "ai_fill" && (
                <p className="text-sm text-muted-foreground">
                  {inventory.available} approved questions are available, so{" "}
                  {inventory.aiQuestions} will be generated by AI against the approved syllabus,
                  section weights and marking scheme. Every generated question is validated for a
                  single correct answer and checked against the rest of the paper for duplicates.
                </p>
              )}
              {(inventory.reason === "short" || inventory.reason === "empty") && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Only {inventory.available} approved questions are currently available for this
                  configuration.
                </p>
              )}

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
            ) : inventory.canGenerateRequested ? (
              <Button
                onClick={() => void handleGenerate()}
                disabled={busy || !stageId}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : basis === "full_sim" ? (
                  generateButtonLabel(inventory)
                ) : (
                  "Generate Practice Paper"
                )}
              </Button>
            ) : (
              <Button
                onClick={() => void handleGenerate(inventory.customPracticeMax)}
                disabled={busy || !stageId || inventory.customPracticeMax < 5}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  customPracticeSetLabel(inventory.customPracticeMax)
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
          <p>Your credits: {displayCredits ?? "…"}</p>
          <p>Bank: {formatInventoryCoverage(inventory.available, requestedForConfig)}</p>
          {inventory.mode === "ai_assisted" && (
            <p>AI-generated: {inventory.aiQuestions} questions</p>
          )}
          <p className="pt-2 border-t border-border">
            Official / AI label set from paper class after assembly.
          </p>
        </aside>
      </div>
    </div>
  );
}
