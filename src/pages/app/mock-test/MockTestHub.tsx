// @ts-nocheck
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen, Upload, ClipboardList,
  ChevronRight, Zap, Target, Clock,
  FlaskConical, BarChart2, Flame,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RecentTest {
  id: string;
  test_name: string;
  status: string;
  created_at: string;
  config: Record<string, unknown>;
}

interface HubStats {
  totalTests: number;
  totalQuestions: number;
  avgAccuracy: number;
  streakDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam type quick-start cards
// ─────────────────────────────────────────────────────────────────────────────

const EXAM_TYPES = [
  {
    id: "JEE_MAIN",
    name: "JEE Main",
    description: "Physics · Chemistry · Mathematics",
    color: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
    badge: "Engineering",
    badgeColor: "bg-blue-500/10 text-blue-600",
  },
  {
    id: "NEET",
    name: "NEET UG",
    description: "Biology · Physics · Chemistry",
    color: "from-green-500/20 to-green-600/10",
    border: "border-green-500/30",
    badge: "Medical",
    badgeColor: "bg-green-500/10 text-green-600",
  },
  {
    id: "UPSC",
    name: "UPSC CSE",
    description: "GS Paper 1 & 2 · Current Affairs",
    color: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/30",
    badge: "Civil Services",
    badgeColor: "bg-amber-500/10 text-amber-600",
  },
  {
    id: "SSC_CGL",
    name: "SSC CGL",
    description: "Reasoning · Quant · English · GK",
    color: "from-violet-500/20 to-violet-600/10",
    border: "border-violet-500/30",
    badge: "Government",
    badgeColor: "bg-violet-500/10 text-violet-600",
  },
  {
    id: "IBPS_PO",
    name: "IBPS PO",
    description: "Reasoning · Quant · English · Banking",
    color: "from-rose-500/20 to-rose-600/10",
    border: "border-rose-500/30",
    badge: "Banking",
    badgeColor: "bg-rose-500/10 text-rose-600",
  },
  {
    id: "CUSTOM",
    name: "Custom Test",
    description: "Configure your own question set",
    color: "from-slate-500/20 to-slate-600/10",
    border: "border-slate-500/30",
    badge: "Custom",
    badgeColor: "bg-slate-500/10 text-slate-600",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Streak calculation
// Counts consecutive calendar days (most recent first) where at least one
// test was completed.
// ─────────────────────────────────────────────────────────────────────────────

function calcStreakDays(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  // Unique calendar days (YYYY-MM-DD) sorted descending
  const days = [...new Set(
    completedDates.map((d) => d.slice(0, 10))
  )].sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak must include today or yesterday to be live
  if (days[0] !== today && days[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MockTestHub(): React.ReactElement {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [stats, setStats] = useState<HubStats>({
    totalTests: 0, totalQuestions: 0, avgAccuracy: 0, streakDays: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
  }, [user?.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [recentRes, questionsRes, analysesRes, completedCountRes, streakRes] = await Promise.all([
        // Recent tests for the list (last 5 any status)
        supabase
          .from("mock_tests")
          .select("id, test_name, status, created_at, config")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(5),
        // My questions count
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("uploaded_by", user!.id),
        // All test analyses for avg accuracy
        supabase
          .from("test_analyses")
          .select("accuracy")
          .eq("user_id", user!.id),
        // Total completed test count (not limited to 5)
        supabase
          .from("mock_tests")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("status", "COMPLETED"),
        // Submitted_at dates for streak calculation (last 90 days)
        supabase
          .from("mock_tests")
          .select("submitted_at")
          .eq("user_id", user!.id)
          .eq("status", "COMPLETED")
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(90),
      ]);

      setRecentTests((recentRes.data ?? []) as RecentTest[]);

      const totalTests = completedCountRes.count ?? 0;
      const totalQuestions = questionsRes.count ?? 0;
      const analyses = analysesRes.data ?? [];
      const avgAccuracy = analyses.length > 0
        ? Math.round(analyses.reduce((s, a) => s + (a.accuracy ?? 0), 0) / analyses.length)
        : 0;

      // Use submitted_at for streak (actual completion date)
      const completedDates = (streakRes.data ?? [])
        .map((r) => (r as unknown as { submitted_at: string }).submitted_at)
        .filter(Boolean);
      const streakDays = calcStreakDays(completedDates);

      setStats({ totalTests, totalQuestions, avgAccuracy, streakDays });
    } catch (err: unknown) {
      console.error("[MockTestHub] load error:", err);
      const _m = err instanceof Error ? err.message : "Failed to load test history.";
      toast.error(_m);
    } finally {
      setLoading(false);
    }
  }

  function handleExamStart(examType: string) {
    navigate(`/app/mock-test/configure?exam=${examType}`);
  }

  function handleQuickDrill() {
    navigate("/app/mock-test/configure?quick=true");
  }

  const statusColor: Record<string, string> = {
    COMPLETED:   "bg-green-500/10 text-green-600",
    IN_PROGRESS: "bg-amber-500/10 text-amber-600",
    DRAFT:       "bg-slate-500/10 text-slate-500",
    ABANDONED:   "bg-red-500/10 text-red-500",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mock Test Engine"
        description="Practice with previous year papers and AI-generated questions for JEE, NEET, UPSC, SSC, and more."
        actions={
          <div className="flex gap-2">
            <Link
              to="/app/mock-test/my-questions"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary/60"
            >
              <BookOpen className="h-4 w-4" />
              My Questions
            </Link>
            <Button size="sm" onClick={handleQuickDrill}>
              <Zap className="h-4 w-4 mr-2" />
              Quick Drill
            </Button>
          </div>
        }
      />

      {/* ── Stats bar: 4 stats including streak ───────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: ClipboardList, label: "Tests Taken",    value: loading ? "—" : String(stats.totalTests) },
          { icon: Target,        label: "Avg Accuracy",   value: loading ? "—" : `${stats.avgAccuracy}%` },
          { icon: BookOpen,      label: "My Questions",   value: loading ? "—" : String(stats.totalQuestions) },
          { icon: Flame,         label: "Day Streak",     value: loading ? "—" : `${stats.streakDays}🔥`, streak: true },
        ].map(({ icon: Icon, label, value, streak }) => (
          <Card key={label} className="text-center py-3">
            <CardContent className="p-0">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${streak ? "text-amber-400" : "text-muted-foreground"}`} />
              <p className={`text-xl font-bold ${streak && stats.streakDays > 0 ? "text-amber-400" : "text-foreground"}`}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Quick Drill callout ───────────────────────────── */}
      <Card className="border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-violet-600/5">
        <CardContent className="flex items-center justify-between py-4 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/20">
              <Zap className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Quick Drill</p>
              <p className="text-sm text-muted-foreground">10 adaptive questions · 10 minutes · no setup needed</p>
            </div>
          </div>
          <Button size="sm" onClick={handleQuickDrill} className="shrink-0">
            Start Now <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>

      {/* ── Exam type cards ───────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Start a Test
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EXAM_TYPES.map((exam) => (
            <button
              key={exam.id}
              type="button"
              onClick={() => handleExamStart(exam.id)}
              className={`text-left rounded-xl border ${exam.border} bg-gradient-to-br ${exam.color} p-4 transition-all hover:scale-[1.02] hover:shadow-md`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.badgeColor}`}>
                  {exam.badge}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground">{exam.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{exam.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Recent tests ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent Tests
          </h2>
          <Link
            to="/app/mock-test/analytics"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <BarChart2 className="h-4 w-4" /> Analytics
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : recentTests.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <FlaskConical className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">No tests yet</p>
              <p className="text-sm text-muted-foreground mt-1">Pick an exam type above to take your first test.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentTests.map((test) => (
              <Card key={test.id} className="hover:border-violet-500/30 transition-colors">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{test.test_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(test.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColor[test.status] ?? "bg-slate-500/10 text-slate-500 border-slate-500/20"}`}>
                      {test.status}
                    </span>
                    {test.status === "COMPLETED" && (
                      <Link
                        to={`/app/mock-test/results/${test.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >Results</Link>
                    )}
                    {test.status === "IN_PROGRESS" && (
                      <Link
                        to={`/app/mock-test/session/${test.id}`}
                        className="inline-flex items-center rounded-xl bg-violet-600/15 border border-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-600 hover:bg-violet-600/25 transition-colors"
                      >Resume</Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Tools row ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              to: "/app/mock-test/upload",
              icon: Upload,
              title: "Import Questions",
              desc: "Upload PDF or create manually",
            },
            {
              to: "/app/mock-test/my-questions",
              icon: BookOpen,
              title: "Question Bank",
              desc: "Manage your uploaded questions",
            },
            {
              to: "/app/mock-test/revision",
              icon: Clock,
              title: "Revision List",
              desc: "Spaced repetition review queue",
            },
          ].map(({ to, icon: Icon, title, desc }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all hover:border-violet-500/30 hover:bg-accent/5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground truncate">{desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
