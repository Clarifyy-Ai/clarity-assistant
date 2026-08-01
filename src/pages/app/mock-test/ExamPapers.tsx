import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ChevronRight,
  ArrowLeft,
  Filter,
  FileText,
  Layers,
  Calendar,
  Play,
  BookOpen,
  Trophy,
  BarChart2,
  TrendingUp,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { launchMockTest, countQuestionsForPaper } from "@/lib/mock-test/launchMockTest";
import { listPreviousPapers, type PreviousYearPaper } from "@/lib/gov-exam/api";
import { GOV_EXAM_AFFILIATION_DISCLAIMER } from "@/lib/gov-exam/disclaimers";

/* ─── TYPES ────────────────────────────────────────────────────────────────── */

interface ExamPaper {
  id: string;
  exam_type: string;
  exam_name: string;
  year: number;
  session?: string | null;
  shift?: string | null;
  total_questions?: number | null;
  total_marks?: number | null;
  duration_minutes?: number | null;
  difficulty_level?: string | null;
  subject_breakdown?: string[] | null;
}

interface MockTestRow {
  config: Record<string, unknown> | null;
  overall_score: number | null;
  test_name: string | null;
}

interface OfficialSetting {
  questions: number;
  duration: number;
  positive: number;
  negative: number;
}

/* ─── CONSTANTS ────────────────────────────────────────────────────────────── */

/**
 * Testbook-style readiness: a paper is launchable only if the bank already has
 * questions for it. AI gap-fill is disabled by policy, so cards with bank=0
 * are surfaced as "Coming soon" and the launch buttons are disabled.
 */


const EXAM_LABELS: Record<string, string> = {
  JEE_MAIN: "JEE Main",
  JEE_ADV:  "JEE Advanced",
  NEET:     "NEET UG",
  UPSC:     "UPSC CSE",
  SSC_CGL:  "SSC CGL",
  IBPS_PO:  "IBPS PO",
  CUSTOM:   "Custom",
};

/**
 * Maps frontend uppercase exam ID  →  exam_papers.exam_type DB value.
 * Used only to query the exam_papers table in this component.
 */
const EXAM_DB_MAP: Record<string, string> = {
  JEE_MAIN: "JEE Main",
  JEE_ADV:  "JEE Advanced",
  NEET:     "NEET UG",
  UPSC:     "UPSC CSE",
  SSC_CGL:  "SSC CGL",
  HPCL_ENGINEER: "HPCL Engineer",
  PSU:             "PSU",
};

const EXAM_SUBJECT_LABELS: Record<string, string[]> = {
  JEE_MAIN:      ["Physics", "Chemistry", "Math"],
  JEE_ADV:       ["Physics", "Chemistry", "Math"],
  NEET:          ["Biology", "Physics", "Chemistry"],
  UPSC:          ["GS Paper 1", "GS Paper 2", "Current Affairs"],
  SSC_CGL:       ["Reasoning", "Quant", "English", "GK"],
  IBPS_PO:       ["Reasoning", "Quant", "English", "Banking"],
  HPCL_ENGINEER: ["Technical", "English", "Quant", "Reasoning"],
  PSU:           ["Domain", "English", "Quant", "Reasoning"],
};

/** exam_papers.exam_type → TestConfigure URL id */
const EXAM_ROUTE_FROM_PAPER: Record<string, string> = {
  "JEE Main": "JEE_MAIN",
  "JEE Advanced": "JEE_ADV",
  "NEET UG": "NEET",
  "UPSC CSE": "UPSC",
  "SSC CGL": "SSC_CGL",
  "SSC Exams (CGL/CHSL)": "SSC_CGL",
  "Banking (IBPS/SBI/RBI)": "IBPS_PO",
  "IBPS PO": "IBPS_PO",
  "HPCL Engineer": "HPCL_ENGINEER",
};

const OFFICIAL_SETTINGS: Record<string, OfficialSetting> = {
  JEE_MAIN: { questions: 90,  duration: 180, positive: 4,    negative: 1    },
  JEE_ADV:  { questions: 54,  duration: 180, positive: 4,    negative: 1    },
  NEET:     { questions: 180, duration: 200, positive: 4,    negative: 1    },
  UPSC:     { questions: 100, duration: 120, positive: 2,    negative: 0.66 },
  SSC_CGL:  { questions: 100, duration: 60,  positive: 2,    negative: 0.5  },
  IBPS_PO:  { questions: 100, duration: 60,  positive: 1,    negative: 0.25 },
};

/* ─── COMPONENT ────────────────────────────────────────────────────────────── */

export default function ExamPapers() {
  const { examType } = useParams<{ examType: string }>();
  const navigate     = useNavigate();
  const user         = useAuthStore((s) => s.user);
  const isAdmin      = useAuthStore((s) => s.isAdmin);

  const [papers,      setPapers]      = useState<ExamPaper[]>([]);
  const [registryPapers, setRegistryPapers] = useState<PreviousYearPaper[]>([]);
  const [registryEmpty, setRegistryEmpty] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [onlyReady,   setOnlyReady]   = useState<boolean>(true);

  // Filters
  const [yearFilter,       setYearFilter]       = useState<number | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");
  const [durationFilter,   setDurationFilter]   = useState<string>("All");

  // Progress
  const [attemptedIds,    setAttemptedIds]    = useState<Set<string>>(new Set());
  const [averageScore,    setAverageScore]    = useState<number>(0);
  const [bestPerformance, setBestPerformance] = useState<string>("--");

  useEffect(() => {
    if (!examType) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examType]);

  /* ── DATA LOADING ──────────────────────────────────────────────────────── */

  async function loadData() {
    setLoading(true);
    try {
      const normalised = (examType ?? "").toUpperCase();
      const dbExamType  = EXAM_DB_MAP[normalised] ?? normalised;

      const [papersRes, testsRes, registryRes] = await Promise.all([
        supabase
          .from("exam_papers")
          .select("*")
          .eq("exam_type", dbExamType)
          .order("year", { ascending: false }),

        user?.id
          ? supabase
              .from("mock_tests")
              .select("config, overall_score, test_name")
              .eq("user_id", user.id)
              .eq("status", "COMPLETED")
          : Promise.resolve({ data: [] as MockTestRow[], error: null }),

        listPreviousPapers({ examCode: normalised }).catch(() => null),
      ]);

      const loadedPapers = (papersRes.data ?? []) as ExamPaper[];
      setPapers(loadedPapers);

      if (registryRes) {
        setRegistryPapers(registryRes.papers);
        setRegistryEmpty(registryRes.bankEmpty);
      } else {
        setRegistryPapers([]);
        setRegistryEmpty(true);
      }

      const counts: Record<string, number> = {};
      await Promise.all(
        loadedPapers.map(async (p) => {
          const routeId =
            EXAM_ROUTE_FROM_PAPER[p.exam_type] ??
            p.exam_type.replace(/\s+/g, "_").toUpperCase();
          counts[p.id] = await countQuestionsForPaper(p.exam_type, p.year, routeId);
        })
      );
      setQuestionCounts(counts);

      // Build progress stats
      const userTests  = (testsRes.data ?? []) as MockTestRow[];
      const attempted  = new Set<string>();
      let totalScore   = 0;
      let maxScore     = -1;
      let bestTestName = "--";

      for (const t of userTests) {
        const cfg = t.config as Record<string, unknown> | null;
        const cfgExam = String(cfg?.exam_type ?? "");
        const matchesExam =
          cfgExam === normalised ||
          cfgExam === dbExamType ||
          EXAM_ROUTE_FROM_PAPER[cfgExam] === normalised;
        if (matchesExam) {
          const yearMin = cfg?.year_range
            ? String((cfg.year_range as Record<string, unknown>).min ?? "")
            : "";
          if (yearMin) attempted.add(yearMin);

          const score = t.overall_score ?? 0;
          totalScore += score;
          if (score > maxScore) {
            maxScore     = score;
            bestTestName = t.test_name ?? "--";
          }
        }
      }

      setAttemptedIds(attempted);
      if (attempted.size > 0) setAverageScore(Math.round(totalScore / attempted.size));
      if (maxScore >= 0)      setBestPerformance(`${bestTestName} (${maxScore}%)`);
    } catch (err) {
      console.error("[ExamPapers] loadData error:", err);
      toast.error("Failed to load exam papers. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ── DERIVED VALUES ────────────────────────────────────────────────────── */

  const normalised      = (examType ?? "").toUpperCase();
  const examLabel       = EXAM_LABELS[normalised] ?? examType ?? "Exam";
  const officialSetting = OFFICIAL_SETTINGS[normalised] as OfficialSetting | undefined;
  const years           = [...new Set(papers.map((p) => p.year))].sort((a, b) => b - a);

  const filtered = papers.filter((p) => {
    if (onlyReady && (questionCounts[p.id] ?? 0) === 0) return false;
    if (yearFilter && p.year !== yearFilter) return false;
    if (difficultyFilter !== "All" && p.difficulty_level !== difficultyFilter) return false;
    if (durationFilter !== "All") {
      const dur = p.duration_minutes ?? officialSetting?.duration ?? 60;
      if (durationFilter === "Under 30 min" && dur >= 30)           return false;
      if (durationFilter === "30-60 min"    && (dur < 30 || dur > 60)) return false;
      if (durationFilter === "Full Paper"   && dur <= 60)            return false;
    }
    return true;
  });

  const readyCount = papers.filter((p) => (questionCounts[p.id] ?? 0) > 0).length;

  /* ── ONE-CLICK LAUNCH ──────────────────────────────────────────────────── */

  async function launchDirectTest(paper: ExamPaper, isPractice: boolean) {
    if (!user?.id) return;

    // Guard: bank has no questions for this paper (Testbook-style readiness)
    if ((questionCounts[paper.id] ?? 0) === 0) {
      toast.error(
        `Questions for ${paper.exam_name} ${paper.year} haven't been imported yet.`,
      );
      return;
    }


    setLaunchingId(paper.id);

    try {
      const routeExamId =
        EXAM_ROUTE_FROM_PAPER[paper.exam_type] ??
        (examType ?? paper.exam_type.replace(/\s+/g, "_").toUpperCase());

      const available = questionCounts[paper.id] ?? 0;

      const s = officialSetting ?? {
        questions: paper.total_questions ?? 30,
        duration:  paper.duration_minutes ?? 60,
        positive:  4,
        negative:  1,
      };

      const questionCount = Math.max(1, Math.min(s.questions, available));

      const testName =
        `${paper.exam_name} ${paper.year}${paper.shift ? ` Shift ${paper.shift}` : ""}`.trim() +
        (isPractice ? " (Practice Mode)" : "");

      const { test_id, warning } = await launchMockTest({
        exam_type: routeExamId,
        test_name: testName,
        subjects: [],
        topics: [],
        source_types: ["OFFICIAL_PYP"],
        year_range: { min: paper.year, max: paper.year },
        difficulty_distribution: { EASY: 30, MEDIUM: 40, HARD: 30 },
        question_count: questionCount,
        duration_minutes: isPractice ? 0 : s.duration,
        marks_positive: s.positive,
        marks_negative: s.negative,
        randomize_order: false,
        shuffle_options: !isPractice,
        practice_mode: isPractice,
      });

      if (warning) toast.warning(warning);
      if (questionCount < s.questions) {
        toast.info(`Started with ${questionCount} questions (${available} in bank for ${paper.year}).`);
      }

      toast.success(
        isPractice
          ? `Starting Practice Mode for ${paper.exam_name} ${paper.year}…`
          : `Launching ${paper.exam_name} ${paper.year} in Exam Mode!`,
      );
      navigate(`/app/mock-test/session/${test_id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to launch test.";
      console.error("[ExamPapers] launchDirectTest:", err);
      toast.error(message);
    } finally {
      setLaunchingId(null);
    }
  }

  /* ─── RENDER ───────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${examLabel} Papers`}
        description={`Browse and one-click start full official ${examLabel} question papers.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/app/mock-test")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Hub
          </Button>
        }
      />

      <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2 bg-muted/30">
        {GOV_EXAM_AFFILIATION_DISCLAIMER}
      </p>

      {/* ── REGISTRY PREVIOUS PAPERS ─────────────────────────────────────── */}
      {!loading && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Registry previous papers
          </h2>
          {registryEmpty || registryPapers.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-4">
              No approved previous-year papers in the government exam registry yet
              for this exam. Legacy paper cards below (if any) are practice/library
              metadata — not a copyrighted bank copy.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {registryPapers.map((p) => (
                <Card key={p.id} className="bg-card shadow-sm">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">
                        {p.title ?? `${examLabel} ${p.year}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.year}
                        {p.shift ? ` · ${p.shift}` : ""}
                        {p.questionCount != null ? ` · ${p.questionCount} Qs` : ""}
                      </p>
                      <div className="mt-2">
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
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── PROGRESS TRACKER ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Attempted
              </p>
              <p className="text-2xl font-black text-foreground">
                {attemptedIds.size}{" "}
                <span className="text-sm font-medium text-muted-foreground">
                  / {papers.length} papers
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/5 border-blue-500/20 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Average Score
              </p>
              <p className="text-2xl font-black text-foreground">{averageScore}%</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Best Performance
              </p>
              <p
                className="text-sm font-bold text-foreground truncate max-w-[150px]"
                title={bestPerformance}
              >
                {bestPerformance}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── READINESS NOTICE + TOGGLE ────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>
            <strong>{readyCount}</strong> of {papers.length} papers are ready to launch (questions imported).
            Empty papers are hidden by default.
          </span>
          <button
            type="button"
            onClick={() => setOnlyReady((v) => !v)}
            className="text-xs font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300 self-start sm:self-auto"
          >
            {onlyReady ? "Show all papers" : "Show only ready"}
          </button>
        </div>
      </div>


      {/* ── FILTER BAR ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-center justify-between bg-card p-3 rounded-xl border border-border">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <Filter className="h-4 w-4 text-muted-foreground mx-1" />

          <Select
            value={yearFilter ? String(yearFilter) : "All"}
            onValueChange={(v) => setYearFilter(v === "All" ? null : Number(v))}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs font-medium">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs font-medium">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Difficulties</SelectItem>
              <SelectItem value="EASY">Easy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HARD">Hard</SelectItem>
            </SelectContent>
          </Select>

          <Select value={durationFilter} onValueChange={setDurationFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs font-medium">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">Any Duration</SelectItem>
              <SelectItem value="Under 30 min">Under 30 min</SelectItem>
              <SelectItem value="30-60 min">30–60 min</SelectItem>
              <SelectItem value="Full Paper">Full Paper (&gt;60 min)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── PAPER GRID ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground" />
            {papers.length > 0 && readyCount === 0 ? (
              <>
                <p className="font-medium text-foreground">No questions imported yet</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  These papers exist but the question bank is empty.
                  {isAdmin ? (
                    <>
                      {" "}
                      <Link
                        to="/app/admin/seed-questions"
                        className="text-primary font-medium underline underline-offset-2 hover:opacity-90"
                      >
                        Seed questions in Admin
                      </Link>
                      .
                    </>
                  ) : (
                    " An admin needs to seed questions before these papers can launch."
                  )}
                </p>
                <Button size="sm" variant="outline" onClick={() => setOnlyReady(false)}>
                  Show all papers
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">No papers match your filters</p>
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(`/app/mock-test/configure?exam=${normalised}`)
                  }
                >
                  Create Custom AI Test <ChevronRight className="h-4 w-4 ml-1.5" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((paper) => {
            const bankCount    = questionCounts[paper.id] ?? 0;
            const qsCount      = paper.total_questions ?? officialSetting?.questions ?? 30;
            const timeLimit    = paper.duration_minutes ?? officialSetting?.duration ?? 60;
            const hasAttempted = attemptedIds.has(String(paper.year));
            const isComingSoon = bankCount === 0;
            const isLaunching  = launchingId === paper.id;
            const needsBankSeed = false;

            return (
              <Card
                key={paper.id}
                className={cn(
                  "hover:border-primary/40 transition-all group overflow-hidden relative",
                  hasAttempted && !isComingSoon
                    ? "bg-muted/10 border-border"
                    : "bg-card shadow-sm",
                  isComingSoon && "opacity-75",
                )}
              >
                {/* Attempted checkmark */}
                {hasAttempted && !isComingSoon && (
                  <div className="absolute top-3 right-3 text-green-500 bg-green-500/10 rounded-full p-1">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}

                {/* Coming Soon overlay badge */}
                {isComingSoon && (
                  <div className="absolute top-3 right-3">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10"
                    >
                      <Lock className="w-2.5 h-2.5 mr-1" />
                      No questions
                    </Badge>
                  </div>
                )}

                <CardContent className="p-5 flex flex-col h-full">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base leading-tight">
                        {paper.exam_name} {paper.year}
                      </h3>
                      {paper.shift && (
                        <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                          Shift {paper.shift}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] bg-background border"
                    >
                      Bank: {bankCount}
                    </Badge>
                    {needsBankSeed && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10"
                      >
                        AI fill on launch
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] bg-background border"
                    >
                      {qsCount} Qs paper
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] bg-background border"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      {timeLimit}m
                    </Badge>
                    {paper.difficulty_level && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          paper.difficulty_level === "HARD"
                            ? "text-red-500 border-red-500/30 bg-red-500/5"
                            : paper.difficulty_level === "EASY"
                            ? "text-green-500 border-green-500/30 bg-green-500/5"
                            : "text-amber-500 border-amber-500/30 bg-amber-500/5",
                        )}
                      >
                        {paper.difficulty_level}
                      </Badge>
                    )}
                  </div>

                  {/* Subject chips */}
                  {officialSetting && !isComingSoon && (
                    <div className="flex gap-1.5 mb-5 flex-wrap">
                      {(EXAM_SUBJECT_LABELS[normalised] ?? ["Section A", "Section B", "Section C"]).map(
                        (label, idx, arr) => (
                          <span
                            key={label}
                            className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground font-medium"
                          >
                            {label}: {Math.max(1, Math.floor(qsCount / arr.length))}
                          </span>
                        ),
                      )}
                    </div>
                  )}

                                    {/* Coming soon message */}
                  {isComingSoon && (
                    <p className="text-xs text-muted-foreground mb-4">
                      Question bank is empty for {paper.year}.
                      {isAdmin ? (
                        <>
                          {" "}
                          <Link
                            to="/app/admin/seed-questions"
                            className="text-primary font-medium underline underline-offset-2 hover:opacity-90"
                          >
                            Seed questions in Admin
                          </Link>
                          .
                        </>
                      ) : (
                        " Questions will appear once an admin imports them."
                      )}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-border">
                    {isComingSoon ? (
                      // Coming soon — only offer AI custom test
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() =>
                          navigate(
                            `/app/mock-test/configure?exam=${encodeURIComponent(
          EXAM_ROUTE_FROM_PAPER[paper.exam_type] ?? paper.exam_type.replace(/\s+/g, "_").toUpperCase()
        )}&year_min=${paper.year}&year_max=${paper.year}`,
                          )
                        }
                      >
                        <ChevronRight className="h-3.5 w-3.5 mr-1.5" />
                        Custom AI Test
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => launchDirectTest(paper, true)}
                          disabled={launchingId !== null}
                        >
                          {isLaunching ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Practice Mode
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs shadow-md"
                          onClick={() => launchDirectTest(paper, false)}
                          disabled={launchingId !== null}
                        >
                          {isLaunching ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Exam Mode
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
