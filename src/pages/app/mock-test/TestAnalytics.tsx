import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Flame,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

interface MockTestSummary {
  id: string;
  test_name: string;
  created_at: string;
}

interface SubjectBreakdownEntry {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
}

interface TestAnalysisSummary {
  test_id: string;
  total_score: number;
  max_score: number;
  accuracy: number;
  attempt_percentage: number;
  subject_breakdown: Record<string, SubjectBreakdownEntry>;
  topic_breakdown: Record<string, unknown>;
  created_at: string;
}

interface TopicPerformance {
  topic: string;
  subject: string;
  accuracy: number;
  total_attempted: number;
  total_correct: number;
  last_practiced: string;
}

interface TrendDataPoint {
  name: string;
  accuracy: number;
  score_pct: number;
  [subject: string]: number | string;
}

const SUBJECT_COLORS = [
  "#8b5cf6",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
];

export default function TestAnalytics() {
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<MockTestSummary[]>([]);
  const [analyses, setAnalyses] = useState<TestAnalysisSummary[]>([]);
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadData() {
    setLoading(true);

    try {
      const [testsRes, analysesRes, topicRes] = await Promise.all([
        supabase
          .from("mock_tests")
          .select("id, test_name, created_at")
          .eq("user_id", user!.id)
          .eq("status", "COMPLETED")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("test_analyses")
          .select(
            "test_id, total_score, max_score, accuracy, attempt_percentage, subject_breakdown, topic_breakdown, created_at"
          )
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("user_topic_performance")
          .select(
            "topic, subject, accuracy, total_attempted, total_correct, last_practiced"
          )
          .eq("user_id", user!.id)
          .order("accuracy", { ascending: true })
          .limit(100),
      ]);

      if (testsRes.error) throw testsRes.error;
      if (analysesRes.error) throw analysesRes.error;
      if (topicRes.error) throw topicRes.error;

      setTests((testsRes.data ?? []) as MockTestSummary[]);
      setAnalyses((analysesRes.data ?? []) as unknown as TestAnalysisSummary[]);
      setTopicPerformance((topicRes.data ?? []) as TopicPerformance[]);
    } catch (error) {
      console.error("[TestAnalytics] load failed:", error);
      toast.error("Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  const testNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const test of tests) {
      map[test.id] = test.test_name;
    }
    return map;
  }, [tests]);

  const allSubjects = useMemo(
    () =>
      [
        ...new Set(
          analyses.flatMap((analysis) =>
            Object.keys(analysis.subject_breakdown ?? {})
          )
        ),
      ].slice(0, 5),
    [analyses]
  );

  const trendData: TrendDataPoint[] = useMemo(() => {
    return [...analyses]
      .reverse()
      .slice(-10)
      .map((analysis, index) => {
        const point: TrendDataPoint = {
          name: (testNameMap[analysis.test_id] ?? `Test ${index + 1}`).slice(0, 12),
          accuracy: Number(analysis.accuracy ?? 0),
          score_pct:
            Number(analysis.max_score ?? 0) > 0
              ? Math.round(
                  (Number(analysis.total_score ?? 0) / Number(analysis.max_score ?? 1)) *
                    100
                )
              : 0,
        };

        for (const subject of allSubjects) {
          point[subject] = analysis.subject_breakdown?.[subject]?.accuracy ?? 0;
        }

        return point;
      });
  }, [analyses, allSubjects, testNameMap]);

  const weakTopics = useMemo(
    () =>
      topicPerformance
        .filter((topic) => topic.total_attempted > 0 && topic.accuracy < 60)
        .slice(0, 8),
    [topicPerformance]
  );

  const strongTopics = useMemo(
    () =>
      topicPerformance
        .filter((topic) => topic.total_attempted > 0 && topic.accuracy >= 80)
        .slice(0, 5),
    [topicPerformance]
  );

  const personalAverageAccuracy = useMemo(() => {
    if (analyses.length === 0) return 0;
    return Math.round(
      analyses.reduce((sum, analysis) => sum + Number(analysis.accuracy ?? 0), 0) /
        analyses.length
    );
  }, [analyses]);

  const latestAccuracy = analyses[0]?.accuracy ?? 0;
  const improvementVsAverage =
    analyses.length > 1 ? Math.round(latestAccuracy - personalAverageAccuracy) : 0;

  const milestones = useMemo(() => {
    const items: string[] = [];

    if (improvementVsAverage > 5) {
      items.push(`Latest test is ${improvementVsAverage}% above your personal average.`);
    }

    if (improvementVsAverage < -5) {
      items.push(
        `Latest test is ${Math.abs(
          improvementVsAverage
        )}% below your average — review weak topics.`
      );
    }

    if (strongTopics.length > 3) {
      items.push(`You've mastered ${strongTopics.length} topics with 80%+ accuracy.`);
    }

    if (analyses.length >= 5) {
      items.push(`You've completed ${analyses.length} tests — great consistency!`);
    }

    return items;
  }, [improvementVsAverage, strongTopics.length, analyses.length]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Analytics"
        description="Cross-test trends, topic heatmap, and improvement insights."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Tests Taken",
            value: analyses.length,
            icon: <Trophy className="h-5 w-5 text-amber-400" />,
          },
          {
            label: "Personal Avg",
            value: `${personalAverageAccuracy}%`,
            icon: <Target className="h-5 w-5 text-green-400" />,
          },
          {
            label: "Weak Topics",
            value: weakTopics.length,
            icon: <AlertTriangle className="h-5 w-5 text-red-400" />,
          },
          {
            label: "vs Avg",
            value:
              improvementVsAverage >= 0
                ? `+${improvementVsAverage}%`
                : `${improvementVsAverage}%`,
            icon: <TrendingUp className="h-5 w-5 text-violet-400" />,
          },
        ].map((item) => (
          <Card key={item.label} className="py-4 text-center">
            <CardContent className="space-y-1 p-0">
              <div className="flex justify-center">{item.icon}</div>
              <p className="text-xl font-black text-foreground">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {milestones.length > 0 && (
        <div className="space-y-2">
          {milestones.map((milestone, index) => (
            <div
              key={`${milestone}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
            >
              <Flame className="h-5 w-5 shrink-0 text-amber-400" />
              <p className="text-sm text-foreground">{milestone}</p>
            </div>
          ))}
        </div>
      )}

      {trendData.length > 0 ? (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              Score Trend — Last {trendData.length} Tests
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Overall and per-subject accuracy over time.
            </p>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />

                <Line
                  type="monotone"
                  dataKey="accuracy"
                  name="Overall"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />

                {allSubjects.map((subject, index) => (
                  <Line
                    key={subject}
                    type="monotone"
                    dataKey={subject}
                    name={subject}
                    stroke={SUBJECT_COLORS[(index + 1) % SUBJECT_COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">No test data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete a mock test to unlock analytics here.
            </p>
          </CardContent>
        </Card>
      )}

      {topicPerformance.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Topic Accuracy Heatmap (All-Time)
            </h3>

            <div className="flex flex-wrap gap-2">
              {topicPerformance
                .filter((topic) => topic.total_attempted > 0)
                .map((topic) => (
                  <div
                    key={topic.topic}
                    title={`${topic.topic}: ${topic.total_correct}/${topic.total_attempted} (${Math.round(
                      topic.accuracy
                    )}%)`}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                      topic.accuracy >= 80
                        ? "border-green-500/30 bg-green-500/20 text-green-400"
                        : topic.accuracy >= 50
                        ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                        : "border-red-500/30 bg-red-500/20 text-red-400"
                    )}
                  >
                    {topic.topic}{" "}
                    <span className="opacity-70">{Math.round(topic.accuracy)}%</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {weakTopics.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Weak Topics to Focus On
            </h3>

            <div className="space-y-2">
              {weakTopics.map((topic) => (
                <div
                  key={`${topic.subject}-${topic.topic}`}
                  className="flex items-center justify-between rounded-xl border border-red-500/10 bg-red-500/5 px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{topic.topic}</p>
                    <p className="text-xs text-muted-foreground">
                      {topic.subject} · {topic.total_attempted} attempted
                    </p>
                  </div>

                  <span className="text-sm font-bold text-red-400">
                    {Math.round(topic.accuracy)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {strongTopics.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Trophy className="h-4 w-4 text-amber-400" />
              Mastered Topics
            </h3>

            <div className="flex flex-wrap gap-2">
              {strongTopics.map((topic) => (
                <div
                  key={`${topic.subject}-${topic.topic}`}
                  className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400"
                >
                  {topic.topic} · {Math.round(topic.accuracy)}%
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
