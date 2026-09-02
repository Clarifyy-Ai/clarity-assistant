import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  Minus,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import {
  RANK_UNAVAILABLE_COPY,
  resolveRankPublication,
  scoreBandLabel,
} from "@/lib/gov-exam/rankAvailability";
import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import {
  planHasFeature,
  type PlanId,
} from "@/lib/billing/subscriptionManager";
import { buildAttemptInsightSentence } from "@/lib/gov-exam/masteryEngine";
import { GovExamReadinessPanel } from "@/components/gov-exam/GovExamReadinessPanel";
import {
  fetchExamReadiness,
  fetchTopicMasteryForExam,
} from "@/lib/gov-exam/masteryClient";
import type { ExamReadinessSummary, TopicMasterySummary } from "@/lib/gov-exam/api";
import { reportQuestion } from "@/lib/gov-exam/api";
import {
  primaryActionInsight,
  resolvePaperClassPresentation,
} from "@/lib/gov-exam/disclaimers";
import { shouldRevealAnswerKeys } from "@/lib/gov-exam/playableQuestions";
import {
  clampMockTestDisplayScore,
} from "@/lib/gov-exam/mockTestScoring";

type QuestionFilter = "all" | "wrong" | "marked";

interface SubjectBreakdown {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
  marks?: number;
}

interface TopicBreakdown {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
  avg_time?: number;
}

interface TimeTrap {
  question_id: string;
  time_seconds: number;
}

interface TimeAnalysis {
  avg_seconds: number;
  time_traps: TimeTrap[];
  score_summary?: {
    score_percentage?: number;
  };
}

interface TestAnalysis {
  test_id: string;
  total_score: number;
  max_score: number;
  accuracy: number;
  attempt_percentage: number;
  subject_breakdown: Record<string, SubjectBreakdown>;
  topic_breakdown: Record<string, TopicBreakdown>;
  weak_topics: string[];
  strong_topics: string[];
  time_analysis: TimeAnalysis;
  predicted_percentile: number | null;
  ai_analysis_text?: string | null;
}

interface MockTest {
  id: string;
  test_name: string;
  question_ids: string[];
  status: string;
  config?: Record<string, unknown> | null;
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  correct_answer: string;
  explanation?: string | null;
  subject: string;
  topic: string;
  difficulty: string;
}

interface TestResponse {
  question_id: string;
  user_answer: string | null;
  is_correct: boolean | null;
  is_attempted: boolean | null;
  is_marked_review: boolean | null;
  time_spent_seconds: number | null;
}

function isLikelyGuessed(timeSpent: number, avgTime: number): boolean {
  return timeSpent > 0 && avgTime > 0 && timeSpent < Math.max(10, avgTime * 0.3);
}

function getRankPublication(analysis: TestAnalysis, test: MockTest) {
  return resolveRankPublication({
    cohortSize: Number(test.config?.cohort_size ?? 0),
    percentile: analysis.predicted_percentile,
    rank: typeof test.config?.published_rank === "number" ? test.config.published_rank : null,
    status: typeof test.config?.rank_status === "string" ? test.config.rank_status : "unavailable",
  });
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function questionIdsFromUnknown(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const ids = (payload as { question_ids?: unknown }).question_ids;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
}

export default function TestResults() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const openUpgradeModal = useUIStore((s) => s.openUpgradeModal);
  const userPlan = (profile?.plan_id ?? profile?.plan ?? "free") as PlanId;
  const canUseAiQuestions = planHasFeature(userPlan, "mock_test_ai");

  const [test, setTest] = useState<MockTest | null>(null);
  const [analysis, setAnalysis] = useState<TestAnalysis | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Record<string, TestResponse>>({});
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>("all");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [creatingRecommendation, setCreatingRecommendation] = useState<
    "weak" | "similar" | "hard" | null
  >(null);
  const [readiness, setReadiness] = useState<ExamReadinessSummary | null>(null);
  const [masteryRows, setMasteryRows] = useState<TopicMasterySummary[]>([]);
  const [attemptInsight, setAttemptInsight] = useState<string | null>(null);

  useEffect(() => {
    if (!testId || !user?.id) return;
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, user?.id]);

  async function fetchAnalysisWithRetry(): Promise<Record<string, unknown> | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data } = await supabase
        .from("test_analyses")
        .select("*")
        .eq("test_id", testId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (data) return data as Record<string, unknown>;
      await new Promise((r) => setTimeout(r, 400 + attempt * 300));
    }
    return null;
  }

  async function loadResults() {
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

      if (!shouldRevealAnswerKeys(loadedTest.status)) {
        const source =
          loadedTest.config && typeof loadedTest.config === "object" && "source" in loadedTest.config
            ? String((loadedTest.config as { source?: string }).source ?? "")
            : "";
        navigate(
          source === "exam_template"
            ? `/app/assessments/session/${loadedTest.id}`
            : `/app/mock-test/session/${loadedTest.id}`,
          { replace: true },
        );
        return;
      }

      const analysisData = await fetchAnalysisWithRetry();
      if (!analysisData) {
        toast.error("Analysis is still processing. Refresh the page in a few seconds.");
        navigate("/app/mock-test");
        return;
      }

      const loadedAnalysis = analysisData as unknown as TestAnalysis;

      const { data: questionRows, error: questionError } = await supabase
        .from("questions")
        .select(
          "id, question_text, question_type, correct_answer, explanation, subject, topic, difficulty"
        )
        .in("id", loadedTest.question_ids);

      if (questionError) throw questionError;

      const questionMap: Record<string, Question> = {};
      for (const row of questionRows ?? []) {
        const question = row as unknown as Question;
        questionMap[question.id] = question;
      }

      const paperId = String(loadedTest.config?.gov_paper_id ?? "").trim();
      if (paperId) {
        const { data: frozenRows } = await supabase
          .from("gov_generated_paper_questions")
          .select("question_id, snapshot_json")
          .eq("paper_id", paperId);
        for (const row of frozenRows ?? []) {
          const record = row as {
            question_id: string;
            snapshot_json: Record<string, unknown> | null;
          };
          const snapshot = record.snapshot_json;
          if (!snapshot) continue;
          const live = questionMap[record.question_id];
          questionMap[record.question_id] = {
            id: record.question_id,
            question_text: String(snapshot.question_text ?? live?.question_text ?? ""),
            question_type: String(snapshot.question_type ?? live?.question_type ?? "MCQ"),
            correct_answer: String(snapshot.correct_answer ?? live?.correct_answer ?? ""),
            explanation: String(snapshot.explanation ?? live?.explanation ?? ""),
            subject: String(snapshot.subject ?? live?.subject ?? "General"),
            topic: String(snapshot.topic ?? live?.topic ?? "General"),
            difficulty: String(snapshot.difficulty ?? live?.difficulty ?? "MEDIUM"),
          };
        }
      }

      const orderedQuestions = loadedTest.question_ids
        .map((id) => questionMap[id])
        .filter(Boolean);

      if (orderedQuestions.length < loadedTest.question_ids.length) {
        toast.warning(
          `Showing ${orderedQuestions.length} of ${loadedTest.question_ids.length} questions. Refresh if some are still loading.`,
        );
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? "";

      const responseFetch = await fetch(
        `${SUPABASE_URL}/rest/v1/test_responses?select=question_id,user_answer,is_correct,is_attempted,is_marked_review,time_spent_seconds&test_id=eq.${testId}&user_id=eq.${user!.id}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const responseRows: TestResponse[] = responseFetch.ok
        ? ((await responseFetch.json()) as TestResponse[])
        : [];

      const responseMap: Record<string, TestResponse> = {};
      for (const row of responseRows) {
        responseMap[row.question_id] = row;
      }

      setTest(loadedTest);
      setAnalysis(loadedAnalysis);
      setQuestions(orderedQuestions);
      setResponses(responseMap);

      setAttemptInsight(
        buildAttemptInsightSentence({
          subjectBreakdown: loadedAnalysis.subject_breakdown,
          weakTopics: loadedAnalysis.weak_topics,
          accuracy: loadedAnalysis.accuracy,
        }),
      );

      const govExamId = String(
        loadedTest.config?.gov_exam_id ?? loadedTest.config?.exam_id ?? "",
      ).trim();
      const govStageId = String(
        loadedTest.config?.gov_stage_id ?? loadedTest.config?.stage_id ?? "",
      ).trim();
      if (govExamId && user?.id) {
        const [ready, mastery] = await Promise.all([
          fetchExamReadiness(user.id, govExamId, govStageId || null).catch(() => null),
          fetchTopicMasteryForExam(user.id, govExamId).catch(() => []),
        ]);
        setReadiness(ready);
        setMasteryRows(mastery);
      } else {
        setReadiness(null);
        setMasteryRows([]);
      }
    } catch (error) {
      console.error("[TestResults] load error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load results.");
    } finally {
      setLoading(false);
    }
  }

  async function generateAIAnalysis() {
    if (!testId) return;

    setAiLoading(true);

    try {
      const data = await fetchEdgeJson<{
        analysis?: string;
        ai_analysis_text?: string;
        error?: string;
      }>("analyze-test-performance", { test_id: testId });

      if (data.error) throw new Error(data.error);

      const nextText = data.analysis ?? data.ai_analysis_text ?? "";

      if (!nextText) throw new Error("AI analysis returned empty content.");

      setAnalysis((prev) =>
        prev
          ? {
              ...prev,
              ai_analysis_text: nextText,
            }
          : prev
      );

      setShowAI(true);
      toast.success("AI analysis generated.");
    } catch (error) {
      console.error("[TestResults] AI analysis error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate AI analysis."
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function createRecommendedTest(kind: "weak" | "similar" | "hard") {
    if (!test || !analysis) return;

    const usesAi = kind === "weak" || kind === "hard";
    if (usesAi && !canUseAiQuestions) {
      openUpgradeModal("pro");
      toast.info("AI-assisted practice papers require a Pro plan or higher.");
      return;
    }

    setCreatingRecommendation(kind);

    try {
      const originalConfig = test.config ?? {};
      const examType =
        typeof originalConfig.exam_type === "string"
          ? originalConfig.exam_type
          : "CUSTOM";

      const subjects = Array.isArray(originalConfig.subjects)
        ? (originalConfig.subjects as string[])
        : [];

      const questionCount =
        normalizeNumber(originalConfig.question_count, test.question_ids.length || 20) || 20;

      const durationMinutes = normalizeNumber(originalConfig.duration_minutes, 60);

      const baseConfig = {
        exam_type: examType,
        test_name:
          kind === "weak"
            ? `${test.test_name} - Weak Topics Focus`
            : kind === "similar"
            ? `${test.test_name} - Similar Paper`
            : `${test.test_name} - Challenge Mode`,
        subjects,
        topics:
          kind === "weak"
            ? (analysis.weak_topics ?? []).slice(0, 3)
            : [],
        source_types:
          kind === "similar"
            ? ["OFFICIAL_PYP"]
            : kind === "hard"
            ? ["OFFICIAL_PYP", "AI_GENERATED"]
            : ["OFFICIAL_PYP", "AI_GENERATED", "USER_UPLOAD"],
        year_range: null,
        difficulty_distribution:
          kind === "hard"
            ? { EASY: 0, MEDIUM: 20, HARD: 80 }
            : kind === "weak"
            ? { EASY: 20, MEDIUM: 50, HARD: 30 }
            : { EASY: 20, MEDIUM: 60, HARD: 20 },
        question_count:
          kind === "weak" ? Math.min(questionCount, 10) : questionCount,
        duration_minutes: durationMinutes,
        marks_positive: normalizeNumber(originalConfig.marks_positive, 4),
        marks_negative: normalizeNumber(originalConfig.marks_negative, 0),
        randomize_order: true,
        shuffle_options: true,
        allow_shortfall: true,
        practice_mode: kind === "weak",
      };

      let questionIds: string[] = [];
      try {
        const selectData = await fetchEdgeJson<{
          question_ids?: string[];
          error?: string;
        }>("select-test-questions", { config: baseConfig }, { timeoutMs: 90_000 });

        if (selectData.error) throw new Error(selectData.error);

        questionIds = Array.isArray(selectData.question_ids)
          ? selectData.question_ids.filter((id): id is string => typeof id === "string")
          : [];
      } catch (error) {
        const fromDetails =
          error instanceof ApiClientError
            ? questionIdsFromUnknown(error.details)
            : [];
        if (fromDetails.length === 0) throw error;
        questionIds = fromDetails;
      }

      if (questionIds.length === 0) {
        throw new Error("No questions available for this recommended test.");
      }

      const createData = await fetchEdgeJson<{
        test_id?: string;
        test?: { id?: string };
        error?: string;
      }>("create-test", {
        test_name: baseConfig.test_name,
        config: baseConfig,
        question_ids: questionIds,
      });

      if (createData.error) throw new Error(createData.error);

      const nextTestId = createData.test_id ?? createData.test?.id;

      if (!nextTestId) throw new Error("No test ID returned.");

      toast.success("Recommended test created.");
      navigate(`/app/mock-test/session/${nextTestId}`);
    } catch (error) {
      console.error("[TestResults] create recommendation failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create recommended test."
      );
    } finally {
      setCreatingRecommendation(null);
    }
  }

  const subjectBreakdown = analysis?.subject_breakdown ?? {};
  const topicBreakdown = analysis?.topic_breakdown ?? {};
  const avgTime = analysis?.time_analysis?.avg_seconds ?? 0;

  const timeTrapsSet = useMemo(() => {
    const ids = new Set<string>();
    for (const trap of analysis?.time_analysis?.time_traps ?? []) {
      ids.add(trap.question_id);
    }
    return ids;
  }, [analysis?.time_analysis?.time_traps]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const response = responses[question.id];

      if (topicFilter && question.topic !== topicFilter) return false;

      if (questionFilter === "wrong") {
        return Boolean(response?.is_attempted) && response?.is_correct === false;
      }

      if (questionFilter === "marked") {
        return Boolean(response?.is_marked_review);
      }

      return true;
    });
  }, [questions, responses, questionFilter, topicFilter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!test || !analysis) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Results not found.</p>
        <Link
          to="/app/mock-test"
          className="mt-2 inline-block text-primary hover:underline"
        >
          Back to Hub
        </Link>
      </div>
    );
  }

  const rankPublication = getRankPublication(analysis, test);
  // Submitted analysis is immutable and authoritative; never re-score mutable question rows.
  const rawTotalScore = analysis.total_score ?? 0;
  const displayTotalScore = clampMockTestDisplayScore(rawTotalScore);
  const displayMaxScore = analysis.max_score ?? 0;
  const displayAccuracy = analysis.accuracy ?? 0;
  const displayAttemptPercentage = analysis.attempt_percentage ?? 0;
  const scorePercent =
    Number.isFinite(Number(analysis.time_analysis?.score_summary?.score_percentage))
      ? Math.max(0, Number(analysis.time_analysis.score_summary?.score_percentage))
      : displayMaxScore > 0
      ? Math.round((displayTotalScore / displayMaxScore) * 100)
      : 0;
  const isPractice = test.config?.practice_mode === true;
  const paperMeta = resolvePaperClassPresentation(test.config);
  const actionInsight = primaryActionInsight({
    weak_topics: analysis.weak_topics,
    strong_topics: analysis.strong_topics,
    subject_breakdown: analysis.subject_breakdown,
    topic_breakdown: analysis.topic_breakdown,
  });

  return (
    <div className="max-w-4xl space-y-6 pb-16">
      <PageHeader
        title={isPractice ? "Practice Session Results" : "Test Results"}
        description={test.test_name}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/app/mock-test")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Hub
          </Button>
        }
      />

      {(paperMeta.shortLabel || paperMeta.disclaimer) && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 space-y-1">
          {paperMeta.shortLabel && (
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {paperMeta.shortLabel}
            </p>
          )}
          {paperMeta.disclaimer && (
            <p className="text-xs text-muted-foreground leading-relaxed">{paperMeta.disclaimer}</p>
          )}
        </div>
      )}

      {actionInsight && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next focus</p>
              <p className="mt-1 text-sm font-medium text-foreground">{actionInsight}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Score",
            value: `${displayTotalScore}/${displayMaxScore}`,
            footnote:
              rawTotalScore < 0
                ? `Raw score: ${rawTotalScore} (displayed as 0)`
                : undefined,
            icon: <Trophy className="h-5 w-5 text-amber-400" />,
            color: "text-amber-400",
          },
          {
            label: "Accuracy",
            value: `${displayAccuracy}%`,
            icon: <Target className="h-5 w-5 text-green-400" />,
            color: "text-green-400",
          },
          {
            label: "Attempted",
            value: `${displayAttemptPercentage}%`,
            icon: <CheckCircle className="h-5 w-5 text-blue-400" />,
            color: "text-blue-400",
          },
          {
            label: "Ranking",
            value: rankPublication.rank_status === "unavailable"
              ? RANK_UNAVAILABLE_COPY
              : `Rank ${rankPublication.rank} · P${rankPublication.percentile}`,
            icon: <TrendingUp className="h-5 w-5 text-primary" />,
            color: "text-primary",
          },
        ].map((item) => (
          <Card key={item.label} className="py-4 text-center">
            <CardContent className="space-y-1 p-0">
              <div className="flex justify-center">{item.icon}</div>
              <p className={cn("text-xl font-black", item.color)}>{item.value}</p>
              {"footnote" in item && item.footnote ? (
                <p className="text-[10px] leading-tight text-muted-foreground">{item.footnote}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {attemptInsight && (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="py-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Next action</p>
            <p className="text-sm text-foreground">{attemptInsight}</p>
          </CardContent>
        </Card>
      )}

      {String(test.config?.gov_exam_id ?? "").trim() && (
        <GovExamReadinessPanel
          examName={test.test_name}
          readiness={readiness}
          masteryRows={masteryRows}
          generateHref={`/app/mock-test/generate?examId=${String(test.config?.gov_exam_id)}&stageId=${String(test.config?.gov_stage_id ?? "")}&basis=topic`}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Score band</p>
              <p className="font-bold text-foreground">{scoreBandLabel(scorePercent)}</p>
              <p className="text-[10px] text-muted-foreground">{RANK_UNAVAILABLE_COPY}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
              <Clock className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg per Question</p>
              <p className="font-bold text-foreground">{avgTime}s</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time Traps</p>
              <p className="font-bold text-foreground">{timeTrapsSet.size}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {Object.keys(subjectBreakdown).length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Subject Breakdown</h3>
            <div className="overflow-x-auto">
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 text-left">Subject</th>
                    <th className="pb-2 text-right">Correct</th>
                    <th className="pb-2 text-right">Wrong</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-right">Accuracy</th>
                    <th className="pb-2 text-right">Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(subjectBreakdown).map(([subject, data]) => (
                    <tr key={subject}>
                      <td className="py-2 font-medium text-foreground">{subject}</td>
                      <td className="py-2 text-right text-green-400">{data.correct}</td>
                      <td className="py-2 text-right text-red-400">{data.wrong}</td>
                      <td className="py-2 text-right text-muted-foreground">{data.total}</td>
                      <td
                        className={cn(
                          "py-2 text-right font-semibold",
                          data.accuracy >= 70
                            ? "text-green-400"
                            : data.accuracy >= 40
                            ? "text-amber-400"
                            : "text-red-400"
                        )}
                      >
                        {data.accuracy}%
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-semibold",
                          Number(data.marks ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                        )}
                      >
                        {Number(data.marks ?? 0) >= 0 ? "+" : ""}
                        {Number(data.marks ?? 0).toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </CardContent>
        </Card>
      )}

      {Object.keys(topicBreakdown).length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Topic Accuracy Heatmap</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Click a topic to filter the review below.
            </p>

            <div className="flex flex-wrap gap-2">
              {Object.entries(topicBreakdown).map(([topic, data]) => {
                const accuracy = data.accuracy ?? 0;

                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setTopicFilter(topicFilter === topic ? null : topic)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                      topicFilter === topic ? "ring-2 ring-primary" : "",
                      accuracy >= 80
                        ? "border-green-500/30 bg-green-500/20 text-green-400"
                        : accuracy >= 50
                        ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                        : data.attempted > 0
                        ? "border-red-500/30 bg-red-500/20 text-red-400"
                        : "border-border bg-muted/30 text-muted-foreground"
                    )}
                    title={`${topic}: ${data.correct}/${data.attempted} (${accuracy}%)`}
                  >
                    {topic}
                    {data.attempted > 0 && <span className="ml-1 opacity-70">{accuracy}%</span>}
                  </button>
                );
              })}
            </div>

            {topicFilter && (
              <button
                type="button"
                onClick={() => setTopicFilter(null)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear filter
              </button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/30">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">AI Coach Analysis</h3>

              {analysis.ai_analysis_text && (
                <span className="rounded-full border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                  Ready
                </span>
              )}
            </div>

            {analysis.ai_analysis_text ? (
              <button
                type="button"
                onClick={() => setShowAI((prev) => !prev)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAI ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {showAI ? "Collapse" : "Expand"}
              </button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void generateAIAnalysis()}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                )}
                Generate ({AI_CREDIT_COSTS.analyze_test_performance} credits)
              </Button>
            )}
          </div>

          {showAI && analysis.ai_analysis_text && (
            <div className="mt-4 space-y-3">
              {analysis.ai_analysis_text
                .split(/^##\s/m)
                .filter(Boolean)
                .map((section, index) => {
                  const lines = section.split("\n");
                  const heading = lines[0]?.trim() || `Insight ${index + 1}`;
                  const content = lines.slice(1).join("\n").trim();

                  return (
                    <div
                      key={`${heading}-${index}`}
                      className="rounded-xl border border-border bg-muted/10 p-4"
                    >
                      <h4 className="mb-2 text-sm font-bold text-primary">{heading}</h4>
                      <p className="whitespace-pre-wrap text-sm text-foreground/80">
                        {content}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}

          {aiLoading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating analysis...
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-black text-foreground">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Based on your performance, try these next:
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="cursor-pointer bg-gradient-to-br from-background to-red-500/5 transition-colors hover:border-primary/50">
            <CardContent className="flex h-full flex-col items-start p-5">
              <div className="mb-3 rounded-lg bg-red-500/10 p-2 text-red-500">
                <Target className="h-5 w-5" />
              </div>
              <h4 className="mb-1 text-base font-bold">Target Weaknesses</h4>
              <p className="mb-4 text-xs text-muted-foreground">
                Focus on your weakest topics:{" "}
                {analysis.weak_topics?.slice(0, 2).join(", ") || "Mixed topics"}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-auto w-full"
                onClick={() => void createRecommendedTest("weak")}
                disabled={creatingRecommendation !== null}
              >
                {creatingRecommendation === "weak" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Start Practice
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer bg-gradient-to-br from-background to-blue-500/5 transition-colors hover:border-primary/50">
            <CardContent className="flex h-full flex-col items-start p-5">
              <div className="mb-3 rounded-lg bg-blue-500/10 p-2 text-blue-500">
                <BookOpen className="h-5 w-5" />
              </div>
              <h4 className="mb-1 text-base font-bold">Similar Exam Paper</h4>
              <p className="mb-4 text-xs text-muted-foreground">
                Create another paper with the same exam profile to benchmark consistency.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-auto w-full"
                onClick={() => void createRecommendedTest("similar")}
                disabled={creatingRecommendation !== null}
              >
                {creatingRecommendation === "similar" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Browse Similar
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer bg-gradient-to-br from-background to-purple-500/5 transition-colors hover:border-primary/50">
            <CardContent className="flex h-full flex-col items-start p-5">
              <div className="mb-3 rounded-lg bg-purple-500/10 p-2 text-purple-500">
                <Trophy className="h-5 w-5" />
              </div>
              <h4 className="mb-1 text-base font-bold">Challenge Mode</h4>
              <p className="mb-4 text-xs text-muted-foreground">
                Push harder with a tougher distribution tilted toward HARD questions.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-auto w-full"
                onClick={() => void createRecommendedTest("hard")}
                disabled={creatingRecommendation !== null}
              >
                {creatingRecommendation === "hard" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Launch Hard Mode
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Question Review</h3>

            <div className="flex gap-1">
              {(["all", "wrong", "marked"] as QuestionFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setQuestionFilter(filter)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-all",
                    questionFilter === filter
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredQuestions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No questions match the selected filter.
              </p>
            ) : (
              filteredQuestions.map((question) => {
                const response = responses[question.id];
                return (
                  <QuestionReviewCard
                    key={question.id}
                    number={questions.findIndex((q) => q.id === question.id) + 1}
                    question={question}
                    response={response}
                    isTimeTrap={timeTrapsSet.has(question.id)}
                    isGuessed={
                      isLikelyGuessed(Number(response?.time_spent_seconds ?? 0), avgTime) &&
                      Boolean(response?.is_attempted)
                    }
                    paperId={
                      String(test.config?.gov_paper_id ?? test.config?.paper_id ?? "").trim() ||
                      undefined
                    }
                  />
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => navigate("/app/mock-test")}
          className="flex-1"
        >
          Back to Hub
        </Button>

        <Button
          onClick={() => navigate("/app/mock-test/revision")}
          className="flex-1"
        >
          Revision List
          <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface QuestionReviewCardProps {
  number: number;
  question: Question;
  response?: TestResponse;
  isTimeTrap: boolean;
  isGuessed: boolean;
  paperId?: string;
}

function QuestionReviewCard({
  number,
  question,
  response,
  isTimeTrap,
  isGuessed,
  paperId,
}: QuestionReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  const isCorrect = Boolean(response?.is_correct);
  const isAttempted = Boolean(response?.is_attempted);

  async function handleReport() {
    if (reporting || reported) return;
    setReporting(true);
    try {
      await reportQuestion({
        questionId: question.id,
        reason: "poor_quality",
        notes: `Reported from test results review (${question.subject} / ${question.topic})`,
        paperId,
      });
      setReported(true);
      toast.success("Issue reported. Thanks for helping improve the bank.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not report question.");
    } finally {
      setReporting(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-4 transition-all",
        isCorrect
          ? "border-green-500/20 bg-green-500/5"
          : isAttempted
          ? "border-red-500/20 bg-red-500/5"
          : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
          {number}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {isCorrect ? (
              <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
            ) : isAttempted ? (
              <XCircle className="h-4 w-4 shrink-0 text-red-400" />
            ) : (
              <Minus className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}

            <span className="text-xs text-muted-foreground">
              {question.subject} · {question.topic}
            </span>

            {isTimeTrap && (
              <span className="rounded-full border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                Time trap
              </span>
            )}

            {isGuessed && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                Likely guessed
              </span>
            )}
          </div>

          <p className="text-sm text-foreground">{question.question_text}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            disabled={reporting || reported}
            onClick={() => void handleReport()}
          >
            {reporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            )}
            {reported ? "Reported" : "Report issue"}
          </Button>
          <button type="button" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-9 space-y-2 text-sm">
          {isAttempted && (
            <p className="text-muted-foreground">
              Your answer:{" "}
              <span className={cn("font-semibold", isCorrect ? "text-green-400" : "text-red-400")}>
                {response?.user_answer ?? "—"}
              </span>
              {Number(response?.time_spent_seconds ?? 0) > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({response?.time_spent_seconds}s)
                </span>
              )}
            </p>
          )}

          <p className="text-muted-foreground">
            Correct answer:{" "}
            <span className="font-semibold text-green-400">
              {question.correct_answer}
            </span>
          </p>

          {question.explanation && (
            <div className="rounded-lg bg-muted/20 p-3 text-xs text-foreground/80">
              <span className="mb-1 block font-semibold text-primary">
                Explanation
              </span>
              {question.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
