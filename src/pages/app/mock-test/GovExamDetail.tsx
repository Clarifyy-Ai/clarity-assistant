import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ApiClientError } from "@/lib/api/apiClient";
import { GovExamPageShell } from "@/components/gov-exam/GovExamPageShell";
import { classifyGovExamLoadError, type GovExamRouteResolution } from "@/lib/gov-exam/routeResolution";
import { GovExamReadinessPanel } from "@/components/gov-exam/GovExamReadinessPanel";
import {
  analyzePaperTrends,
  CREATE_EXAM_PAPER_CREDIT_COST,
  generateTopicPractice,
  getExamDetails,
  getExamPattern,
  getExamSyllabus,
  getPaperGenerationJob,
  listPreviousPapers,
  processPaperGenerationJob,
  type ExamReadinessSummary,
  type GovExamDetails,
  type GovExamPatternResponse,
  type GovExamSyllabusResponse,
  type PaperTrendsResponse,
  type PreparationPlanSummary,
  type PaperJobResult,
  type PreviousYearPaper,
  type TopicMasterySummary,
} from "@/lib/gov-exam/api";
import {
  getOrLoadPaperTrends,
  paperTrendsCacheKey,
} from "@/lib/gov-exam/paperTrendsCache";
import { formatGovExamOperationError } from "@/lib/gov-exam/examOperationErrors";
import { pollPaperJobUntilTerminal } from "@/lib/gov-exam/pollPaperJob";
import {
  clearActivePaperJob,
  isPaperJobTerminal,
  loadActivePaperJob,
  mapPaperJobPublicStatus,
  saveActivePaperJob,
} from "@/lib/gov-exam/paperJobStatus";
import {
  bankReadinessLabel,
  formatBankCoverage,
} from "@/lib/gov-exam/bankReadiness";
import {
  AI_GENERATED_PAPER_LABEL,
  CUSTOM_PRACTICE_PAPER_LABEL,
  GOV_EXAM_AFFILIATION_DISCLAIMER,
  resolvePaperClassPresentation,
} from "@/lib/gov-exam/disclaimers";
import {
  fetchExamReadiness,
  fetchPreparationPlan,
  fetchTopicMasteryForExam,
} from "@/lib/gov-exam/masteryClient";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";
import { fetchSpendableCredits } from "@/lib/billing/fetchSpendableCredits";
import { evaluateGovExamCreditGate } from "@/lib/gov-exam/govExamCreditGate";
import { openUpgradeIfInsufficientCredits } from "@/lib/network/aiErrorUx";
import { toast } from "sonner";
import { GovPaperReviewGenerationTimer } from "@/components/gov-exam/GovPaperReviewGenerationTimer";
import {
  beginGenerationSessionFromJob,
  completeGenerationSession,
  failGenerationSession,
  initialGenerationSession,
  resetGenerationSession,
  type GovPaperGenerationSession,
} from "@/lib/gov-exam/govPaperReviewSession";

type DetailTab =
  | "overview"
  | "pattern"
  | "syllabus"
  | "previous"
  | "mocks"
  | "topic"
  | "plan"
  | "analytics"
  | "sources";

type UserMockRow = {
  id: string;
  test_name: string | null;
  status: string | null;
  created_at: string | null;
  config: Record<string, unknown> | null;
};

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "pattern", label: "Pattern" },
  { id: "syllabus", label: "Syllabus" },
  { id: "previous", label: "Previous Papers" },
  { id: "mocks", label: "Mock Tests" },
  { id: "topic", label: "Topic Practice" },
  { id: "plan", label: "Preparation Plan" },
  { id: "analytics", label: "Analytics" },
  { id: "sources", label: "Official Sources" },
];

function flattenSyllabusTopics(topics: unknown, out: string[] = []): string[] {
  if (!Array.isArray(topics)) return out;
  for (const item of topics) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? o.topic ?? o.title ?? "").trim();
      if (name) out.push(name);
      const children = Array.isArray(o.topics)
        ? o.topics
        : Array.isArray(o.children)
          ? o.children
          : null;
      if (children) flattenSyllabusTopics(children, out);
    }
  }
  return out;
}

function formatVerifiedDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GovExamDetail(): React.ReactElement {
  const { examCode = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlJobId = searchParams.get("jobId");
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const storeCredits = useAuthStore((s) => (s as { credits?: number }).credits);
  const isProfileLoaded = useAuthStore(
    (s) => (s as { isProfileLoaded?: boolean }).isProfileLoaded,
  );
  const cachedCredits = resolveCreditBalance({
    isProfileLoaded,
    profileCredits: profile?.credits,
    storeCredits,
  });
  const [serverCredits, setServerCredits] = useState<number | null>(null);

  const [details, setDetails] = useState<GovExamDetails | null>(null);
  const [registryPapers, setRegistryPapers] = useState<PreviousYearPaper[]>([]);
  const [bankEmpty, setBankEmpty] = useState(false);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadResolution, setLoadResolution] = useState<GovExamRouteResolution | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");

  const [patternDetail, setPatternDetail] = useState<GovExamPatternResponse | null>(null);
  const [syllabusDetail, setSyllabusDetail] = useState<GovExamSyllabusResponse | null>(null);
  const [trends, setTrends] = useState<PaperTrendsResponse | null>(null);
  const [userMocks, setUserMocks] = useState<UserMockRow[]>([]);
  const [readiness, setReadiness] = useState<ExamReadinessSummary | null>(null);
  const [masteryRows, setMasteryRows] = useState<TopicMasterySummary[]>([]);
  const [prepPlan, setPrepPlan] = useState<PreparationPlanSummary | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [patternTabError, setPatternTabError] = useState<string | null>(null);
  const [syllabusTabError, setSyllabusTabError] = useState<string | null>(null);

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicJob, setTopicJob] = useState<PaperJobResult | null>(null);
  const [topicGenerationSession, setTopicGenerationSession] =
    useState<GovPaperGenerationSession>(initialGenerationSession);
  const paperTrendsCacheRef = useRef(new Map<string, PaperTrendsResponse>());
  const paperTrendsInflightRef = useRef(new Map<string, Promise<PaperTrendsResponse>>());
  const topicPollAbortRef = useRef(false);
  const topicResumeStartedRef = useRef<string | null>(null);
  const lastExamCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? profile?.id;
    if (!userId) return;
    let cancelled = false;
    void fetchSpendableCredits(userId).then((balance) => {
      if (!cancelled && balance != null) setServerCredits(balance);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.id]);

  const displayCredits =
    serverCredits ?? (cachedCredits.known ? cachedCredits.balance : null);
  const topicCreditGate = evaluateGovExamCreditGate({
    balance: displayCredits,
    balanceKnown: displayCredits != null,
    cost: CREATE_EXAM_PAPER_CREDIT_COST,
  });
  const topicCreditsInsufficient =
    "reason" in topicCreditGate && topicCreditGate.reason === "insufficient";

  async function load() {
    setLoading(true);
    setError(null);
    setLoadResolution(null);
    try {
      const data = await Promise.race([
        getExamDetails({ code: examCode }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(
              new Error(
                "Exam details timed out. Check your connection and retry.",
              ),
            );
          }, 25_000);
        }),
      ]);
      setDetails(data);

      try {
        const papersRes = await listPreviousPapers({
          examId: data.exam.examId,
          examCode: data.exam.code,
          stageId: data.primaryStage?.id,
        });
        setRegistryPapers(papersRes.papers);
        setBankEmpty(papersRes.bankEmpty);
        setBankMessage(papersRes.message ?? null);
      } catch {
        setRegistryPapers([]);
        setBankEmpty(true);
        setBankMessage(
          "Previous-year registry unavailable. Practice papers can still be generated from the pattern.",
        );
      }
    } catch (e) {
      const resolution = classifyGovExamLoadError(e);
      setLoadResolution(resolution);
      const msg =
        "message" in resolution
          ? resolution.message
          : e instanceof Error
            ? e.message
            : "Failed to load exam.";
      setError(msg);
      if (!(e instanceof ApiClientError && e.status === 404)) {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Clear dependent tab state when navigating to a different exam code.
    setDetails(null);
    setPatternDetail(null);
    setSyllabusDetail(null);
    setTrends(null);
    setUserMocks([]);
    setReadiness(null);
    setMasteryRows([]);
    setPrepPlan(null);
    paperTrendsCacheRef.current.clear();
    paperTrendsInflightRef.current.clear();
    setSelectedTopics([]);
    setTopicJob(null);
    topicResumeStartedRef.current = null;
    topicPollAbortRef.current = true;
    const examChanged =
      lastExamCodeRef.current != null && lastExamCodeRef.current !== examCode;
    lastExamCodeRef.current = examCode;
    if (examChanged) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("jobId");
        return next;
      }, { replace: true });
    }
    setRegistryPapers([]);
    setBankEmpty(false);
    setBankMessage(null);
    setTab("overview");
    setError(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCode]);

  useEffect(() => {
    if (!details?.exam.examId) return;

    let cancelled = false;
    async function loadTab() {
      const examId = details!.exam.examId;
      const stageId = details!.primaryStage?.id;

      if (tab === "overview") return;

      setTabLoading(true);
      try {
        if (tab === "pattern" && stageId) {
          setPatternTabError(null);
          try {
            const res = await getExamPattern({ examId, stageId });
            if (!cancelled) setPatternDetail(res);
          } catch (e) {
            if (!cancelled) {
              setPatternDetail(null);
              setPatternTabError(
                e instanceof Error && /PATTERN_NOT/i.test(String(e.message))
                  ? "Approved exam pattern is not configured for this stage yet."
                  : "Could not load exam pattern.",
              );
            }
          }
        } else if (tab === "syllabus" || tab === "topic") {
          if (stageId) {
            setSyllabusTabError(null);
            try {
              const res = await getExamSyllabus({ examId, stageId });
              if (!cancelled) setSyllabusDetail(res);
            } catch (e) {
              if (!cancelled) {
                setSyllabusDetail(null);
                setSyllabusTabError(
                  e instanceof Error && /SYLLABUS_NOT/i.test(String(e.message))
                    ? "Approved syllabus is not configured for this stage yet."
                    : "Could not load syllabus.",
                );
              }
            }
          }
        } else if (tab === "previous") {
          // registry already loaded with details; refresh lightly
          const papersRes = await listPreviousPapers({
            examId,
            examCode: details!.exam.code,
            stageId,
          });
          if (!cancelled) {
            setRegistryPapers(papersRes.papers);
            setBankEmpty(papersRes.bankEmpty);
            setBankMessage(papersRes.message ?? null);
          }
        } else if (tab === "mocks" && user?.id) {
          const { data, error: mockErr } = await supabase
            .from("mock_tests")
            .select("id, test_name, status, created_at, config")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(40);
          if (mockErr) throw mockErr;
          const rows = ((data ?? []) as unknown as UserMockRow[]).filter((row) => {
            const cfg = row.config ?? {};
            const govId = String(cfg.gov_exam_id ?? "");
            const code = String(cfg.exam_code ?? cfg.examCode ?? "").toUpperCase();
            return govId === examId || code === details!.exam.code.toUpperCase();
          });
          if (!cancelled) setUserMocks(rows);
        } else if (tab === "plan" || tab === "analytics") {
          if (user?.id) {
            const [ready, mastery, plan] = await Promise.all([
              fetchExamReadiness(user.id, examId, stageId),
              fetchTopicMasteryForExam(user.id, examId),
              fetchPreparationPlan(user.id, examId),
            ]);
            if (!cancelled) {
              setReadiness(ready);
              setMasteryRows(mastery);
              setPrepPlan(plan);
            }
          }
          if (tab === "analytics" && stageId) {
            const years = Object.keys(details!.previousPaperCounts.byYear)
              .map(Number)
              .filter((y) => Number.isFinite(y))
              .sort((a, b) => b - a)
              .slice(0, 5);
            const sourceYears = years.length ? years : [2024, 2023, 2022];
            const cacheKey = paperTrendsCacheKey(examId, stageId, sourceYears);
            const res = await getOrLoadPaperTrends(
              paperTrendsCacheRef.current,
              paperTrendsInflightRef.current,
              cacheKey,
              () =>
                analyzePaperTrends({
                  examId,
                  stageId,
                  sourceYears,
                }),
            );
            if (!cancelled) setTrends(res);
          }
        } else if (tab === "sources") {
          // data already on details
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load tab data.";
        toast.error(msg);
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    }
    void loadTab();
    return () => {
      cancelled = true;
    };
  }, [tab, details?.exam.examId, details?.primaryStage?.id, user?.id]);

  const exam = details?.exam;
  const stage = details?.primaryStage ?? details?.stages?.[0] ?? null;
  const pattern = details?.activePatternSummary;
  const bank = details?.bankReadiness ?? null;
  const fullSimAvailable = bank?.fullSimulationAvailable === true;
  const affiliation = details?.disclaimers.affiliation ?? GOV_EXAM_AFFILIATION_DISCLAIMER;
  const aiLabel = details?.disclaimers.aiGenerated ?? AI_GENERATED_PAPER_LABEL;
  const customLabel = details?.disclaimers.customPractice ?? CUSTOM_PRACTICE_PAPER_LABEL;

  const officialSourceUrl =
    pattern?.sourceUrl ?? details?.body?.officialUrl ?? details?.officialSources[0]?.sourceUrl ?? null;

  const generateBase = useMemo(() => {
    if (!exam) return "/app/mock-test/generate";
    const q = new URLSearchParams({
      examId: exam.examId,
      stageId: stage?.id ?? "",
      code: exam.code,
    });
    return `/app/mock-test/generate?${q.toString()}`;
  }, [exam, stage?.id]);

  const topicOptions = useMemo(() => {
    const fromSyllabus = flattenSyllabusTopics(syllabusDetail?.syllabus.topicsJson);
    if (fromSyllabus.length > 0) return [...new Set(fromSyllabus)].slice(0, 80);
    const preview = flattenSyllabusTopics(details?.syllabusSummary?.topicsPreview);
    return [...new Set(preview)].slice(0, 80);
  }, [syllabusDetail, details?.syllabusSummary?.topicsPreview]);

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }

  function syncTopicJobIdInUrl(jobId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (jobId) next.set("jobId", jobId);
      else next.delete("jobId");
      return next;
    }, { replace: true });
  }

  function persistTopicPracticeJob(jobId: string, examId: string) {
    const userId = user?.id ?? profile?.id;
    if (!userId) return;
    saveActivePaperJob({
      jobId,
      examId,
      userId,
      kind: "topic_practice",
    });
    syncTopicJobIdInUrl(jobId);
  }

  async function awaitTopicPracticeJob(
    jobId: string,
    seed: PaperJobResult,
  ): Promise<PaperJobResult> {
    return pollPaperJobUntilTerminal(jobId, seed, {
      setJob: setTopicJob,
      shouldAbort: () => topicPollAbortRef.current,
      nudge: (id) => processPaperGenerationJob(id).then(() => undefined),
    });
  }

  function completeTopicPracticeJob(terminal: PaperJobResult): boolean {
    setTopicJob(terminal);
    const status = mapPaperJobPublicStatus(terminal.status);
    if (status === "completed" && terminal.mockTestId) {
      clearActivePaperJob(terminal.jobId ?? undefined);
      syncTopicJobIdInUrl(null);
      if (terminal.jobId) {
        setTopicGenerationSession((prev) =>
          completeGenerationSession(prev, terminal.jobId!, terminal.mockTestId),
        );
      } else {
        setTopicGenerationSession(resetGenerationSession());
      }
      toast.success("Topic practice set ready.");
      navigate(`/app/mock-test/session/${terminal.mockTestId}`);
      return true;
    }
    if (status === "failed_retryable" || status === "failed") {
      if (terminal.jobId) {
        setTopicGenerationSession((prev) =>
          failGenerationSession(prev, terminal.jobId!, {
            errorCode: terminal.errorCode,
            errorMessage: terminal.errorMessage ?? terminal.error,
            retryable: true,
          }),
        );
      }
      toast.error(
        terminal.errorMessage ??
          terminal.error ??
          "Topic practice failed. Retry uses the same reserved job.",
      );
      return false;
    }
    clearActivePaperJob(terminal.jobId ?? undefined);
    syncTopicJobIdInUrl(null);
    setTopicGenerationSession(resetGenerationSession());
    throw new Error(
      terminal.errorMessage ?? terminal.error ?? "Topic practice failed.",
    );
  }

  async function startTopicPractice() {
    if (!exam || selectedTopics.length === 0) {
      toast.error("Select at least one syllabus topic.");
      return;
    }
    const userId = user?.id ?? profile?.id;
    let freshBalance = displayCredits;
    if (userId) {
      const fetched = await fetchSpendableCredits(userId);
      if (fetched != null) {
        freshBalance = fetched;
        setServerCredits(fetched);
      }
    }
    const freshGate = evaluateGovExamCreditGate({
      balance: freshBalance,
      balanceKnown: freshBalance != null,
      cost: CREATE_EXAM_PAPER_CREDIT_COST,
    });
    if ("reason" in freshGate) {
      if (freshGate.reason === "insufficient") {
        openUpgradeIfInsufficientCredits(
          new ApiClientError({
            message: `You need ${freshGate.cost} credits but only have ${freshGate.balance ?? 0}.`,
            code: "INSUFFICIENT_CREDITS",
            status: 402,
          }),
        );
      } else {
        toast.error("Could not verify your credit balance. Please try again.");
      }
      return;
    }
    setTopicBusy(true);
    try {
      const result = await generateTopicPractice({
        examId: exam.examId,
        stageId: stage?.id,
        topics: selectedTopics,
        questionCount: Math.min(25, Math.max(5, selectedTopics.length * 5)),
      });
      const mockId = result.mockTestId;
      if (mockId) {
        toast.success("Topic practice set ready.");
        navigate(`/app/mock-test/session/${mockId}`);
        return;
      }
      if (result.jobId) {
        topicPollAbortRef.current = false;
        topicResumeStartedRef.current = result.jobId;
        persistTopicPracticeJob(result.jobId, exam.examId);
        setTopicGenerationSession(
          beginGenerationSessionFromJob({
            jobId: result.jobId,
            startedAt: result.startedAt,
            createdAt: result.createdAt,
          }),
        );
        toast.message("Assembling topic practice…");
        const terminal = await awaitTopicPracticeJob(result.jobId, result);
        if (completeTopicPracticeJob(terminal)) return;
        return;
      }
      throw new Error(result.errorMessage ?? result.error ?? "Topic practice failed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Topic practice unavailable.";
      const missing =
        /404|not found|Failed to fetch|unreachable|does not exist/i.test(msg);
      if (missing) {
        toast.message("Opening custom paper generator with topic mode.");
        navigate(
          `${generateBase}&basis=topic&topics=${encodeURIComponent(selectedTopics.join(","))}`,
        );
      } else {
        toast.error(formatGovExamOperationError(e));
      }
    } finally {
      setTopicBusy(false);
    }
  }

  async function retryTopicPractice() {
    const jobId = topicJob?.jobId;
    if (!jobId) return;
    topicPollAbortRef.current = false;
    topicResumeStartedRef.current = jobId;
    setTopicBusy(true);
    try {
      setTopicGenerationSession(
        beginGenerationSessionFromJob({
          jobId,
          startedAt: topicJob?.startedAt,
          createdAt: topicJob?.createdAt,
        }),
      );
      await processPaperGenerationJob(jobId).catch(() => undefined);
      const latest = await getPaperGenerationJob(jobId);
      setTopicGenerationSession(
        beginGenerationSessionFromJob({
          jobId,
          startedAt: latest.startedAt,
          createdAt: latest.createdAt,
        }),
      );
      const terminal = await awaitTopicPracticeJob(jobId, latest);
      completeTopicPracticeJob(terminal);
    } catch (e) {
      toast.error(formatGovExamOperationError(e));
    } finally {
      setTopicBusy(false);
    }
  }

  useEffect(() => {
    const userId = user?.id ?? profile?.id;
    if (!userId) return;
    const stored = loadActivePaperJob(userId, "topic_practice");
    const jobId = urlJobId || stored?.jobId;
    if (!jobId) return;
    if (
      !urlJobId &&
      stored?.examId &&
      exam?.examId &&
      stored.examId !== exam.examId
    ) {
      return;
    }
    if (topicResumeStartedRef.current === jobId) {
      if (exam?.examId) persistTopicPracticeJob(jobId, exam.examId);
      return;
    }
    topicResumeStartedRef.current = jobId;

    let cancelled = false;
    topicPollAbortRef.current = false;
    setTopicBusy(true);
    setTab("topic");

    void (async () => {
      try {
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
        setTopicJob(current);
        const status = mapPaperJobPublicStatus(current.status);
        if (isPaperJobTerminal(status)) {
          completeTopicPracticeJob(current);
          return;
        }
        if (exam?.examId) persistTopicPracticeJob(jobId, exam.examId);
        setTopicGenerationSession(
          beginGenerationSessionFromJob({
            jobId,
            startedAt: current.startedAt,
            createdAt: current.createdAt,
          }),
        );
        toast.message("Resuming topic practice…");
        const terminal = await awaitTopicPracticeJob(jobId, current);
        if (cancelled) return;
        completeTopicPracticeJob(terminal);
      } catch (e) {
        if (cancelled) return;
        toast.error(formatGovExamOperationError(e));
      } finally {
        if (!cancelled) setTopicBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      topicPollAbortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.id, exam?.examId, urlJobId]);

  const topicJobRetryable =
    topicJob != null &&
    (mapPaperJobPublicStatus(topicJob.status) === "failed_retryable" ||
      mapPaperJobPublicStatus(topicJob.status) === "failed");

  const fullMockDisabledReason = !stage
    ? "No stage configured for this exam yet."
    : !fullSimAvailable
      ? bank
        ? `Only ${bank.approvedPublicCount} approved questions are currently available for this configuration (${bank.approvedPublicCount} / ${bank.requiredQuestions}). Generate a Custom Practice Set instead.`
        : "Question bank coverage is unknown."
      : null;

  return (
    <GovExamPageShell loadResolution={loadResolution} onRetry={() => void load()}>
    <div className="space-y-6 pb-24" data-testid="gov-exam-detail">
      <PageHeader
        title={exam?.name ?? "Government exam"}
        description={
          stage && pattern
            ? `${stage.name} · ${pattern.version} pattern · Verified ${formatVerifiedDate(pattern.effectiveDate)}`
            : "Verified pattern and syllabus from the exam registry"
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Mock Tests", href: "/app/mock-test" },
          { label: exam?.code ?? examCode },
        ]}
      />

      <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2 bg-muted/30">
        {affiliation}
      </p>

      {loading && (
        <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />
      )}

      {error && !loading && (
        <div data-testid="gov-exam-detail-not-found">
          <InlineErrorRetry message={error} onRetry={() => void load()} />
          <p className="mt-3">
            <Link
              to="/app/mock-test"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to exam hub
            </Link>
          </p>
        </div>
      )}

      {details && !loading && (
        <>
          <section className="sticky top-0 z-20 -mx-1 px-1 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-semibold tracking-tight truncate">
                  {exam!.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {stage?.name ?? "Stage TBD"}
                  {pattern
                    ? ` · ${pattern.version} · Verified ${formatVerifiedDate(pattern.effectiveDate)}`
                    : ""}
                </p>
                {pattern && (
                  <p className="text-sm text-foreground/90">
                    {pattern.totalMarks} marks · {pattern.durationMinutes} min · Neg{" "}
                    {pattern.negativeMark}
                    <span className="text-muted-foreground">
                      {" "}
                      · {pattern.totalQuestions} questions
                    </span>
                  </p>
                )}
                {officialSourceUrl && (
                  <a
                    href={officialSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    Official source
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {bank && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge
                      variant="outline"
                      className={
                        fullSimAvailable
                          ? "text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                          : "text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400"
                      }
                    >
                      {formatBankCoverage(
                        bank.approvedPublicCount,
                        bank.requiredQuestions,
                      )}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {bankReadinessLabel(bank.status)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  disabled={!stage || !fullSimAvailable}
                  title={fullMockDisabledReason ?? "Start full pattern mock"}
                  onClick={() =>
                    navigate(`${generateBase}&basis=full_sim`)
                  }
                >
                  Start Full Mock
                </Button>
                <Button
                  variant="outline"
                  disabled={!stage}
                  onClick={() => navigate(`${generateBase}&basis=quick`)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {bank && !fullSimAvailable
                    ? `Generate Custom Practice Set — up to ${bank.approvedPublicCount} questions`
                    : "Generate Custom Paper"}
                </Button>
              </div>
            </div>
            {fullMockDisabledReason && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {fullMockDisabledReason}
              </p>
            )}
          </section>

          <div className="flex flex-wrap gap-1 border-b border-border pb-px overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-2 text-sm whitespace-nowrap",
                  tab === t.id
                    ? "font-medium border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab !== "overview" && tabLoading && (
            <div className="h-28 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />
          )}

          {tab === "overview" && (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-gradient-to-br from-background to-muted/20 p-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {details.body?.name ?? "Recruiting body"}
                </p>
                {details.languages?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Languages: {details.languages.join(", ")}
                  </p>
                )}
                {details.syllabusSummary && (
                  <p className="text-xs text-muted-foreground">
                    Syllabus {details.syllabusSummary.version} ·{" "}
                    {details.syllabusSummary.topicCount} topics
                  </p>
                )}
                {exam!.description && (
                  <p className="text-sm text-muted-foreground">{exam!.description}</p>
                )}
                {exam!.aliases?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Also known as: {exam!.aliases.slice(0, 6).join(", ")}
                  </p>
                )}
                <p className="text-xs text-amber-700 dark:text-amber-400/90">{aiLabel}</p>
                <p className="text-xs text-muted-foreground">{customLabel}</p>
              </section>

              {user?.id && exam && (
                <ExamOnboardingCard examId={exam.examId} stageId={stage?.id ?? null} />
              )}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-start">
                {[
                  { label: "View pattern", tabId: "pattern" as DetailTab },
                  { label: "Syllabus", tabId: "syllabus" as DetailTab },
                  { label: "Previous papers", tabId: "previous" as DetailTab },
                  { label: "Topic practice", tabId: "topic" as DetailTab },
                  { label: "Preparation plan", tabId: "plan" as DetailTab },
                  { label: "Analytics", tabId: "analytics" as DetailTab },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setTab(item.tabId)}
                    className="self-start rounded-xl border border-border px-3 py-2 text-sm font-medium text-left hover:bg-secondary/50 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "pattern" && !tabLoading && patternTabError && (
            <InlineErrorRetry
              message={patternTabError}
              onRetry={() => {
                setPatternTabError(null);
                setTab("overview");
                window.setTimeout(() => setTab("pattern"), 0);
              }}
            />
          )}

          {tab === "pattern" && !tabLoading && !patternTabError && patternDetail && (
            <section className="space-y-4 rounded-xl border border-border p-5">
              <div>
                <h3 className="text-sm font-semibold">
                  Pattern {patternDetail.pattern.version}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {patternDetail.pattern.totalQuestions} questions ·{" "}
                  {patternDetail.pattern.totalMarks} marks ·{" "}
                  {patternDetail.pattern.durationMinutes} min · Neg{" "}
                  {patternDetail.pattern.negativeMark}
                </p>
                {patternDetail.pattern.notes && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {patternDetail.pattern.notes}
                  </p>
                )}
              </div>
              <ul className="space-y-2">
                {patternDetail.sections.map((s) => (
                  <li
                    key={s.id}
                    className="flex justify-between text-sm border-b border-border/50 pb-2"
                  >
                    <span>
                      {s.name}{" "}
                      <span className="text-muted-foreground">({s.code})</span>
                    </span>
                    <span className="text-muted-foreground">
                      {s.questionCount} Q · {s.marks} marks
                    </span>
                  </li>
                ))}
              </ul>
              {patternDetail.pattern.sourceUrl && (
                <a
                  href={patternDetail.pattern.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Pattern source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </section>
          )}

          {tab === "syllabus" && !tabLoading && syllabusTabError && (
            <InlineErrorRetry
              message={syllabusTabError}
              onRetry={() => {
                setSyllabusTabError(null);
                setTab("overview");
                window.setTimeout(() => setTab("syllabus"), 0);
              }}
            />
          )}

          {tab === "syllabus" && !tabLoading && !syllabusTabError && (
            <section className="space-y-3 rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold">
                Syllabus {syllabusDetail?.syllabus.version ?? details.syllabusSummary?.version ?? ""}
              </h3>
              <SyllabusTopics
                topics={
                  syllabusDetail?.syllabus.topicsJson ??
                  details.syllabusSummary?.topicsPreview ??
                  []
                }
              />
              {(syllabusDetail?.syllabus.sourceUrl || details.syllabusSummary?.sourceUrl) && (
                <a
                  href={
                    syllabusDetail?.syllabus.sourceUrl ??
                    details.syllabusSummary?.sourceUrl ??
                    "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Syllabus source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </section>
          )}

          {tab === "previous" && !tabLoading && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">
                  Previous papers (registry)
                  {details.previousPaperCounts.total > 0
                    ? ` · ${details.previousPaperCounts.total}`
                    : ""}
                </h3>
                <Link
                  to={`/app/mock-test/papers/${exam!.code}`}
                  className="text-xs text-primary hover:underline"
                >
                  Open paper library
                </Link>
              </div>
              {bankEmpty || registryPapers.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-6">
                  {bankMessage ??
                    "No approved previous-year papers in the registry yet. Generate a pattern-based practice paper instead — it is never labeled as official."}
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {registryPapers.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-border px-4 py-3 flex items-start gap-3"
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {p.title ?? `${exam!.code} ${p.year}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.year}
                          {p.shift ? ` · Shift ${p.shift}` : ""}
                          {p.questionCount != null ? ` · ${p.questionCount} Qs` : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          p.label === "official"
                            ? "text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                            : "text-[10px]"
                        }
                      >
                        {p.label === "official" ? "Official" : "Practice"}
                      </Badge>
                      {p.label === "official" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 h-7 text-[11px]"
                          onClick={() => navigate(`${generateBase}&basis=official_previous`)}
                        >
                          Start official paper
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{aiLabel}</p>
            </section>
          )}

          {tab === "mocks" && !tabLoading && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Your mocks for this exam</h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!stage}
                  onClick={() => navigate(`${generateBase}&basis=quick`)}
                >
                  Generate Custom Paper
                </Button>
              </div>
              {!user?.id ? (
                <p className="text-sm text-muted-foreground">Sign in to see your mocks.</p>
              ) : userMocks.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-6">
                  No mock attempts linked to this exam yet. Start a custom paper when you are ready —
                  results stay private to your account.
                </p>
              ) : (
                <ul className="space-y-2">
                  {userMocks.map((m) => {
                    const paperMeta = resolvePaperClassPresentation(m.config);
                    return (
                      <li
                        key={m.id}
                        className="rounded-xl border border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.test_name ?? "Practice paper"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.status ?? "—"}
                            {m.created_at
                              ? ` · ${formatVerifiedDate(m.created_at)}`
                              : ""}
                            {paperMeta.shortLabel ? ` · ${paperMeta.shortLabel}` : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(
                              m.status === "COMPLETED" || m.status === "completed"
                                ? `/app/mock-test/results/${m.id}`
                                : `/app/mock-test/session/${m.id}`,
                            )
                          }
                        >
                          {m.status === "COMPLETED" || m.status === "completed"
                            ? "Results"
                            : "Continue"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{aiLabel}</p>
            </section>
          )}

          {tab === "topic" && !tabLoading && (
            <section className="space-y-4 rounded-xl border border-border p-5">
              <div>
                <h3 className="text-sm font-semibold">Topic practice</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Pick syllabus topics for a small custom practice set. Not a full exam simulation.
                </p>
              </div>
              {topicOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Syllabus topics are not published yet. You can still open the generator in topic mode.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto">
                  {topicOptions.map((topic) => {
                    const on = selectedTopics.includes(topic);
                    return (
                      <li key={topic}>
                        <button
                          type="button"
                          onClick={() => toggleTopic(topic)}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            on
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30",
                          )}
                        >
                          {topic}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {topicBusy && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {topicJob?.jobId
                      ? "Assembling your topic practice. You can refresh — this job will resume."
                      : "Starting topic practice…"}
                  </p>
                  <GovPaperReviewGenerationTimer session={topicGenerationSession} />
                </div>
              )}
              {topicJobRetryable && !topicBusy && (
                <p className="text-sm text-muted-foreground">
                  {topicJob?.errorMessage ??
                    topicJob?.error ??
                    "Generation paused. Retry continues the same reserved job."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    topicBusy ||
                    selectedTopics.length === 0 ||
                    topicJobRetryable ||
                    ("reason" in topicCreditGate &&
                      topicCreditGate.reason === "unknown_balance")
                  }
                  onClick={() => void startTopicPractice()}
                >
                  {topicBusy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {topicCreditsInsufficient
                    ? `Top up to start (${CREATE_EXAM_PAPER_CREDIT_COST} credits)`
                    : topicCreditGate.allowed
                      ? `Start topic practice (${CREATE_EXAM_PAPER_CREDIT_COST} credits)`
                      : "Checking credits…"}
                </Button>
                {topicJobRetryable && (
                  <Button
                    variant="secondary"
                    disabled={topicBusy}
                    onClick={() => void retryTopicPractice()}
                  >
                    Retry same job
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={!stage}
                  onClick={() =>
                    navigate(
                      `${generateBase}&basis=topic${
                        selectedTopics.length
                          ? `&topics=${encodeURIComponent(selectedTopics.join(","))}`
                          : ""
                      }`,
                    )
                  }
                >
                  Open generator
                </Button>
              </div>
              {topicCreditsInsufficient && (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
                  role="alert"
                >
                  <p className="text-amber-800 dark:text-amber-200">
                    You need {CREATE_EXAM_PAPER_CREDIT_COST} credits, but only have{" "}
                    {topicCreditGate.balance ?? 0}. Top up or upgrade to continue.
                  </p>
                  <Link
                    to="/app/settings/billing"
                    className="mt-2 inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-secondary"
                  >
                    Billing settings
                  </Link>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{customLabel}</p>
            </section>
          )}

          {tab === "plan" && !tabLoading && (
            <div className="space-y-4">
              <GovExamReadinessPanel
                examName={exam!.name}
                examCode={exam!.code}
                readiness={readiness}
                masteryRows={masteryRows}
                generateHref={`${generateBase}&basis=topic`}
              />
              <section className="rounded-xl border border-border p-5 space-y-3">
                <h3 className="text-sm font-semibold">Preparation plan</h3>
                {!user?.id ? (
                  <p className="text-sm text-muted-foreground">
                    Sign in to load your personal plan.
                  </p>
                ) : !prepPlan || prepPlan.plan_json?.empty ? (
                  <p className="text-sm text-muted-foreground">
                    No plan yet. Finish a scored practice paper linked to this exam to unlock
                    focus topics and a next action.
                  </p>
                ) : (
                  <>
                    {prepPlan.plan_json.next_action && (
                      <p className="text-sm text-foreground/90">
                        {String(prepPlan.plan_json.next_action)}
                      </p>
                    )}
                    {typeof prepPlan.plan_json.readiness_score === "number" && (
                      <p className="text-xs text-muted-foreground">
                        Plan readiness score: {Math.round(prepPlan.plan_json.readiness_score)}{" "}
                        (from your attempts · not a percentile)
                      </p>
                    )}
                    {Array.isArray(prepPlan.plan_json.focus_topics) &&
                      prepPlan.plan_json.focus_topics.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5">
                          {prepPlan.plan_json.focus_topics.map((t) => (
                            <li
                              key={t.topic}
                              className="rounded-md border border-border px-2 py-1 text-xs"
                            >
                              {t.topic}
                              <span className="text-muted-foreground">
                                {" "}
                                · {t.state}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                  </>
                )}
              </section>
            </div>
          )}

          {tab === "analytics" && !tabLoading && (
            <div className="space-y-4">
              <GovExamReadinessPanel
                examName={exam!.name}
                examCode={exam!.code}
                readiness={readiness}
                masteryRows={masteryRows}
                compact
                generateHref={`${generateBase}&basis=topic`}
              />
              {trends && (
                <section className="space-y-3 rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold">
                    Topic trends ({trends.algorithmVersion})
                  </h3>
                  {trends.patternShift?.material && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Material pattern shift detected ({trends.patternShift.changes.join(", ")}).
                      Historical weights damped by factor{" "}
                      {trends.patternShift.historicalWeightFactor}.
                    </p>
                  )}
                  {trends.empty ? (
                    <p className="text-sm text-muted-foreground">
                      {trends.message ?? "No PYQ topic data available yet."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {trends.topics.slice(0, 15).map((t) => (
                        <li
                          key={t.topic}
                          className="flex justify-between text-sm border-b border-border/50 pb-2"
                        >
                          <span>{t.topic}</span>
                          <span className="text-muted-foreground">
                            n={t.rawCount} · w={t.weightedFrequency.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">{trends.disclaimer}</p>
                </section>
              )}
              <Link
                to="/app/mock-test/analytics"
                className="inline-flex text-sm text-primary hover:underline"
              >
                Open full mock analytics →
              </Link>
            </div>
          )}

          {tab === "sources" && (
            <section className="space-y-3 rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold">Official sources</h3>
              <p className="text-xs text-muted-foreground">
                Link-first provenance from the registry. Career Pilot does not display government
                logos or claim affiliation.
              </p>
              {details.officialSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved official sources listed yet.
                  {details.body?.officialUrl ? (
                    <>
                      {" "}
                      <a
                        href={details.body.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Recruiting body website
                      </a>
                    </>
                  ) : null}
                </p>
              ) : (
                <ul className="space-y-2">
                  {details.officialSources.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      {s.sourceUrl ? (
                        <a
                          href={s.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {s.title}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>{s.title}</span>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.documentType}
                        {s.publicationDate
                          ? ` · Published ${formatVerifiedDate(s.publicationDate)}`
                          : ""}
                        {s.language ? ` · ${s.language}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                {affiliation}
              </p>
            </section>
          )}
        </>
      )}
    </div>
    </GovExamPageShell>
  );
}

function ExamOnboardingCard({
  examId,
  stageId,
}: {
  examId: string;
  stageId: string | null;
}): React.ReactElement {
  const { user } = useAuthStore();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [attemptDate, setAttemptDate] = useState("");
  const [level, setLevel] = useState("beginner");
  const [hours, setHours] = useState("10");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("user_gov_exam_preferences").upsert(
        {
          user_id: user.id,
          target_exam_id: examId,
          target_stage_id: stageId,
          target_year: Number(year) || null,
          attempt_date: attemptDate || null,
          preparation_level: level,
          weekly_study_hours: Number(hours) || null,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success("Exam prep preferences saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Your exam onboarding</h3>
      <p className="text-xs text-muted-foreground">
        Official dates and vacancies come only from verified sources on this page — never generated.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Target year
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Attempt date
          <input
            type="date"
            value={attemptDate}
            onChange={(e) => setAttemptDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Preparation level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Weekly study hours
          <input
            type="number"
            min={1}
            max={80}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save preferences"}
      </Button>
    </section>
  );
}

function SyllabusTopics({ topics }: { topics: unknown }): React.ReactElement {
  if (!Array.isArray(topics) || topics.length === 0) {
    return <p className="text-sm text-muted-foreground">No syllabus topics published yet.</p>;
  }
  return (
    <ul className="space-y-2 max-h-96 overflow-y-auto">
      {topics.map((item, idx) => {
        if (typeof item === "string") {
          return (
            <li key={idx} className="text-sm">
              {item}
            </li>
          );
        }
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const name = String(o.name ?? o.topic ?? o.title ?? `Topic ${idx + 1}`);
          const children = Array.isArray(o.topics)
            ? o.topics
            : Array.isArray(o.children)
              ? o.children
              : null;
          return (
            <li key={idx} className="text-sm">
              <span className="font-medium">{name}</span>
              {children && (
                <ul className="ml-3 mt-1 space-y-0.5 text-muted-foreground">
                  {children.slice(0, 20).map((c, j) => (
                    <li key={j}>
                      {typeof c === "string"
                        ? c
                        : String(
                          (c as Record<string, unknown>)?.name ??
                            (c as Record<string, unknown>)?.topic ??
                            c,
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        }
        return (
          <li key={idx} className="text-sm text-muted-foreground">
            {String(item)}
          </li>
        );
      })}
    </ul>
  );
}
