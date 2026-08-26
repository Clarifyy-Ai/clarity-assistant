import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen, Upload, ClipboardList,
  ChevronRight, Zap, Target, Clock,
  FlaskConical, BarChart2, Flame,
} from "lucide-react";
import {
  mockTestsDB,
  testAnalysesDB,
  questionsDB,
  type MockTestSummary,
} from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { LazyMotion, domAnimation } from "framer-motion";
import { GovExamShowcase } from "@/components/marketing/GovExamShowcase";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { ExamSearchCombobox } from "@/components/gov-exam/ExamSearchCombobox";
import {
  requestGovExam,
  type GovExamSearchResult,
} from "@/lib/gov-exam/api";
import { formatBankCoverage } from "@/lib/gov-exam/bankReadiness";
import { GOV_EXAM_AFFILIATION_DISCLAIMER } from "@/lib/gov-exam/disclaimers";
import { GovExamReadinessPanel } from "@/components/gov-exam/GovExamReadinessPanel";
import {
  fetchLatestExamReadiness,
  fetchTopicMasteryForExam,
} from "@/lib/gov-exam/masteryClient";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { userFacingDbError } from "@/lib/errors/userFacingDbError";

const FAMILY_FILTERS = [
  { id: "", label: "All" },
  { id: "upsc", label: "UPSC" },
  { id: "ssc", label: "SSC" },
  { id: "railways", label: "Railways" },
  { id: "banking", label: "Banking" },
  { id: "state_psc", label: "State PSC" },
  { id: "defence", label: "Defence" },
  { id: "teaching", label: "Teaching" },
  { id: "other", label: "Other" },
] as const;

const RECENT_CHIP_KEY = "clarify_gov_exam_recent";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RecentTest extends MockTestSummary {}

interface HubStats {
  totalTests: number;
  totalQuestions: number;
  avgAccuracy: number;
  streakDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy bank exams (non-registry) — JEE/NEET/PSU stay on configure path.
// Government registry exams are discovered only via search above.
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_BANK_EXAMS = [
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
    id: "HPCL_ENGINEER",
    name: "HPCL Engineer",
    description: "Civil · English · Quant · Reasoning",
    color: "from-teal-500/20 to-teal-600/10",
    border: "border-teal-500/30",
    badge: "PSU",
    badgeColor: "bg-teal-500/10 text-teal-600",
  },
  {
    id: "PSU",
    name: "PSU Exams",
    description: "Domain · English · IPT · Quant",
    color: "from-cyan-500/20 to-cyan-600/10",
    border: "border-cyan-500/30",
    badge: "PSU",
    badgeColor: "bg-cyan-500/10 text-cyan-600",
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [syncQuery, setSyncQuery] = useState<string | undefined>(undefined);
  const [family, setFamily] = useState("");
  const [govResults, setGovResults] = useState<GovExamSearchResult[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "success" | "empty" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentChips, setRecentChips] = useState<string[]>([]);
  const [hubReadiness, setHubReadiness] = useState<Awaited<
    ReturnType<typeof fetchLatestExamReadiness>
  >>(null);
  const [hubMastery, setHubMastery] = useState<
    Awaited<ReturnType<typeof fetchTopicMasteryForExam>>
  >([]);
  const [hubExamLabel, setHubExamLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
  }, [user?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_CHIP_KEY);
      if (raw) setRecentChips(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  async function runGovSearch(q: string, fam = family) {
    // Kept for recent-chip / family-chip compatibility; combobox owns live search.
    setSearchQ(q);
    setSyncQuery(q);
    setFamily(fam);
  }

  function rememberChip(label: string) {
    const next = [label, ...recentChips.filter((c) => c !== label)].slice(0, 6);
    setRecentChips(next);
    try {
      localStorage.setItem(RECENT_CHIP_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function loadData() {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [recentTests, totalQuestions, accuracies, totalTests, completedDates] =
        await Promise.all([
          mockTestsDB.listRecentByUserId(user.id, 5),
          questionsDB.countByUploadedBy(user.id),
          testAnalysesDB.listAccuracyByUserId(user.id),
          mockTestsDB.countCompletedByUserId(user.id),
          mockTestsDB.listSubmittedAtByUserId(user.id, 90),
        ]);

      setRecentTests(recentTests);

      const avgAccuracy = accuracies.length > 0
        ? Math.round(accuracies.reduce((s, a) => s + a, 0) / accuracies.length)
        : 0;

      const streakDays = calcStreakDays(completedDates);

      setStats({ totalTests, totalQuestions, avgAccuracy, streakDays });

      try {
        const latestReady = await fetchLatestExamReadiness(user.id);
        setHubReadiness(latestReady);
        if (latestReady?.exam_id) {
          const mastery = await fetchTopicMasteryForExam(user.id, latestReady.exam_id);
          setHubMastery(mastery);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: examRow } = await (supabase as any)
            .from("gov_exams")
            .select("name, code")
            .eq("id", latestReady.exam_id)
            .maybeSingle();
          setHubExamLabel(
            (examRow as { name?: string; code?: string } | null)?.name ??
              (examRow as { name?: string; code?: string } | null)?.code ??
              null,
          );
        } else {
          setHubMastery([]);
          setHubExamLabel(null);
        }
      } catch {
        setHubReadiness(null);
        setHubMastery([]);
      }
    } catch (err: unknown) {
      const msg = userFacingDbError(err, "load");
      setLoadError(msg);
      toast.error(msg);
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
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        title={PRODUCT_NAMES.govExamPrep}
        description="Which government exam are you preparing for?"
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.govExams },
        ]}
        actions={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
            <Link
              to="/app/mock-test/generate"
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary/60"
            >
              Generate paper
            </Link>
            <Link
              to="/app/mock-test/my-questions"
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary/60"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              My Questions
            </Link>
            <Button size="sm" className="min-h-11" onClick={handleQuickDrill}>
              <Zap className="h-4 w-4 mr-2 shrink-0" />
              Quick Drill
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs text-muted-foreground min-w-0">
          You are in {PRODUCT_NAMES.govExamPrep}.{" "}
          <Link
            to="/app/dashboard"
            className="text-primary hover:underline underline-offset-2"
          >
            Switch to {PRODUCT_NAMES.interviewPractice}
          </Link>
        </p>
      </div>

      <details className="group rounded-lg border border-border/60 bg-muted/20 open:bg-muted/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground flex items-center justify-between gap-2 min-h-11">
          <span>About official affiliation</span>
          <span className="text-muted-foreground group-open:hidden" aria-hidden>
            Show
          </span>
          <span className="text-muted-foreground hidden group-open:inline" aria-hidden>
            Hide
          </span>
        </summary>
        <p className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed break-words">
          {GOV_EXAM_AFFILIATION_DISCLAIMER}
        </p>
      </details>

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void loadData()} />
      )}

      {!loading && (
        <GovExamReadinessPanel
          examName={hubExamLabel ?? undefined}
          readiness={hubReadiness}
          masteryRows={hubMastery}
          generateHref={
            hubReadiness?.exam_id
              ? `/app/mock-test/generate?examId=${hubReadiness.exam_id}&stageId=${hubReadiness.stage_id}&basis=topic`
              : "/app/mock-test/generate?basis=topic"
          }
        />
      )}

      {/* ── Search-first discovery ─────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-b from-muted/30 to-background p-5 sm:p-6 space-y-4">
        <ExamSearchCombobox
          value={selectedExamId}
          family={family}
          browseWhenEmpty
          syncQuery={syncQuery}
          placeholder="Search exam, post, recruiting body, or subject — e.g. SSC CGL, Railway NTPC, IBPS PO"
          onSelect={(exam) => {
            setSelectedExamId(exam.examId);
            setSearchQ(exam.name);
            rememberChip(exam.name);
            setGovResults((prev) => {
              if (prev.some((p) => p.examId === exam.examId)) return prev;
              return [exam, ...prev];
            });
            setSearchState("success");
          }}
          onClear={() => setSelectedExamId("")}
          onRequestExam={(q) => {
            void requestGovExam({ queryText: q || searchQ || "requested exam" })
              .then(() => toast.success("Exam request submitted."))
              .catch((err) =>
                toast.error(
                  err instanceof Error ? err.message : "Could not submit request.",
                ),
              );
          }}
          onResultsChange={(results, meta) => {
            setGovResults(meta.state === "error" ? [] : results);
            setSearchQ(meta.query);
            setSearching(meta.state === "loading");
            if (meta.state === "loading") setSearchState("searching");
            else if (meta.state === "empty") {
              setSearchState("empty");
              setSearchError(null);
            } else if (meta.state === "error") {
              setSearchState("error");
              setSearchError(meta.error);
            } else {
              setSearchState(results.length ? "success" : "idle");
              setSearchError(null);
            }
          }}
        />
        <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Recent:</span>
            {(recentChips.length ? recentChips : ["SSC CGL", "RRB NTPC", "IBPS PO"]).map((chip) => (
              <button
                key={chip}
                type="button"
                className="text-xs rounded-full border border-border px-2.5 py-1 hover:bg-secondary/60"
                onClick={() => {
                  rememberChip(chip);
                  void runGovSearch(chip);
                }}
              >
                {chip}
              </button>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {FAMILY_FILTERS.map((f) => (
            <button
              key={f.id || "all"}
              type="button"
              className={`text-xs rounded-lg px-2.5 py-1 border ${
                family === f.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
              onClick={() => {
                setFamily(f.id);
                setSyncQuery(searchQ);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="space-y-2" aria-busy={searching} data-testid="gov-exam-search-results">
          {searchState === "error" && !searching && searchError && (
            <InlineErrorRetry
              message={searchError}
              onRetry={() => void runGovSearch(searchQ.trim(), family)}
            />
          )}
          {searchState === "empty" && !searching && (
            <div className="space-y-2" data-testid="gov-exam-search-empty">
              <p className="text-sm text-muted-foreground">
                No exams found for that search. Try another name, alias, or recruiting body.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const q = searchQ.trim() || "requested exam";
                  void requestGovExam({ queryText: q })
                    .then(() => toast.success("Exam request submitted."))
                    .catch((err) =>
                      toast.error(
                        err instanceof Error ? err.message : "Could not submit request.",
                      ),
                    );
                }}
              >
                Request this exam
              </Button>
            </div>
          )}
          {govResults.map((exam) => {
            const bank = exam.bankReadiness;
            const fullSimOk = bank?.fullSimulationAvailable === true;
            const category =
              exam.stateCode?.trim() ||
              exam.jurisdiction?.trim() ||
              exam.family?.trim() ||
              null;
            const stageLabel =
              exam.stage?.name ??
              (exam.stages?.length === 1
                ? exam.stages[0].name
                : exam.stages?.length
                  ? `${exam.stages.length} stage(s)`
                  : null);
            const verified = String(exam.verifiedAt ?? exam.lastVerified ?? "").slice(0, 10) || null;
            const displayName = exam.shortName?.trim() || exam.name;
            return (
            <div
              key={exam.examId}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {displayName}
                  {exam.shortName && exam.shortName !== exam.name ? (
                    <span className="font-normal text-muted-foreground text-sm">
                      {" "}
                      · {exam.name}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {exam.recruitingBody?.name}
                  {category ? ` · ${category}` : ""}
                  {stageLabel ? ` · ${stageLabel}` : ""}
                  {exam.languages?.length ? ` · ${exam.languages.join("/")}` : ""}
                  {exam.pattern
                    ? ` · ${exam.pattern.totalQuestions}Q · ${exam.pattern.durationMinutes}m · −${exam.pattern.negativeMark}`
                    : ""}
                  {verified ? ` · verified ${verified}` : ""}
                </p>
                {bank && (
                  <p
                    className={`text-xs mt-1 ${
                      fullSimOk
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    Bank {formatBankCoverage(bank.approvedPublicCount, bank.requiredQuestions)}
                    {" · "}
                    {typeof bank.approvedPublicCount === "number"
                      ? `${bank.approvedPublicCount} approved`
                      : null}
                    {" · "}
                    {fullSimOk
                      ? "Full simulation available"
                      : "Bank short — Custom Practice Set or AI fill when allowed"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/app/mock-test/exam/${exam.code}`)}
                >
                  View exam
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/app/mock-test/generate?examId=${exam.examId}&stageId=${exam.stage?.id ?? exam.stages[0]?.id ?? ""}&code=${exam.code}`,
                    )
                  }
                >
                  Generate mock
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  title={
                    fullSimOk
                      ? "Full pattern simulation"
                      : bank
                        ? `Bank ${formatBankCoverage(bank.approvedPublicCount, bank.requiredQuestions)} — custom set available`
                        : "AI will generate remaining unique questions"
                  }
                  onClick={() =>
                    navigate(
                      `/app/mock-test/generate?examId=${exam.examId}&stageId=${exam.stage?.id ?? exam.stages[0]?.id ?? ""}&code=${exam.code}&basis=full_sim`,
                    )
                  }
                >
                  Full sim
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      {recentTests.some((t) => t.status === "IN_PROGRESS") && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium mb-2">Continue preparation</p>
          {recentTests
            .filter((t) => t.status === "IN_PROGRESS")
            .slice(0, 1)
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <p className="text-sm truncate">{t.test_name}</p>
                <Button
                  size="sm"
                  onClick={() => navigate(`/app/mock-test/session/${t.id}`)}
                >
                  Continue
                </Button>
              </div>
            ))}
        </section>
      )}

      {/* ── Animated feature preview ───────────────────────── */}
      <LazyMotion features={domAnimation} strict>
        <GovExamShowcase compact className="mb-2" />
      </LazyMotion>

      {/* ── Stats bar: 4 stats including streak ───────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: ClipboardList, label: "Tests Taken",    value: loading ? "—" : String(stats.totalTests) },
          { icon: Target,        label: "Avg Accuracy",   value: loading ? "—" : `${stats.avgAccuracy}%` },
          { icon: BookOpen,      label: "My uploads",     value: loading ? "—" : String(stats.totalQuestions) },
          { icon: Flame,         label: "Day Streak",     value: loading ? "—" : String(stats.streakDays), streak: true },
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
      <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
        <CardContent className="flex items-center justify-between py-4 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
              <Zap className="h-5 w-5 text-primary" />
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

      {/* ── Legacy bank exams (non-registry) ───────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Other bank exams
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Engineering, medical, and PSU banks use the classic configure flow. Government exams are searched above from the live registry.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch gap-4">
          {LEGACY_BANK_EXAMS.map((exam) => (
            <div
              key={exam.id}
              className={`h-full p-4 flex flex-col rounded-xl border ${exam.border} bg-gradient-to-br ${exam.color} transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.badgeColor}`}>
                  {exam.badge}
                </span>
              </div>
              <p className="font-semibold text-foreground">{exam.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3 flex-1">{exam.description}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleExamStart(exam.id)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-background/80 border border-border hover:bg-background transition-colors"
                >
                  Configure
                </button>
                {exam.id !== "CUSTOM" && (
                  <Link
                    to={`/app/mock-test/papers/${exam.id}`}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-background/60 border border-border text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    Papers <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
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
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : recentTests.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState
              icon={FlaskConical}
              title="No tests yet"
              description="Pick an exam type above to take your first test."
              compact
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {recentTests.map((test) => (
              <Card key={test.id} className="hover:border-primary/30 transition-colors">
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
                        className="inline-flex items-center rounded-xl bg-primary/15 border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
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
              title: "My Questions",
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
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:bg-accent/5"
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
    </div>
  );
}
