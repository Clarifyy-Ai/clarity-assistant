import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ExamSearchCombobox } from "@/components/gov-exam/ExamSearchCombobox";
import { GovPaperReviewGenerationTimer } from "@/components/gov-exam/GovPaperReviewGenerationTimer";
import {
  CREATE_EXAM_PAPER_CREDIT_COST,
  cancelPaperGenerationJob,
  checkExamPaperAvailability,
  createExamPaper,
  generateTopicPractice,
  getExamPattern,
  getExamSyllabus,
  getPaperGenerationJob,
  processPaperGenerationJob,
  requestGovExam,
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
  inventoryAvailabilityMessage,
} from "@/lib/gov-exam/questionInventoryPolicy";
import {
  generatorLabel,
  pickPaperGeneratorPreference,
} from "@/lib/gov-exam/generatorRouting";
import { planRank } from "@/lib/billing/planCatalog";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";
import { ApiClientError } from "@/lib/api/apiClient";
import { debugLog161d95 } from "@/lib/debug/debugLog161d95";
import { debugLog4a9592 } from "@/lib/debug/debugLog4a9592";
import { useAuthStore } from "@/store/userStore";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";
import { fetchSpendableCredits } from "@/lib/billing/fetchSpendableCredits";
import { evaluateGovExamCreditGate } from "@/lib/gov-exam/govExamCreditGate";
import { openUpgradeIfInsufficientCredits } from "@/lib/network/aiErrorUx";
import {
  GOV_EXAM_AFFILIATION_DISCLAIMER,
} from "@/lib/gov-exam/disclaimers";
import { flattenSyllabusTopicLabels } from "@/lib/gov-exam/topicFilter";
import {
  PAPER_JOB_UI_LABEL,
  PAPER_JOB_UI_STATES,
  clearActivePaperJob,
  clearPaperJobPollTimedOut,
  isPaperJobPollTimedOut,
  isPaperJobPollTimeoutError,
  isPaperJobTerminal,
  loadActivePaperJob,
  mapPaperJobPublicStatus,
  mapProgressToUiState,
  mapProgressToUserStage,
  markPaperJobPollTimedOut,
  saveActivePaperJob,
} from "@/lib/gov-exam/paperJobStatus";
import { pollPaperJobUntilTerminal } from "@/lib/gov-exam/pollPaperJob";
import {
  availabilityRequestKey,
  availabilityResult,
  beginAvailabilityCheck,
  beginGenerationSession,
  completeAvailabilityCheck,
  completeGenerationSession,
  failAvailabilityCheck,
  failGenerationSession,
  initialAvailabilitySession,
  initialGenerationSession,
  resetAvailabilitySession,
  resetGenerationSession,
  type GovPaperAvailabilitySession,
  type GovPaperGenerationSession,
} from "@/lib/gov-exam/govPaperReviewSession";
import {
  parseGovQuestionCount,
  syncQuestionCountForBasis,
  isGovExactPatternBasis,
  GOV_QUESTION_COUNT_ABS_MAX,
  GOV_QUESTION_COUNT_MIN,
} from "@/lib/gov-exam/questionCount";
import { toast } from "sonner";

const STEPS = ["Exam", "Paper basis", "Customize", "Review"] as const;

const QUESTION_COUNT_MIN = GOV_QUESTION_COUNT_MIN;
const QUESTION_COUNT_ABS_MAX = GOV_QUESTION_COUNT_ABS_MAX;

const DURATION_MIN = 5;
const DURATION_MAX = 360;

function clampDurationMinutes(raw: unknown): number {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || /[eE.+-]/.test(trimmed)) return DURATION_MIN;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return DURATION_MIN;
    return Math.min(Math.max(DURATION_MIN, n), DURATION_MAX);
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return DURATION_MIN;
  return Math.min(Math.max(DURATION_MIN, Math.floor(n)), DURATION_MAX);
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  bn: "Bengali",
  gu: "Gujarati",
  pa: "Punjabi",
  or: "Odia",
  ur: "Urdu",
};

function languageOptionLabel(code: string): string {
  const key = code.trim().toLowerCase();
  return LANGUAGE_LABELS[key] ?? code.toUpperCase();
}

function paperJobErrorMessage(job: PaperJobResult): string {
  return formatGovExamOperationError({
    error: job.errorMessage ?? job.error ?? "We couldn't generate this paper. Try again.",
    code: job.errorCode ?? "",
    available: job.available,
    requested: job.requested ?? job.required,
    required: job.required,
    balance: job.balance,
    cost: job.creditsCharged,
  });
}

function rememberPollTimeoutIfNeeded(job: PaperJobResult): void {
  if (!job.jobId) return;
  if (isPaperJobPollTimeoutError(job) || job.errorCode === "GENERATION_POLL_TIMEOUT") {
    markPaperJobPollTimedOut(job.jobId);
  }
}

function examCategoryLabel(exam: GovExamSearchResult): string | null {
  return exam.stateCode?.trim() || exam.jurisdiction?.trim() || exam.family?.trim() || null;
}

function examVerificationLabel(exam: GovExamSearchResult): string | null {
  const raw = exam.verifiedAt ?? exam.lastVerified;
  if (!raw) return null;
  return String(raw).slice(0, 10) || null;
}

type PaperBasis =
  | "latest_pattern"
  | "topic"
  | "quick"
  | "full_sim"
  | "official_previous"
  | "hybrid";

const PAPER_BASIS_VALUES: readonly PaperBasis[] = [
  "latest_pattern",
  "topic",
  "quick",
  "full_sim",
  "official_previous",
  "hybrid",
];

function parsePaperBasis(raw: string | null): PaperBasis {
  if (raw && (PAPER_BASIS_VALUES as readonly string[]).includes(raw)) {
    return raw as PaperBasis;
  }
  return "quick";
}

function isExactPatternBasis(basis: PaperBasis): boolean {
  return isGovExactPatternBasis(basis);
}

function modeFromBasis(
  basis: PaperBasis,
): "official_previous" | "generated_mock" | "custom_mock" {
  if (basis === "official_previous") return "official_previous";
  if (basis === "full_sim" || basis === "hybrid") return "generated_mock";
  return "custom_mock";
}

export default function GenerateGovPaper(): React.ReactElement {
  const [params] = useSearchParams();
  const urlJobId = params.get("jobId");
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedExam, setSelectedExam] = useState<GovExamSearchResult | null>(null);
  const [examId, setExamId] = useState(params.get("examId") ?? "");
  const [stageId, setStageId] = useState(params.get("stageId") ?? "");
  const [basis, setBasis] = useState<PaperBasis>(parsePaperBasis(params.get("basis")));
  const [language, setLanguage] = useState("en");
  const [questionCount, setQuestionCount] = useState(25);
  const [questionCountInput, setQuestionCountInput] = useState("25");
  const [questionCountError, setQuestionCountError] = useState<string | null>(null);
  const [patternLoadError, setPatternLoadError] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [topicChoices, setTopicChoices] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState(params.get("topics") ?? "");
  const [difficulty, setDifficulty] = useState<"" | "EASY" | "MEDIUM" | "HARD">("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<PaperJobResult | null>(null);
  const [availabilitySession, setAvailabilitySession] =
    useState<GovPaperAvailabilitySession>(initialAvailabilitySession);
  const [generationSession, setGenerationSession] =
    useState<GovPaperGenerationSession>(initialGenerationSession);
  const serverAvailability = availabilityResult(availabilitySession);
  const pollAbortRef = useRef(false);
  const generatingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
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
  const creditsKnown = displayCredits != null;
  const creditGate = useMemo(
    () =>
      evaluateGovExamCreditGate({
        balance: displayCredits,
        balanceKnown: creditsKnown,
        cost: CREATE_EXAM_PAPER_CREDIT_COST,
      }),
    [displayCredits, creditsKnown],
  );
  const insufficientCredits =
    creditGate.allowed === false && creditGate.reason === "insufficient";

  const selected = selectedExam;

  const bank = selected?.bankReadiness ?? null;
  const fullSimAvailable = bank?.fullSimulationAvailable === true;
  const bankCoverageLabel = bank
    ? formatBankCoverage(bank.approvedPublicCount, bank.requiredQuestions)
    : null;
  const questionCountMax =
    basis === "topic"
      ? QUESTION_COUNT_ABS_MAX
      : Math.min(
          QUESTION_COUNT_ABS_MAX,
          selected?.pattern?.totalQuestions ?? QUESTION_COUNT_ABS_MAX,
        );
  const parsedQuestionCount = useMemo(
    () => parseGovQuestionCount(questionCountInput, questionCountMax),
    [questionCountInput, questionCountMax],
  );
  const requestedForConfig =
    isExactPatternBasis(basis)
      ? selected?.pattern?.totalQuestions ?? questionCount
      : parsedQuestionCount.valid
        ? parsedQuestionCount.value
        : questionCount;
  // AI generation of missing questions is a Pro-and-above capability (rank >= 2).
  // Short banks fail closed to Custom Practice — never unlock Full Mock via
  // fragile Python/hybrid heuristics (P0-02 inventory honesty).
  const aiFillAvailable = planRank(profile?.plan_id) >= 2;
  const inventoryAvailable =
    serverAvailability?.available ?? bank?.approvedPublicCount ?? 0;
  const effectiveAiFill =
    serverAvailability?.aiFillAllowed ?? aiFillAvailable;
  const inventory = decideQuestionInventory({
    available: inventoryAvailable,
    requested: requestedForConfig,
    aiFillAvailable: effectiveAiFill,
  });
  const customPracticeMax =
    serverAvailability?.customPracticeMax ?? inventory.customPracticeMax;
  // Full Mock only when bank covers OR AI fill is explicitly allowed.
  // Do not trust generationPlan.kind === hybrid_deterministic alone.
  const fullMockAllowedByServer =
    serverAvailability == null
      ? fullSimAvailable || aiFillAvailable
      : !serverAvailability.blocked &&
        (serverAvailability.available >= serverAvailability.requested ||
          serverAvailability.aiFillAllowed === true);
  const canGenerateRequested =
    inventory.canGenerateRequested &&
    (!isExactPatternBasis(basis) || fullMockAllowedByServer);
  const fullSimSelectable =
    fullSimAvailable || effectiveAiFill || fullMockAllowedByServer;

  function applyQuestionCountForBasis(
    nextBasis: PaperBasis,
    patternTotal: number | null | undefined,
    currentInput: string,
  ) {
    const next = syncQuestionCountForBasis(nextBasis, patternTotal, currentInput);
    setQuestionCount(next.count);
    setQuestionCountInput(next.input);
    if (next.input === String(next.count)) {
      setQuestionCountError(null);
    }
  }

  // Deep-link / stale selection: never keep Full Mock selected when inventory blocks it.
  useEffect(() => {
    if (basis === "full_sim" && !fullSimSelectable) {
      setBasis("latest_pattern");
      applyQuestionCountForBasis(
        "latest_pattern",
        selected?.pattern?.totalQuestions,
        questionCountInput,
      );
    }
    // Sync on basis/inventory only — not on every keystroke in the count field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, fullSimSelectable]);

  const showInventoryShortage =
    inventory.reason === "short" ||
    inventory.reason === "empty" ||
    (serverAvailability != null &&
      serverAvailability.available < serverAvailability.requested &&
      !serverAvailability.aiFillAllowed);
  const languageOptions =
    (serverAvailability?.pattern?.languages?.length
      ? serverAvailability.pattern.languages
      : null) ??
    (selected?.languages?.length ? selected.languages : null) ??
    ["en"];

  function syncJobIdInUrl(jobId: string | null) {
    const next = new URLSearchParams(params);
    if (jobId) next.set("jobId", jobId);
    else next.delete("jobId");
    const search = next.toString();
    navigate(
      { pathname: "/app/mock-test/generate", search: search ? `?${search}` : "" },
      { replace: true },
    );
  }

  function applyExamSelection(exam: GovExamSearchResult) {
    setSelectedExam(exam);
    setExamId(exam.examId);
    setStageId(exam.stage?.id ?? exam.stages[0]?.id ?? "");
    setLanguage(exam.languages?.[0] ?? "en");
    setAvailabilitySession(resetAvailabilitySession());
    setSelectedTopics([]);
    setTopicChoices([]);
    setTopicDraft("");
    setDifficulty("");
    if (exam.pattern) {
      if (basis === "full_sim") {
        setQuestionCount(exam.pattern.totalQuestions);
        setDurationMinutes(exam.pattern.durationMinutes);
      }
    }
  }

  function clearExamSelection() {
    setSelectedExam(null);
    setExamId("");
    setStageId("");
    setAvailabilitySession(resetAvailabilitySession());
    setSelectedTopics([]);
    setTopicChoices([]);
    setTopicDraft("");
    setDifficulty("");
  }

  // Hydrate selection from deep-link: prefer getExamDetails for truthful bankReadiness.
  // Hub chips pass `code` only; TestConfigure / search pass examId (+ optional stageId).
  useEffect(() => {
    const linkedExamId = params.get("examId");
    const linkedStageId = params.get("stageId");
    const linkedCode = params.get("code")?.trim() ?? "";
    if ((!linkedExamId && !linkedCode) || selectedExam) return;
    let cancelled = false;

    function mapDetailsToSearchResult(
      details: Awaited<ReturnType<typeof import("@/lib/gov-exam/api").getExamDetails>>,
    ): GovExamSearchResult {
      return {
        resultType: "official_exam",
        examId: details.exam.examId,
        code: details.exam.code,
        name: details.exam.name,
        shortName: details.exam.shortName ?? null,
        family: details.exam.family,
        stateCode: details.exam.stateCode ?? null,
        jurisdiction: details.exam.jurisdiction ?? null,
        description: details.exam.description,
        legacyExamType: details.exam.legacyExamType,
        recruitingBody: details.body
          ? {
              id: details.body.id,
              code: details.body.code,
              name: details.body.name,
              officialUrl: details.body.officialUrl,
            }
          : null,
        aliases: details.exam.aliases ?? [],
        stages: (details.stages ?? []).map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          sort_order: s.sort_order ?? 0,
        })),
        stage: details.primaryStage
          ? {
              id: details.primaryStage.id,
              code: details.primaryStage.code,
              name: details.primaryStage.name,
              sort_order: details.primaryStage.sort_order ?? 0,
            }
          : details.stages?.[0],
        pattern: details.activePatternSummary
          ? {
              version: details.activePatternSummary.version,
              totalQuestions: details.activePatternSummary.totalQuestions,
              totalMarks: details.activePatternSummary.totalMarks,
              durationMinutes: details.activePatternSummary.durationMinutes,
              negativeMark: details.activePatternSummary.negativeMark,
              sourceUrl: details.activePatternSummary.sourceUrl,
            }
          : null,
        languages: details.languages?.length ? details.languages : ["en"],
        lastVerified: details.activePatternSummary?.effectiveDate ?? null,
        verifiedAt:
          details.exam.verifiedAt ?? details.activePatternSummary?.effectiveDate ?? null,
        bankReadiness: details.bankReadiness ?? null,
        primaryActions: ["view_exam", "generate_mock", "start_preparation"],
      };
    }

    void import("@/lib/gov-exam/api").then(({ getExamDetails, searchGovExams }) => {
      const detailsPromise = getExamDetails(
        linkedExamId ? { examId: linkedExamId } : { code: linkedCode },
      );
      const searchPromise = searchGovExams({ q: linkedCode || linkedExamId || "" });

      void Promise.allSettled([detailsPromise, searchPromise]).then(([detailsResult, searchResult]) => {
        if (cancelled) return;

        if (detailsResult.status === "fulfilled") {
          const details = detailsResult.value as {
            exam?: { examId?: string };
          } | null;
          // Catch-all mocks / partial payloads can fulfill without an exam —
          // do not throw; fall through to search hydration.
          if (details?.exam?.examId) {
            applyExamSelection(mapDetailsToSearchResult(detailsResult.value));
            if (linkedStageId) setStageId(linkedStageId);
            return;
          }
        }

        if (searchResult.status === "fulfilled") {
          const hit =
            searchResult.value.results.find((r) => linkedExamId && r.examId === linkedExamId) ??
            searchResult.value.results.find(
              (r) => linkedCode && r.code?.toUpperCase() === linkedCode.toUpperCase(),
            ) ??
            null;
          if (hit) {
            applyExamSelection(hit);
            if (linkedStageId) setStageId(linkedStageId);
          }
        }
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Resume an in-flight job after refresh — never auto-restart generation.
  useEffect(() => {
    const userId = user?.id ?? profile?.id;
    if (!userId) return;
    if (generatingRef.current) return;
    const fromUrl = urlJobId;
    const stored = loadActivePaperJob(userId, "paper");
    const jobId = fromUrl || stored?.jobId;
    if (!jobId) return;
    if (stored?.idempotencyKey) {
      idempotencyKeyRef.current = stored.idempotencyKey;
    }
    let cancelled = false;

    if (isPaperJobPollTimedOut(jobId)) {
      setStep(3);
      void (async () => {
        try {
          const current = await getPaperGenerationJob(jobId);
          if (cancelled) return;
          setJob(current);
          if (stored?.examId) setExamId(stored.examId);
          if (!isPaperJobTerminal(current.status)) {
            setGenerationSession(beginGenerationSession(jobId, {
              idempotencyKey: stored?.idempotencyKey,
            }));
          }
          const status = mapPaperJobPublicStatus(current.status);
          if (isPaperJobTerminal(status)) {
            clearPaperJobPollTimedOut();
            clearActivePaperJob();
            syncJobIdInUrl(null);
            if (status === "completed" && current.mockTestId) {
              navigate(`/app/mock-test/session/${current.mockTestId}`);
            }
          }
        } catch (err) {
          if (cancelled) return;
          setJob({
            jobId,
            status: "failed_retryable",
            errorCode: "GENERATION_POLL_TIMEOUT",
            errorMessage: paperJobErrorMessage({
              jobId,
              status: "failed_retryable",
              errorCode: "GENERATION_POLL_TIMEOUT",
            }),
          });
          setGenerationSession(
            failGenerationSession(initialGenerationSession(), jobId, {
              errorCode: "GENERATION_POLL_TIMEOUT",
              errorMessage: "Paper generation timed out. Tap Retry to try again.",
              retryable: true,
            }),
          );
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    pollAbortRef.current = false;
    setBusy(true);
    setStep(3);
    void (async () => {
      try {
        // #region agent log
        debugLog161d95({
          hypothesisId: "H2",
          location: "GenerateGovPaper.tsx:resumePoll:start",
          message: "gov_resume_poll_start",
          data: { jobId, fromUrl: Boolean(fromUrl), hasStored: Boolean(stored) },
        });
        debugLog4a9592({
          hypothesisId: "H-F",
          location: "GenerateGovPaper.tsx:resumePoll:start",
          message: "gov_resume_poll_start",
          runId: "post-fix",
          data: {
            jobId: jobId.slice(0, 8),
            fromUrl: Boolean(fromUrl),
            hasStored: Boolean(stored),
            hasUser: Boolean(user?.id),
            hasProfile: Boolean(profile?.id),
            generatingLocked: generatingRef.current,
          },
        });
        // #endregion
        let current: PaperJobResult;
        try {
          current = await getPaperGenerationJob(jobId);
        } catch (firstErr) {
          const status = (firstErr as { status?: number })?.status;
          if (status === 429 || status === 409) {
            current = { jobId, status: "queued" };
          } else {
            throw firstErr;
          }
        }
        if (cancelled) return;
        setJob(current);
        if (stored?.examId) setExamId(stored.examId);
        const status = mapPaperJobPublicStatus(current.status);
        if (!isPaperJobTerminal(status)) {
          setGenerationSession(
            beginGenerationSession(jobId, {
              idempotencyKey: stored?.idempotencyKey,
            }),
          );
        }
        if (isPaperJobTerminal(status)) {
          clearActivePaperJob();
          syncJobIdInUrl(null);
          setBusy(false);
          if (status === "completed" && current.mockTestId) {
            setGenerationSession((prev) =>
              completeGenerationSession(prev, jobId, current.mockTestId),
            );
            navigate(`/app/mock-test/session/${current.mockTestId}`);
          } else if (status !== "completed") {
            setGenerationSession((prev) =>
              failGenerationSession(prev, jobId, {
                errorCode: current.errorCode,
                errorMessage: current.errorMessage ?? current.error,
                retryable: status === "failed_retryable" || status === "failed",
              }),
            );
          }
          return;
        }
        current = await pollPaperJobUntilTerminal(jobId, current, {
          setJob,
          shouldAbort: () => pollAbortRef.current || cancelled,
          nudge: (id) => processPaperGenerationJob(id).then(() => undefined),
        });
        const publicStatus = mapPaperJobPublicStatus(current.status);
        if (current.status === "completed" && current.mockTestId) {
          clearActivePaperJob();
          syncJobIdInUrl(null);
          setGenerationSession((prev) =>
            completeGenerationSession(prev, jobId, current.mockTestId),
          );
          navigate(`/app/mock-test/session/${current.mockTestId}`);
        } else if (isPaperJobTerminal(current.status)) {
          clearActivePaperJob();
          syncJobIdInUrl(null);
          if (publicStatus === "failed_retryable" || publicStatus === "failed_permanent" || publicStatus === "failed") {
            rememberPollTimeoutIfNeeded(current);
            setGenerationSession((prev) =>
              failGenerationSession(prev, jobId, {
                errorCode: current.errorCode,
                errorMessage: current.errorMessage ?? current.error,
                retryable:
                  publicStatus === "failed_retryable" || publicStatus === "failed",
              }),
            );
            toast.error(current.errorMessage || "We couldn't generate this paper. Try again.");
          } else if (publicStatus === "cancelled") {
            setGenerationSession(resetGenerationSession());
          }
        }
        // #region agent log
        debugLog161d95({
          hypothesisId: "H2",
          location: "GenerateGovPaper.tsx:resumePoll:exit",
          message: "gov_resume_poll_exit",
          runId: "post-fix",
          data: {
            jobId,
            polls: null,
            status: current.status,
            publicStatus,
            terminal: isPaperJobTerminal(current.status),
            mockTestId: current.mockTestId ?? null,
            usedSharedPoller: true,
          },
        });
        // #endregion
      } catch (err) {
        // #region agent log
        debugLog161d95({
          hypothesisId: "H2",
          location: "GenerateGovPaper.tsx:resumePoll:error",
          message: "gov_resume_poll_error",
          runId: "post-fix",
          data: {
            jobId,
            status: (err as { status?: number })?.status ?? null,
            code: (err as { code?: string })?.code ?? null,
            message: err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160),
          },
        });
        // #endregion
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          setJob({
            jobId,
            status: "failed_retryable",
            errorMessage: formatGovExamOperationError(err),
          });
          clearActivePaperJob();
          syncJobIdInUrl(null);
        }
        setBusy(false);
        toast.error(formatGovExamOperationError(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      pollAbortRef.current = true;
    };
  }, [user?.id, profile?.id, urlJobId]);

  useEffect(() => {
    if (!selected) return;
    const st = selected.stage ?? selected.stages[0];
    if (st && !stageId) setStageId(st.id);
    if (isExactPatternBasis(basis)) {
      applyQuestionCountForBasis(
        basis,
        selected.pattern?.totalQuestions,
        questionCountInput,
      );
      if (selected.pattern) {
        setDurationMinutes(selected.pattern.durationMinutes);
      }
    }
    if (basis === "topic" && questionCount > QUESTION_COUNT_ABS_MAX) {
      const next = syncQuestionCountForBasis("topic", selected.pattern?.totalQuestions, String(questionCount));
      setQuestionCount(next.count);
      setQuestionCountInput(next.input);
      setQuestionCountError(null);
    }
    // Intentionally omit questionCountInput so typing custom counts does not re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, basis]);

  // Refresh pattern/languages from the server when exam + stage are known.
  useEffect(() => {
    if (!examId || !stageId) return;
    let cancelled = false;
    void getExamPattern({ examId, stageId })
      .then((res) => {
        if (cancelled) return;
        setPatternLoadError(null);
        setSelectedExam((prev) => {
          if (!prev || prev.examId !== examId) return prev;
          const langs =
            res.pattern.languages?.length > 0
              ? res.pattern.languages
              : prev.languages?.length
                ? prev.languages
                : ["en"];
          return {
            ...prev,
            languages: langs,
            pattern: {
              version: res.pattern.version,
              totalQuestions: res.pattern.totalQuestions,
              totalMarks: res.pattern.totalMarks,
              durationMinutes: res.pattern.durationMinutes,
              negativeMark: res.pattern.negativeMark,
              sourceUrl: res.pattern.sourceUrl,
            },
          };
        });
        if (isExactPatternBasis(basis)) {
          applyQuestionCountForBasis(basis, res.pattern.totalQuestions, questionCountInput);
          setDurationMinutes(res.pattern.durationMinutes);
        }
        if (res.pattern.languages?.length) {
          setLanguage((prev) =>
            res.pattern.languages.includes(prev) ? prev : prev,
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPatternLoadError(
          err instanceof ApiClientError && err.code === "PATTERN_NOT_AVAILABLE"
            ? "Approved exam pattern is not configured yet. Choose another stage or contact support."
            : "Could not load exam pattern.",
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, stageId]);

  // Server-authoritative availability before charge — also keep bank counts honest.
  useEffect(() => {
    if (!examId || !stageId || step < 2) return;
    if (isExactPatternBasis(basis) && !parsedQuestionCount.valid) return;
    let cancelled = false;
    const mode = modeFromBasis(basis);
    const maxQ =
      basis === "topic"
        ? QUESTION_COUNT_ABS_MAX
        : Math.min(
            QUESTION_COUNT_ABS_MAX,
            selected?.pattern?.totalQuestions ?? QUESTION_COUNT_ABS_MAX,
          );
    const safeRequested = parsedQuestionCount.valid
      ? parsedQuestionCount.value
      : requestedForConfig;
    const topicsKey =
      basis === "topic" ? resolvedTopicsSafe().join("|") : "";
    const requestKey = availabilityRequestKey({
      examId,
      stageId,
      mode,
      language,
      questionCount: safeRequested,
      basis,
      topicsKey,
    });
    setAvailabilitySession(beginAvailabilityCheck(requestKey));
    const timer = window.setTimeout(() => {
      void checkExamPaperAvailability({
        examId,
        stageId,
        mode,
        language,
        questionCount: safeRequested,
        topics: basis === "topic" ? resolvedTopicsSafe() : [],
        difficulty: difficulty || null,
        generator: pickPaperGeneratorPreference({
          mode,
          questionCount: safeRequested,
          available: inventoryAvailable,
          basis:
            basis === "full_sim" || basis === "hybrid"
              ? "full_sim"
              : basis === "official_previous"
                ? "official_previous"
                : basis === "topic"
                  ? "topic"
                  : "custom",
        }),
      })
        .then((avail) => {
          if (cancelled) return;
          setAvailabilitySession((prev) =>
            completeAvailabilityCheck(prev, requestKey, avail),
          );
          // Mirror approved count into selection so coverage labels stay truthful.
          setSelectedExam((prev) => {
            if (!prev || prev.examId !== examId) return prev;
            const required =
              prev.bankReadiness?.requiredQuestions ??
              prev.pattern?.totalQuestions ??
              avail.requested;
            const approved = avail.available;
            const status =
              approved <= 0
                ? ("empty" as const)
                : approved >= required
                  ? ("ready" as const)
                  : ("partial" as const);
            return {
              ...prev,
              bankReadiness: {
                approvedPublicCount: approved,
                publicCount: approved,
                requiredQuestions: required,
                status,
                fullSimulationAvailable: status === "ready",
              },
            };
          });
        })
        .catch((err) => {
          if (cancelled) return;
          const message =
            err instanceof Error ? err.message : "Availability check failed.";
          const code =
            err instanceof ApiClientError ? err.code : "AVAILABILITY_FAILED";
          setAvailabilitySession((prev) =>
            failAvailabilityCheck(prev, requestKey, code, message),
          );
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, stageId, basis, language, questionCountInput, parsedQuestionCount.valid, difficulty, step]);

  function resolvedTopicsSafe(): string[] {
    const fromDraft = topicDraft
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    return [...new Set([...selectedTopics, ...fromDraft])].slice(0, 20);
  }

  useEffect(() => {
    if (basis !== "topic" || !examId || !stageId) return;
    let cancelled = false;
    void getExamSyllabus({ examId, stageId })
      .then((res) => {
        if (cancelled) return;
        const labels = flattenSyllabusTopicLabels(res.syllabus.topicsJson);
        setTopicChoices(labels);
        setSelectedTopics((prev) => (prev.length || topicDraft.trim() ? prev : labels.slice(0, 3)));
      })
      .catch(() => {
        if (!cancelled) setTopicChoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [basis, examId, stageId]);

  const mode = modeFromBasis(basis);

  const resolvedTopics = useMemo(() => {
    const fromDraft = topicDraft
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    return [...new Set([...selectedTopics, ...fromDraft])].slice(0, 20);
  }, [selectedTopics, topicDraft]);

  async function pollJobUntilTerminal(jobId: string, seed: PaperJobResult): Promise<PaperJobResult> {
    pollAbortRef.current = false;
    return pollPaperJobUntilTerminal(jobId, seed, {
      setJob,
      shouldAbort: () => pollAbortRef.current,
      nudge: (id) => processPaperGenerationJob(id).then(() => undefined),
    });
  }

  async function handleCancelJob() {
    if (!job?.jobId) return;
    pollAbortRef.current = true;
    try {
      const res = await cancelPaperGenerationJob(job.jobId);
      setJob({ ...job, status: res.status || "cancelled" });
      clearActivePaperJob();
      clearPaperJobPollTimedOut();
      syncJobIdInUrl(null);
      setGenerationSession(resetGenerationSession());
      toast.message("Generation cancelled.");
    } catch (e) {
      toast.error(formatGovExamOperationError(e));
    } finally {
      generatingRef.current = false;
      setBusy(false);
    }
  }

  async function ensureSufficientCreditsForGeneration(): Promise<boolean> {
    const userId = user?.id ?? profile?.id;
    let balance = displayCredits;
    if (userId) {
      const fresh = await fetchSpendableCredits(userId);
      if (fresh != null) {
        setServerCredits(fresh);
        balance = fresh;
      }
    }
    const gate = evaluateGovExamCreditGate({
      balance,
      balanceKnown: balance != null,
      cost: CREATE_EXAM_PAPER_CREDIT_COST,
    });
    if (!("reason" in gate)) return true;
    if (gate.reason === "insufficient") {
      openUpgradeIfInsufficientCredits(
        new ApiClientError({
          message: `You need ${gate.cost} credits but only have ${gate.balance ?? 0}.`,
          code: "INSUFFICIENT_CREDITS",
          status: 402,
        }),
      );
    } else {
      toast.error("Could not verify your credit balance. Please try again.");
    }
    return false;
  }

  async function handleGenerate(overrideCount?: number) {
    if (generatingRef.current) return;
    // #region agent log
    debugLog4a9592({
      hypothesisId: "H-E",
      location: "GenerateGovPaper.tsx:handleGenerate:entry",
      message: "gov_generate_click",
      data: {
        generatingLocked: generatingRef.current,
        busy,
        jobStatus: job?.status ?? null,
        jobTerminal: job ? isPaperJobTerminal(job.status) : null,
        hasIdempotencyKey: Boolean(idempotencyKeyRef.current),
        basis,
        overrideCount: overrideCount ?? null,
        examId: examId.slice(0, 8),
        displayCredits,
      },
    });
    // #endregion
    if (!examId || !stageId) {
      toast.error("Select an exam and stage");
      return;
    }
    if (patternLoadError) {
      toast.error(patternLoadError);
      return;
    }
    if (!isExactPatternBasis(basis) && !parsedQuestionCount.valid) {
      toast.error(questionCountError ?? "Enter a valid question count.");
      return;
    }
    if (basis === "topic" && resolvedTopics.length === 0) {
      toast.error("Select or enter at least one topic");
      return;
    }
    const requested = overrideCount ?? requestedForConfig;
    generatingRef.current = true;
    setBusy(true);
    try {
      const creditsOk = await ensureSufficientCreditsForGeneration();
      if (!creditsOk) return;

      clearPaperJobPollTimedOut();

      try {
        const avail = await checkExamPaperAvailability({
          examId,
          stageId,
          mode: overrideCount != null ? "custom_mock" : mode,
          language,
          questionCount: requested,
          topics: basis === "topic" ? resolvedTopics : [],
          difficulty: difficulty || null,
        });
        setAvailabilitySession((prev) =>
          completeAvailabilityCheck(prev, availabilityRequestKey({
            examId,
            stageId,
            mode: overrideCount != null ? "custom_mock" : mode,
            language,
            questionCount: requested,
            basis,
            topicsKey: basis === "topic" ? resolvedTopics.join("|") : "",
          }), avail),
        );
        if (avail.blocked && overrideCount == null && (mode === "generated_mock" || mode === "official_previous")) {
          toast.error(
            avail.blockCode === "LANGUAGE_UNAVAILABLE"
              ? "This exam paper is not available in the selected language."
              : inventoryAvailabilityMessage(avail.available) +
                (avail.customPracticeMax > 0
                  ? " Try Custom Practice Set."
                  : ""),
          );
          return;
        }
        if (
          overrideCount == null &&
          (mode === "generated_mock" || mode === "official_previous") &&
          (!avail.fullMockAllowed || avail.blocked)
        ) {
          toast.error(
            inventoryAvailabilityMessage(avail.available) +
              " Try Custom Practice Set.",
          );
          return;
        }
        if (
          overrideCount == null &&
          mode === "generated_mock" &&
          avail.available < requested &&
          !avail.aiFillAllowed
        ) {
          toast.error(
            inventoryAvailabilityMessage(avail.available) +
              " Try Custom Practice Set.",
          );
          return;
        }
        const liveInventory = decideQuestionInventory({
          available: avail.available,
          requested,
          aiFillAvailable: avail.aiFillAllowed,
        });
        if (
          overrideCount == null &&
          mode === "generated_mock" &&
          !liveInventory.canGenerateRequested
        ) {
          toast.error(
            inventoryAvailabilityMessage(liveInventory.available) +
              " Try Custom Practice Set.",
          );
          return;
        }
        if (!liveInventory.canGenerateRequested) {
          toast.error(inventoryAvailabilityMessage(liveInventory.available));
          return;
        }
      } catch (e) {
        toast.error(formatGovExamOperationError(e));
        return;
      }

      setJob(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = idempotencyKeyRef.current;
    // #region agent log
    debugLog4a9592({
      hypothesisId: "H-E",
      location: "GenerateGovPaper.tsx:handleGenerate:create",
      message: "gov_generate_create_start",
      data: {
        idempotencyKeyPrefix: idempotencyKey.slice(0, 8),
        mode: overrideCount != null ? "custom_mock" : mode,
        requested,
        displayCredits,
      },
    });
    // #endregion
      const result =
        basis === "topic"
          ? await generateTopicPractice({
              examId,
              stageId,
              topics: resolvedTopics,
              questionCount: Math.min(100, Math.max(5, requested)),
              language,
              difficulty: difficulty || null,
              idempotencyKey,
            })
          : await createExamPaper({
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
              generator: pickPaperGeneratorPreference({
                mode: overrideCount != null ? "custom_mock" : mode,
                questionCount: requested,
                available: serverAvailability?.available,
                basis:
                  basis === "full_sim" || basis === "hybrid"
                    ? "full_sim"
                    : basis === "official_previous"
                      ? "official_previous"
                      : "custom",
              }),
            });
      setJob(result);
      if (result.jobId && !isPaperJobTerminal(result.status)) {
        setGenerationSession(
          beginGenerationSession(result.jobId, {
            idempotencyKey: idempotencyKeyRef.current ?? undefined,
          }),
        );
      }
      const resumeUserId = user?.id ?? profile?.id;
      if (resumeUserId && result.jobId) {
        saveActivePaperJob({
          jobId: result.jobId,
          examId,
          userId: resumeUserId,
          idempotencyKey: idempotencyKeyRef.current ?? undefined,
          kind: "paper",
        });
        syncJobIdInUrl(result.jobId);
      }

      const publicStatus = mapPaperJobPublicStatus(result.status);
      // #region agent log
      debugLog4a9592({
        hypothesisId: "H-C",
        location: "GenerateGovPaper.tsx:handleGenerate:created",
        message: "gov_generate_created",
        data: {
          jobId: result.jobId?.slice(0, 8) ?? null,
          status: result.status,
          publicStatus,
          creditsCharged: result.creditsCharged ?? null,
          mockTestId: result.mockTestId ? true : false,
          errorCode: result.errorCode ?? null,
          displayCredits,
        },
      });
      // #endregion
      if (publicStatus === "failed_permanent") {
        idempotencyKeyRef.current = null;
        clearActivePaperJob();
        syncJobIdInUrl(null);
        if (
          result.errorCode === "INSUFFICIENT_CREDITS" &&
          openUpgradeIfInsufficientCredits(
            new ApiClientError({
              message: paperJobErrorMessage(result),
              code: "INSUFFICIENT_CREDITS",
              status: 402,
            }),
          )
        ) {
          return;
        }
        toast.error(paperJobErrorMessage(result));
        return;
      }
      if (publicStatus === "failed_retryable") {
        toast.error(paperJobErrorMessage(result));
        return;
      }

      const current = await pollJobUntilTerminal(result.jobId, result);
      const terminal = mapPaperJobPublicStatus(current.status);
      // #region agent log
      debugLog161d95({
        hypothesisId: "H2",
        location: "GenerateGovPaper.tsx:generate:terminal",
        message: "gov_generate_terminal",
        data: {
          jobId: current.jobId ?? result.jobId,
          createStatus: result.status,
          pollStatus: current.status,
          terminal,
          mockTestId: current.mockTestId ?? null,
          questionCount: current.questionCount ?? null,
          hasError: Boolean(current.error || current.errorMessage),
        },
      });
      debugLog4a9592({
        hypothesisId: "H-C",
        location: "GenerateGovPaper.tsx:generate:terminal",
        message: "gov_generate_terminal",
        data: {
          jobId: (current.jobId ?? result.jobId)?.slice(0, 8) ?? null,
          createStatus: result.status,
          pollStatus: current.status,
          terminal,
          mockTestId: Boolean(current.mockTestId),
          errorCode: current.errorCode ?? null,
          creditsCharged: current.creditsCharged ?? result.creditsCharged ?? null,
          displayCredits,
        },
      });
      // #endregion

      if (terminal === "completed" && current.mockTestId) {
        clearActivePaperJob();
        syncJobIdInUrl(null);
        setGenerationSession((prev) =>
          completeGenerationSession(prev, current.jobId ?? result.jobId, current.mockTestId),
        );
        const expected =
          isExactPatternBasis(basis) ? selected?.pattern?.totalQuestions : questionCount;
        const actual = current.questionCount;
        const short =
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual < expected;
        const custom = current.paperClass === "custom_practice" || (!isExactPatternBasis(basis) && short);
        if (basis === "official_previous" && short) {
          toast.error(
            "Official paper coverage is incomplete. No generated questions were added. Try Custom Practice Set.",
          );
          return;
        }
        if (basis === "full_sim" && short) {
          toast.message(
            `Paper ready with ${actual ?? 0} questions (pattern asked for ${expected}). You can still start.`,
          );
        } else {
          toast.success(
            custom
              ? `Custom Practice Set ready (${actual ?? "available"} questions)`
              : actual
                ? `Practice paper ready (${actual} questions)`
                : "Practice paper ready",
          );
        }
        navigate(`/app/mock-test/session/${current.mockTestId}`);
      } else if (terminal === "failed_retryable") {
        rememberPollTimeoutIfNeeded(current);
        setGenerationSession((prev) =>
          failGenerationSession(prev, current.jobId ?? result.jobId, {
            errorCode: current.errorCode,
            errorMessage: current.errorMessage ?? current.error,
            retryable: true,
          }),
        );
        toast.error(paperJobErrorMessage(current));
        void ensureSufficientCreditsForGeneration();
      } else if (terminal === "failed_permanent" || terminal === "failed") {
        idempotencyKeyRef.current = null;
        clearActivePaperJob();
        clearPaperJobPollTimedOut();
        syncJobIdInUrl(null);
        setGenerationSession((prev) =>
          failGenerationSession(prev, current.jobId ?? result.jobId, {
            errorCode: current.errorCode,
            errorMessage: current.errorMessage ?? current.error,
            retryable: false,
          }),
        );
        toast.error(paperJobErrorMessage(current));
        void ensureSufficientCreditsForGeneration();
      } else if (terminal === "cancelled") {
        clearActivePaperJob();
        clearPaperJobPollTimedOut();
        syncJobIdInUrl(null);
        setGenerationSession(resetGenerationSession());
        toast.message("Generation cancelled.");
      } else {
        rememberPollTimeoutIfNeeded(current);
        setGenerationSession((prev) =>
          failGenerationSession(prev, current.jobId ?? result.jobId, {
            errorCode: current.errorCode ?? "GENERATION_POLL_TIMEOUT",
            errorMessage:
              current.errorMessage ??
              "Paper generation timed out. Tap Retry to try again.",
            retryable: true,
          }),
        );
        toast.error(
          current.errorMessage ??
            "Paper generation timed out. Tap Retry to try again.",
        );
      }
    } catch (e) {
      // #region agent log
      debugLog4a9592({
        hypothesisId: "H-D",
        location: "GenerateGovPaper.tsx:handleGenerate:catch",
        message: "gov_generate_catch",
        runId: "post-fix",
        data: {
          status: e instanceof ApiClientError ? e.status : null,
          code: e instanceof ApiClientError ? e.code : null,
          nulledIdempotency: false,
          jobStatusAfter: job?.status ?? null,
        },
      });
      // #endregion
      if (!openUpgradeIfInsufficientCredits(e)) {
        toast.error(formatGovExamOperationError(e));
      }
    } finally {
      generatingRef.current = false;
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (generatingRef.current) return;
    clearPaperJobPollTimedOut();
    const jobId = job?.jobId;
    if (jobId) {
      generatingRef.current = true;
      setBusy(true);
      pollAbortRef.current = false;
      try {
        const latest = await getPaperGenerationJob(jobId).catch(() => null);
        if (latest && latest.status === "completed" && latest.mockTestId) {
          setJob(latest);
          clearActivePaperJob();
          syncJobIdInUrl(null);
          navigate(`/app/mock-test/session/${latest.mockTestId}`);
          return;
        }
        if (latest && !isPaperJobTerminal(latest.status)) {
          setJob(latest);
          setGenerationSession(
            beginGenerationSession(jobId, {
              idempotencyKey: idempotencyKeyRef.current ?? undefined,
            }),
          );
          await processPaperGenerationJob(jobId).catch(() => undefined);
          const current = await pollJobUntilTerminal(jobId, latest);
          const terminal = mapPaperJobPublicStatus(current.status);
          if (terminal === "completed" && current.mockTestId) {
            clearActivePaperJob();
            syncJobIdInUrl(null);
            navigate(`/app/mock-test/session/${current.mockTestId}`);
          } else if (isPaperJobTerminal(current.status)) {
            toast.error(paperJobErrorMessage(current));
          }
          return;
        }
      } catch (e) {
        toast.error(formatGovExamOperationError(e));
        return;
      } finally {
        generatingRef.current = false;
        setBusy(false);
      }
    }
    idempotencyKeyRef.current = null;
    clearActivePaperJob();
    syncJobIdInUrl(null);
    void handleGenerate();
  }

  const generateDisabled =
    busy ||
    (job != null && !isPaperJobTerminal(job.status)) ||
    !stageId ||
    !creditGate.allowed;
  // #region agent log
  useEffect(() => {
    debugLog4a9592({
      hypothesisId: "H-D",
      location: "GenerateGovPaper.tsx:buttonState",
      message: "gov_generate_button_state",
      data: {
        busy,
        jobStatus: job?.status ?? null,
        jobTerminal: job ? isPaperJobTerminal(job.status) : null,
        generateDisabled,
        currentUserStage: job
          ? mapProgressToUiState(job.progressStage, job.status)
          : "IDLE",
        hasRetryUi: job ? isPaperJobTerminal(job.status) && job.status !== "completed" : false,
        displayCredits,
      },
    });
  }, [busy, job?.status, job?.progressStage, generateDisabled, displayCredits, stageId]);
  // #endregion

  const currentUiState = job
    ? mapProgressToUiState(job.progressStage, job.status)
    : "IDLE";
  const currentUserStage = job
    ? mapProgressToUserStage(job.progressStage, job.status)
    : null;
  const currentStageIdx = PAPER_JOB_UI_STATES.indexOf(
    currentUiState as (typeof PAPER_JOB_UI_STATES)[number],
  );

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
              <p className="text-sm font-medium">Select exam</p>
              <ExamSearchCombobox
                value={examId}
                browseWhenEmpty
                onSelect={applyExamSelection}
                onClear={clearExamSelection}
                onRequestExam={(q) => {
                  void requestGovExam({ queryText: q })
                    .then(() => {
                      toast.success("Exam request submitted. We’ll review it for the registry.");
                    })
                    .catch((err) => {
                      toast.error(
                        err instanceof Error ? err.message : "Could not submit exam request.",
                      );
                    });
                }}
              />
              {selected && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    {selected.shortName && selected.shortName !== selected.name
                      ? `${selected.shortName} · ${selected.name}`
                      : selected.name}
                    {selected.recruitingBody?.name
                      ? ` · ${selected.recruitingBody.name}`
                      : ""}
                    {examCategoryLabel(selected)
                      ? ` · ${examCategoryLabel(selected)}`
                      : ""}
                    {selected.stages?.length
                      ? ` · ${selected.stages.length} stage(s)`
                      : ""}
                    {selected.languages?.length
                      ? ` · ${selected.languages.join(", ")}`
                      : ""}
                  </p>
                  {selected.aliases?.length > 0 && (
                    <p>Also known as: {selected.aliases.slice(0, 4).join(", ")}</p>
                  )}
                  {selected.stages && selected.stages.length > 1 && (
                    <label className="block space-y-1">
                      <span className="font-medium text-foreground">Stage</span>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        value={stageId}
                        onChange={(e) => {
                          setStageId(e.target.value);
                          setAvailabilitySession(resetAvailabilitySession());
                        }}
                      >
                        {selected.stages.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {examVerificationLabel(selected) && (
                    <p>Verified: {examVerificationLabel(selected)}</p>
                  )}
                  {bank && (
                    <p
                      className={
                        fullSimAvailable
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      Requested {requestedForConfig} · Available {bank.approvedPublicCount}
                      {" · "}Missing{" "}
                      {Math.max(0, requestedForConfig - bank.approvedPublicCount)}
                      {" · "}
                      {bankCoverageLabel} · {bankReadinessLabel(bank.status)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">Paper mode</legend>
              {[
                {
                  id: "latest_pattern" as const,
                  label: "Custom Practice Set (approved bank)",
                  hint: "Honest bank-only practice sized to available inventory.",
                  disabled: false,
                },
                {
                  id: "quick" as const,
                  label: "Quick practice (25 Q)",
                  hint: null,
                  disabled: false,
                },
                {
                  id: "topic" as const,
                  label: "Topic-focused Custom Practice Set",
                  hint: "Verified bank topics only — never invents missing questions.",
                  disabled: false,
                },
                {
                  id: "full_sim" as const,
                  label: "Full Mock (exact pattern)",
                  hint: "Only when the approved bank covers the full pattern, or AI fill is available on your plan. Otherwise choose Custom Practice.",
                  disabled: !fullSimSelectable,
                },
                {
                  id: "hybrid" as const,
                  label: "Hybrid Realistic Mock",
                  hint: "Approved real questions plus generated practice where permitted. Faithful to the exam structure — never labeled as Official PYQ.",
                  disabled: !fullSimSelectable,
                },
                {
                  id: "official_previous" as const,
                  label: "Official / Previous Year",
                  hint: "Verified official content only. No AI or generated replacements.",
                  disabled: Boolean(
                    serverAvailability &&
                      (serverAvailability.blocked ||
                        serverAvailability.available < serverAvailability.requested) &&
                      basis !== "official_previous",
                  ),
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm ${
                    opt.disabled
                      ? "opacity-60 cursor-not-allowed"
                      : "cursor-pointer hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="basis"
                    checked={basis === opt.id}
                    disabled={opt.disabled}
                    onChange={() => {
                      if (opt.disabled) return;
                      setBasis(opt.id);
                      applyQuestionCountForBasis(
                        opt.id,
                        selected?.pattern?.totalQuestions,
                        questionCountInput,
                      );
                      if (opt.id === "quick") {
                        setDurationMinutes(30);
                      }
                      if (opt.id === "topic") {
                        setDurationMinutes(25);
                      }
                      if (isExactPatternBasis(opt.id) && selected?.pattern) {
                        setDurationMinutes(selected.pattern.durationMinutes);
                      }
                    }}
                  />
                  <span>
                    {opt.label}
                    {opt.hint && (
                      <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                    )}
                    {opt.id === "full_sim" && bank && (
                      <span className="block text-xs text-muted-foreground">
                        {bankCoverageLabel}
                        {!fullSimAvailable
                          ? effectiveAiFill
                            ? " — bank shortfall filled by AI practice questions to the official blueprint"
                            : " — bank is short; choose Custom Practice Set"
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
              {basis === "hybrid" && (
                <p className="text-xs text-muted-foreground">
                  Hybrid Realistic Mock keeps the official section structure. Generated items are
                  practice questions, not previous-year papers.
                </p>
              )}
              {basis === "official_previous" && (
                <p className="text-xs text-muted-foreground">
                  Official / Previous Year uses only verified official content. If coverage is
                  short, generation will not invent questions.
                </p>
              )}
              {basis === "full_sim" && (
                <p className="text-xs text-muted-foreground">
                  Full Mock uses the approved bank for the exact pattern
                  {effectiveAiFill ? ", with optional AI fill for shortfall" : ""}.
                  Never presented as an Official Previous Year Paper.
                </p>
              )}
              {!fullSimAvailable && !effectiveAiFill && inventory.mode === "blocked" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Approved bank coverage is {bankCoverageLabel ?? "unknown"}. Full Mock is not
                  available. Choose a Custom Practice Set from the approved bank.
                </p>
              )}
            </fieldset>
          )}

          {step === 2 && patternLoadError && (
            <p className="text-sm text-destructive" role="alert">
              {patternLoadError}
            </p>
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
                  {languageOptions.map((code) => (
                    <option key={code} value={code}>
                      {languageOptionLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="font-medium">Questions</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={isExactPatternBasis(basis)}
                  aria-invalid={Boolean(questionCountError)}
                  aria-describedby={questionCountError ? "gov-question-count-error" : undefined}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={questionCountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setQuestionCountInput(raw);
                    const max =
                      basis === "topic"
                        ? QUESTION_COUNT_ABS_MAX
                        : Math.min(
                            QUESTION_COUNT_ABS_MAX,
                            selected?.pattern?.totalQuestions ?? QUESTION_COUNT_ABS_MAX,
                          );
                    const parsed = parseGovQuestionCount(raw, max);
                    if (!parsed.valid) {
                      setQuestionCountError("error" in parsed ? parsed.error : "Invalid question count.");
                      return;
                    }
                    setQuestionCountError(null);
                    setQuestionCount(parsed.value);
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text");
                    const max =
                      basis === "topic"
                        ? QUESTION_COUNT_ABS_MAX
                        : Math.min(
                            QUESTION_COUNT_ABS_MAX,
                            selected?.pattern?.totalQuestions ?? QUESTION_COUNT_ABS_MAX,
                          );
                    setQuestionCountInput(pasted.trim());
                    const parsed = parseGovQuestionCount(pasted.trim(), max);
                    if (!parsed.valid) {
                      setQuestionCountError("error" in parsed ? parsed.error : "Invalid question count.");
                      return;
                    }
                    setQuestionCountError(null);
                    setQuestionCount(parsed.value);
                    setQuestionCountInput(String(parsed.value));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {isExactPatternBasis(basis)
                    ? `Locked to exam pattern (${requestedForConfig} questions)`
                    : `Allowed: ${QUESTION_COUNT_MIN}–${questionCountMax}`}
                </p>
                {questionCountError ? (
                  <p id="gov-question-count-error" className="text-xs text-destructive">{questionCountError}</p>
                ) : null}
              </label>
              {basis !== "topic" && (
                <label className="text-sm space-y-1">
                  <span className="font-medium">Duration (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    max={360}
                    disabled={isExactPatternBasis(basis)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(clampDurationMinutes(e.target.value))}
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
                <dd>
                  {selected?.stages?.find((s) => s.id === stageId)?.name ??
                    selected?.stage?.name ??
                    selected?.stages[0]?.name ??
                    "—"}
                </dd>
                <dt className="text-muted-foreground">Pattern</dt>
                <dd>{selected?.pattern?.version ?? "—"}</dd>
                <dt className="text-muted-foreground">Mode</dt>
                <dd>
                  {basis === "topic"
                    ? "Topic-focused Custom Practice Set"
                    : mode === "generated_mock"
                      ? "Full Mock"
                      : "Custom Practice Set"}
                </dd>
                <dt className="text-muted-foreground">Questions</dt>
                <dd>{requestedForConfig}</dd>
                <dt className="text-muted-foreground">Approved inventory</dt>
                <dd>{formatInventoryCoverage(inventory.available, requestedForConfig)}</dd>
                {serverAvailability?.generationPlan?.generator && (
                  <>
                    <dt className="text-muted-foreground">Backend</dt>
                    <dd>
                      {generatorLabel(serverAvailability.generationPlan.generator)}
                      {serverAvailability.generationPlan.generator === "python_paper_factory"
                        ? " (long-running AI)"
                        : serverAvailability.generationPlan.generator === "edge_assembler"
                          ? " (fast path)"
                          : ""}
                    </dd>
                  </>
                )}
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
                {canGenerateRequested || customPracticeMax >= 5 ? (
                  <>
                    <dt className="text-muted-foreground">Operation cost</dt>
                    <dd>{CREATE_EXAM_PAPER_CREDIT_COST}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Operation cost</dt>
                    <dd>No charge — generation isn’t available for this setup</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Quality checks</dt>
                <dd>
                  {basis === "topic"
                    ? "Topic/subject match · uniqueness · bank approval"
                    : "Blueprint · uniqueness · approved bank inventory"}
                </dd>
              </dl>
              {inventory.reason === "ai_fill" && canGenerateRequested && (
                <p className="text-sm text-muted-foreground">
                  {inventory.available} approved questions are available, so{" "}
                  {inventory.aiQuestions} will be generated by AI against the approved syllabus,
                  section weights and marking scheme. Every generated question is validated for a
                  single correct answer and checked against the rest of the paper for duplicates.
                </p>
              )}
              {showInventoryShortage && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {inventoryAvailabilityMessage(
                    serverAvailability?.available ?? inventory.available,
                  )}
                </p>
              )}
              {creditGate.allowed === false && creditGate.reason === "unknown_balance" && (
                <p className="text-sm text-muted-foreground" role="status">
                  Checking your credit balance before generation can start.
                </p>
              )}
              {insufficientCredits && (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
                  role="alert"
                >
                  <p className="text-amber-800 dark:text-amber-200">
                    You need {CREATE_EXAM_PAPER_CREDIT_COST} credits to generate this paper, but you
                    only have {creditGate.balance ?? 0}. Top up or upgrade to continue.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        openUpgradeIfInsufficientCredits(
                          new ApiClientError({
                            message: "Insufficient credits.",
                            code: "INSUFFICIENT_CREDITS",
                            status: 402,
                          }),
                        )
                      }
                    >
                      Upgrade / top up
                    </Button>
                    <Link
                      to="/app/settings/billing"
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-secondary"
                    >
                      Billing settings
                    </Link>
                  </div>
                </div>
              )}
              {serverAvailability && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Server check — Available: {serverAvailability.available}, Requested:{" "}
                  {serverAvailability.requested}, Missing: {serverAvailability.missing}.
                  {!serverAvailability.fullMockAllowed || serverAvailability.blocked
                    ? ` Full mock disabled. Custom Practice Set available up to ${serverAvailability.customPracticeMax}.`
                    : ""}
                </p>
              )}

              {job && (
                <div className="space-y-2 mt-4">
                  <GovPaperReviewGenerationTimer session={generationSession} />
                  <ul className="space-y-1.5" aria-live="polite">
                    {PAPER_JOB_UI_STATES.map((s, i) => {
                      const done =
                        currentStageIdx > i ||
                        job.status === "completed" ||
                        currentUiState === "READY";
                      const active =
                        currentUiState === s ||
                        ((currentUiState === "FAILED_RETRYABLE" ||
                          currentUiState === "FAILED_PERMANENT") &&
                          s === "GENERATING" &&
                          i === 2);
                      return (
                        <li key={s} className="flex items-center gap-2 text-xs">
                          {done ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : active && !isPaperJobTerminal(job.status) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <span className="h-3.5 w-3.5 rounded-full border border-border" />
                          )}
                          {PAPER_JOB_UI_LABEL[s]}
                        </li>
                      );
                    })}
                  </ul>
                  {currentUserStage === "failed" && (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {paperJobErrorMessage(job)}
                    </p>
                  )}
                  {currentUserStage === "failed" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleRetry()}
                      disabled={busy}
                    >
                      Retry
                    </Button>
                  )}
                  {!isPaperJobTerminal(job.status) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCancelJob()}
                    >
                      Cancel generation
                    </Button>
                  )}
                </div>
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
            ) : canGenerateRequested ? (
              <Button
                onClick={() =>
                  void (job &&
                  (mapPaperJobPublicStatus(job.status) === "failed_retryable" ||
                    mapPaperJobPublicStatus(job.status) === "failed")
                    ? handleRetry()
                    : handleGenerate())
                }
                disabled={generateDisabled}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : insufficientCredits ? (
                  "Top up to generate"
                ) : !creditGate.allowed ? (
                  "Checking credits…"
                ) : job &&
                  (mapPaperJobPublicStatus(job.status) === "failed_retryable" ||
                    mapPaperJobPublicStatus(job.status) === "failed") ? (
                  "Retry"
                ) : basis === "official_previous" ? (
                  "Generate Official Paper"
                ) : basis === "hybrid" ? (
                  "Generate Hybrid Mock"
                ) : basis === "full_sim" ? (
                  generateButtonLabel(inventory)
                ) : (
                  "Generate Practice Paper"
                )}
              </Button>
            ) : (
              <Button
                onClick={() => void handleGenerate(customPracticeMax)}
                disabled={generateDisabled || customPracticeMax < 5}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : insufficientCredits ? (
                  "Top up to generate"
                ) : !creditGate.allowed ? (
                  "Checking credits…"
                ) : (
                  customPracticeSetLabel(customPracticeMax)
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
          {canGenerateRequested || customPracticeMax >= 5 ? (
            <p>Est. credits: {CREATE_EXAM_PAPER_CREDIT_COST}</p>
          ) : (
            <p>Est. credits: none — generation unavailable</p>
          )}
          <p>Your credits: {displayCredits ?? "…"}</p>
          <p>Bank: {formatInventoryCoverage(inventory.available, requestedForConfig)}</p>
          {inventory.mode === "ai_assisted" && canGenerateRequested && (
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
