import { useEffect, useState } from "react";
import {
  TrendingUp, Target, AlertTriangle, Trophy, Flame,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface MockTestSummary {
  id: string;
  test_name: string;
  config: Record<string, unknown>;
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
  [subject: string]: number | string; // per-subject accuracy
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = ["#8b5cf6", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4"];

export default function TestAnalytics(): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading]     = useState(true);
  const [tests, setTests]         = useState<MockTestSummary[]>([]);
  const [analyses, setAnalyses]   = useState<TestAnalysisSummary[]>([]);
  const [topicPerf, setTopicPerf] = useState<TopicPerformance[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
  }, [user?.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [testsRes, analysesRes, topicRes] = await Promise.all([
        supabase
          .from("mock_tests")
          .select("id, test_name, config, created_at")
          .eq("user_id", user!.id)
          .eq("status", "COMPLETED")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("test_analyses")
          .select("test_id, total_score, max_score, accuracy, attempt_percentage, subject_breakdown, topic_breakdown, created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("user_topic_performance")
          .select("topic, subject, accuracy, total_attempted, total_correct, last_practiced")
          .eq("user_id", user!.id)
          .order("accuracy", { ascending: true })
          .limit(100),
      ]);

      setTests((testsRes.data ?? []) as unknown as MockTestSummary[]);
      setAnalyses((analysesRes.data ?? []) as unknown as TestAnalysisSummary[]);
      setTopicPerf((topicRes.data ?? []) as unknown as TopicPerformance[]);
    } catch (err: unknown) {
      console.error("[TestAnalytics] load error:", err);
      const _m = err instanceof Error ? err.message : "Failed to load analytics. Please try again.";
      toast.error(_m);
    } finally {
      setLoading(false);
    }
  }

  // ── Per-subject trend data (last 10 tests, oldest first) ─────────
  // Collect all subjects that appear across tests
  const allSubjects = [...new Set(
    analyses.flatMap((a) => Object.keys(a.subject_breakdown ?? {}))
  )];

  const trendData: TrendDataPoint[] = [...analyses]
    .reverse()
    .slice(-10)
    .map((a, i) => {
      const test = tests.find((t) => t.id === a.test_id);
      const point: TrendDataPoint = {
        name:      test?.test_name?.slice(0, 10) ?? `Test ${i + 1}`,
        accuracy:  a.accuracy ?? 0,
        score_pct: a.max_score > 0 ? Math.round((a.total_score / a.max_score) * 100) : 0,
      };
      // Add per-subject accuracy
      for (const subj of allSubjects) {
        const bd = a.subject_breakdown?.[subj];
        point[subj] = bd?.accuracy ?? 0;
      }
      return point;
    });

  const weakTopics   = topicPerf.filter((t) => t.total_attempted > 0 && t.accuracy < 60).slice(0, 8);
  const strongTopics = topicPerf.filter((t) => t.total_attempted > 0 && t.accuracy >= 80).slice(0, 5);

  // Overall personal average accuracy
  const personalAvgAccuracy = analyses.length > 0
    ? Math.round(analyses.reduce((s, a) => s + (a.accuracy ?? 0), 0) / analyses.length)
    : 0;

  // Improvement vs personal average (not just last vs previous)
  const latestAccuracy = analyses[0]?.accuracy ?? 0;
  const improvementVsAvg = analyses.length > 1
    ? Math.round(latestAccuracy - personalAvgAccuracy)
    : 0;

  const milestones: string[] = [];
  if (improvementVsAvg > 5) milestones.push(`Latest test is ${improvementVsAvg}% above your personal average!`);
  if (improvementVsAvg < -5) milestones.push(`Latest test is ${Math.abs(improvementVsAvg)}% below your average — review weak topics.`);
  if (strongTopics.length > 3) milestones.push(`You've mastered ${strongTopics.length} topics with 80%+ accuracy.`);
  if (analyses.length >= 5)    milestones.push(`You've completed ${analyses.length} tests — great consistency!`);

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
        description="Cross-test trends (per-subject), topic heatmap, and improvement insights."
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tests Taken",   value: analyses.length,                                                              icon: <Trophy className="h-5 w-5 text-amber-400" /> },
          { label: "Personal Avg",  value: `${personalAvgAccuracy}%`,                                                    icon: <Target className="h-5 w-5 text-green-400" /> },
          { label: "Weak Topics",   value: weakTopics.length,                                                             icon: <AlertTriangle className="h-5 w-5 text-red-400" /> },
          { label: "vs Avg",        value: improvementVsAvg >= 0 ? `+${improvementVsAvg}%` : `${improvementVsAvg}%`,    icon: <TrendingUp className="h-5 w-5 text-violet-400" /> },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="text-center py-4">
            <CardContent className="p-0 space-y-1">
              <div className="flex justify-center">{icon}</div>
              <p className="text-xl font-black text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Milestone alerts */}
      {milestones.length > 0 && (
        <div className="space-y-2">
          {milestones.map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
            >
              <Flame className="h-5 w-5 text-amber-400 shrink-0" />
              <p className="text-sm text-foreground">{m}</p>
            </div>
          ))}
        </div>
      )}

      {/* Score trend chart — per-subject accuracy */}
      {trendData.length > 0 ? (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Score Trend — Last {trendData.length} Tests
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Per-subject accuracy over time.</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
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
                {/* Overall accuracy */}
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  name="Overall"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {/* Per-subject lines */}
                {allSubjects.slice(0, 5).map((subj, i) => (
                  <Line
                    key={subj}
                    type="monotone"
                    dataKey={subj}
                    name={subj}
                    stroke={SUBJECT_COLORS[(i + 1) % SUBJECT_COLORS.length]}
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
            <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">No test data yet</p>
            <p className="text-sm text-muted-foreground mt-1">Complete a mock test to see your trends here.</p>
          </CardContent>
        </Card>
      )}

      {/* Topic heatmap (all-time) */}
      {topicPerf.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Topic Accuracy Heatmap (All-Time)
            </h3>
            <div className="flex flex-wrap gap-2">
              {topicPerf.filter((t) => t.total_attempted > 0).map((t) => (
                <div
                  key={t.topic}
                  title={`${t.topic}: ${t.total_correct}/${t.total_attempted} (${Math.round(t.accuracy)}%)`}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold border",
                    t.accuracy >= 80
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : t.accuracy >= 50
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                  )}
                >
                  {t.topic} <span className="opacity-70">{Math.round(t.accuracy)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weak topics spotlight */}
      {weakTopics.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Weak Topics to Focus On
            </h3>
            <div className="space-y-2">
              {weakTopics.map((t) => (
                <div
                  key={t.topic}
                  className="flex items-center justify-between rounded-xl border border-red-500/10 bg-red-500/5 px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.topic}</p>
                    <p className="text-xs text-muted-foreground">{t.subject} · {t.total_attempted} attempted</p>
                  </div>
                  <span className="text-sm font-bold text-red-400">{Math.round(t.accuracy)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mastered topics */}
      {strongTopics.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              Mastered Topics
            </h3>
            <div className="flex flex-wrap gap-2">
              {strongTopics.map((t) => (
                <div
                  key={t.topic}
                  className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 font-semibold"
                >
                  {t.topic} · {Math.round(t.accuracy)}%
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
