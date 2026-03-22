// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Trophy, Target, Clock, ChevronRight, CheckCircle,
  XCircle, Minus, Brain, TrendingUp, ChevronDown,
  ChevronUp, ArrowLeft, Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type QuestionFilter = "all" | "wrong" | "marked";

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function TestResults() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [test, setTest] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [qFilter, setQFilter] = useState<QuestionFilter>("all");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!testId || !user?.id) return;
    loadResults();
  }, [testId, user?.id]);

  async function loadResults() {
    setLoading(true);
    try {
      const [testRes, analysisRes] = await Promise.all([
        supabase.from("mock_tests").select("*").eq("id", testId).eq("user_id", user!.id).single(),
        supabase.from("test_analyses").select("*").eq("test_id", testId).eq("user_id", user!.id).single(),
      ]);

      if (testRes.error) {
        toast.error("Test not found");
        navigate("/app/mock-test");
        return;
      }

      setTest(testRes.data);
      setAnalysis(analysisRes.data);

      const qIds = testRes.data.question_ids as string[];
      const [qRes, rRes] = await Promise.all([
        supabase.from("questions").select("*").in("id", qIds),
        supabase.from("test_responses").select("*").eq("test_id", testId).eq("user_id", user!.id),
      ]);

      const qMap: Record<string, any> = {};
      for (const q of (qRes.data ?? [])) qMap[q.id] = q;
      setQuestions(qIds.map((id) => qMap[id]).filter(Boolean));

      const rMap: Record<string, any> = {};
      for (const r of (rRes.data ?? [])) rMap[r.question_id] = r;
      setResponses(rMap);
    } catch (err) {
      console.error("[TestResults] load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function generateAIAnalysis() {
    if (!testId || !user?.id) return;
    setAiLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await supabase.functions.invoke("analyze-test-performance", {
        body: { test_id: testId, user_id: user!.id },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      setAnalysis((prev: any) => ({ ...prev, ai_analysis_text: res.data.analysis }));
      setShowAI(true);
      toast.success("AI analysis ready!");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate analysis");
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  if (!test || !analysis) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Results not found.</p>
        <Link to="/app/mock-test" className="text-violet-400 hover:underline mt-2 inline-block">
          Back to Hub
        </Link>
      </div>
    );
  }

  const topicBD = analysis.topic_breakdown ?? {};
  const subjectBD = analysis.subject_breakdown ?? {};

  const filteredQuestions = questions.filter((q) => {
    const r = responses[q.id];
    if (topicFilter && q.topic !== topicFilter) return false;
    if (qFilter === "wrong") return r?.is_correct === false && r?.is_attempted;
    if (qFilter === "marked") return r?.is_marked_review;
    return true;
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Test Results"
        description={test.test_name}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/app/mock-test")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Hub
          </Button>
        }
      />

      {/* ── Scorecard ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Score",
            value: `${Math.max(0, analysis.total_score)}/${analysis.max_score}`,
            icon: <Trophy className="h-5 w-5 text-amber-400" />,
            color: "text-amber-400",
          },
          {
            label: "Accuracy",
            value: `${analysis.accuracy ?? 0}%`,
            icon: <Target className="h-5 w-5 text-green-400" />,
            color: "text-green-400",
          },
          {
            label: "Attempted",
            value: `${analysis.attempt_percentage ?? 0}%`,
            icon: <CheckCircle className="h-5 w-5 text-blue-400" />,
            color: "text-blue-400",
          },
          {
            label: "Percentile",
            value: `~${analysis.predicted_percentile ?? 0}th`,
            icon: <TrendingUp className="h-5 w-5 text-violet-400" />,
            color: "text-violet-400",
          },
        ].map(({ label, value, icon, color }) => (
          <Card key={label} className="text-center py-4">
            <CardContent className="p-0 space-y-1">
              <div className="flex justify-center">{icon}</div>
              <p className={cn("text-xl font-black", color)}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Subject breakdown ── */}
      {Object.keys(subjectBD).length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Subject Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left pb-2">Subject</th>
                    <th className="text-right pb-2">Correct</th>
                    <th className="text-right pb-2">Wrong</th>
                    <th className="text-right pb-2">Total</th>
                    <th className="text-right pb-2">Accuracy</th>
                    <th className="text-right pb-2">Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(subjectBD).map(([subj, data]: [string, any]) => (
                    <tr key={subj}>
                      <td className="py-2 font-medium text-foreground">{subj}</td>
                      <td className="py-2 text-right text-green-400">{data.correct}</td>
                      <td className="py-2 text-right text-red-400">{data.wrong}</td>
                      <td className="py-2 text-right text-muted-foreground">{data.total}</td>
                      <td className="py-2 text-right">
                        <span className={cn(
                          "font-semibold",
                          data.accuracy >= 70 ? "text-green-400" :
                          data.accuracy >= 40 ? "text-amber-400" : "text-red-400"
                        )}>
                          {data.accuracy}%
                        </span>
                      </td>
                      <td className={cn("py-2 text-right font-semibold",
                        data.marks >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {data.marks >= 0 ? "+" : ""}{data.marks?.toFixed(0) ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Topic heatmap ── */}
      {Object.keys(topicBD).length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Topic Accuracy Heatmap</h3>
            <p className="text-xs text-muted-foreground mb-3">Click a topic to filter questions below.</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(topicBD).map(([topic, data]: [string, any]) => {
                const acc = data.accuracy ?? 0;
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setTopicFilter(topicFilter === topic ? null : topic)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                      topicFilter === topic ? "ring-2 ring-violet-500" : "",
                      acc >= 80 ? "bg-green-500/20 text-green-400 border-green-500/30" :
                      acc >= 50 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                      data.attempted > 0 ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      "bg-muted/30 text-muted-foreground border-border"
                    )}
                    title={`${topic}: ${data.correct}/${data.attempted} correct (${acc}%)`}
                  >
                    {topic}
                    {data.attempted > 0 && (
                      <span className="ml-1 opacity-70">{acc}%</span>
                    )}
                  </button>
                );
              })}
            </div>
            {topicFilter && (
              <button
                type="button"
                onClick={() => setTopicFilter(null)}
                className="mt-2 text-xs text-violet-400 hover:underline"
              >
                Clear filter
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Time analysis ── */}
      {analysis.time_analysis && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Time Analysis</h3>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Avg per question</p>
                <p className="font-bold text-foreground">
                  {analysis.time_analysis.avg_seconds ?? 0}s
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Time traps</p>
                <p className="font-bold text-amber-400">
                  {(analysis.time_analysis.time_traps ?? []).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── AI Analysis card ── */}
      <Card className="border-violet-500/30">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-400" />
              <h3 className="text-sm font-semibold text-foreground">AI Coach Analysis</h3>
              {analysis.ai_analysis_text && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  Ready
                </span>
              )}
            </div>
            {analysis.ai_analysis_text ? (
              <button
                type="button"
                onClick={() => setShowAI((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAI ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showAI ? "Collapse" : "Expand"}
              </button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={generateAIAnalysis}
                loading={aiLoading}
              >
                <Brain className="h-3.5 w-3.5 mr-1.5" />
                Generate (3 credits)
              </Button>
            )}
          </div>

          {showAI && analysis.ai_analysis_text && (
            <div className="mt-4 prose prose-sm prose-invert max-w-none">
              <div className="space-y-4 text-sm text-foreground leading-relaxed">
                {analysis.ai_analysis_text.split(/^##\s/m).filter(Boolean).map((section: string, i: number) => {
                  const lines = section.split("\n");
                  const heading = lines[0];
                  const content = lines.slice(1).join("\n").trim();
                  return (
                    <div key={i} className="rounded-xl border border-border bg-muted/10 p-4">
                      <h4 className="text-sm font-bold text-violet-300 mb-2">{heading}</h4>
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{content}</p>
                    </div>
                  );
                })}
              </div>
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

      {/* ── Question review ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Question Review</h3>
            <div className="flex gap-1">
              {(["all", "wrong", "marked"] as QuestionFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setQFilter(f)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium border transition-all capitalize",
                    qFilter === f
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                      : "border-border text-muted-foreground hover:border-violet-500/30"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {filteredQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No questions match the filter.</p>
            ) : (
              filteredQuestions.map((q, i) => {
                const r = responses[q.id];
                const isCorrect = r?.is_correct;
                const isAttempted = r?.is_attempted;
                return (
                  <QuestionReviewCard
                    key={q.id}
                    number={questions.indexOf(q) + 1}
                    question={q}
                    response={r}
                    isCorrect={isCorrect}
                    isAttempted={isAttempted}
                  />
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/app/mock-test")} className="flex-1">
          Back to Hub
        </Button>
        <Button onClick={() => navigate("/app/mock-test/revision")} className="flex-1">
          Review Weak Topics
          <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function QuestionReviewCard({
  number, question, response, isCorrect, isAttempted,
}: {
  number: number;
  question: any;
  response: any;
  isCorrect: boolean;
  isAttempted: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-all",
      isCorrect ? "border-green-500/20 bg-green-500/5" :
      isAttempted ? "border-red-500/20 bg-red-500/5" :
      "border-border"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isCorrect ? (
              <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
            ) : isAttempted ? (
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs text-muted-foreground">{question.subject} · {question.topic}</span>
          </div>
          <p className="text-sm text-foreground">{question.question_text}</p>
        </div>
        <button type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>

      {expanded && (
        <div className="ml-9 space-y-2 text-sm">
          {isAttempted && (
            <p className="text-muted-foreground">
              Your answer:{" "}
              <span className={cn("font-semibold", isCorrect ? "text-green-400" : "text-red-400")}>
                {response?.user_answer ?? "—"}
              </span>
            </p>
          )}
          <p className="text-muted-foreground">
            Correct answer:{" "}
            <span className="font-semibold text-green-400">{question.correct_answer}</span>
          </p>
          {question.explanation && (
            <div className="rounded-lg bg-muted/20 p-3 text-xs text-foreground/80">
              <span className="font-semibold text-violet-400 block mb-1">Explanation</span>
              {question.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
