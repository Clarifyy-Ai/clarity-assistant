// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Zap } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

interface DifficultyDistribution {
  EASY: number;
  MEDIUM: number;
  HARD: number;
}

interface YearRange {
  min: number | null;
  max: number | null;
}

interface TestConfig {
  exam_type: string;
  test_name: string;
  subjects: string[];
  topics: string[];
  source_types: string[];
  year_range: YearRange | null;
  difficulty_distribution: DifficultyDistribution;
  question_count: number;
  duration_minutes: number;
  marks_positive: number;
  marks_negative: number;
  randomize_order: boolean;
  shuffle_options: boolean;
}

type DifficultyPreset = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ADAPTIVE";

const DIFFICULTY_PRESETS: Record<DifficultyPreset, { dist: DifficultyDistribution; desc: string }> = {
  BEGINNER:     { dist: { EASY: 70, MEDIUM: 20, HARD: 10 }, desc: "Build your fundamentals" },
  INTERMEDIATE: { dist: { EASY: 20, MEDIUM: 60, HARD: 20 }, desc: "Test your preparation" },
  ADVANCED:     { dist: { EASY: 10, MEDIUM: 30, HARD: 60 }, desc: "Push your limits" },
  ADAPTIVE:     { dist: { EASY: 30, MEDIUM: 40, HARD: 30 }, desc: "Smart difficulty" },
};

const QUESTION_COUNT_PRESETS = [10, 20, 30, 50];
const DURATION_PRESETS = [10, 20, 30, 60];

const EXAM_SUBJECTS: Record<string, string[]> = {
  JEE_MAIN: ["Physics", "Chemistry", "Mathematics"],
  JEE_ADV:  ["Physics", "Chemistry", "Mathematics"],
  NEET:     ["Biology", "Physics", "Chemistry"],
  UPSC:     ["General Studies", "Current Affairs", "Essay"],
  SSC_CGL:  ["Reasoning", "Quantitative Aptitude", "English", "General Knowledge"],
  IBPS_PO:  ["Reasoning", "Quantitative Aptitude", "English", "Computer Awareness", "Banking"],
  CUSTOM:   [],
};

const EXAM_TOPICS: Record<string, string[]> = {
  JEE_MAIN: [
    "Mechanics", "Thermodynamics", "Electrostatics", "Magnetism", "Optics", "Modern Physics",
    "Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry",
    "Algebra", "Calculus", "Trigonometry", "Coordinate Geometry", "Vectors",
  ],
  JEE_ADV: [
    "Mechanics", "Thermodynamics", "Electrostatics", "Magnetism", "Optics", "Modern Physics",
    "Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry",
    "Algebra", "Calculus", "Trigonometry", "Coordinate Geometry", "Vectors",
  ],
  NEET: [
    "Cell Biology", "Genetics", "Human Physiology", "Plant Physiology", "Ecology",
    "Mechanics", "Thermodynamics", "Optics",
    "Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry",
  ],
  UPSC: [
    "History", "Geography", "Polity", "Economy", "Science & Technology",
    "Environment", "International Relations", "Ethics",
  ],
  SSC_CGL: [
    "Number System", "Percentage", "Ratio", "Time & Work", "Geometry",
    "Verbal Reasoning", "Non-verbal Reasoning", "English Grammar", "Current Affairs",
  ],
  IBPS_PO: [
    "Number Series", "Data Interpretation", "Seating Arrangement", "Syllogism",
    "Banking Awareness", "Reading Comprehension",
  ],
};

const SOURCE_OPTIONS = [
  { id: "OFFICIAL_PYP",  label: "Previous Year Papers" },
  { id: "AI_GENERATED",  label: "AI-Generated" },
  { id: "USER_UPLOAD",   label: "My Uploads" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  );
}

export default function TestConfigure() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const examFromURL = searchParams.get("exam") ?? "JEE_MAIN";
  const isQuick = searchParams.get("quick") === "true";
  const yearMinFromURL = searchParams.get("year_min") ? Number(searchParams.get("year_min")) : null;
  const yearMaxFromURL = searchParams.get("year_max") ? Number(searchParams.get("year_max")) : null;

  const [selectedPreset, setSelectedPreset] = useState<DifficultyPreset | null>(isQuick ? null : "INTERMEDIATE");
  const [step, setStep] = useState(1);

  const [config, setConfig] = useState<TestConfig>({
    exam_type:              isQuick ? "CUSTOM" : examFromURL,
    test_name:              isQuick ? "Quick Drill" : `${examFromURL.replace(/_/g, " ")} Practice Test`,
    subjects:               isQuick ? [] : (EXAM_SUBJECTS[examFromURL] ?? []),
    topics:                 [],
    source_types:           ["OFFICIAL_PYP", "AI_GENERATED"],
    year_range:             yearMinFromURL || yearMaxFromURL
      ? { min: yearMinFromURL, max: yearMaxFromURL }
      : null,
    difficulty_distribution: isQuick
      ? { EASY: 30, MEDIUM: 50, HARD: 20 }
      : { EASY: 20, MEDIUM: 60, HARD: 20 },
    question_count:         isQuick ? 10 : 30,
    duration_minutes:       isQuick ? 10 : 60,
    marks_positive:         4,
    marks_negative:         1,
    randomize_order:        true,
    shuffle_options:        true,
  });

  const [loading, setLoading] = useState(false);
  const autoLaunchedRef = useRef(false);

  // Quick Drill fast-path: auto-launch without showing configurator UI
  useEffect(() => {
    if (!isQuick || !user?.id || autoLaunchedRef.current) return;
    autoLaunchedRef.current = true;
    void handleStart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const subjects = EXAM_SUBJECTS[config.exam_type] ?? [];
  const availableTopics = EXAM_TOPICS[config.exam_type] ?? [];

  function toggleSubject(s: string) {
    setConfig((c) => ({
      ...c,
      subjects: c.subjects.includes(s) ? c.subjects.filter((x) => x !== s) : [...c.subjects, s],
    }));
  }

  function toggleTopic(t: string) {
    setConfig((c) => ({
      ...c,
      topics: c.topics.includes(t) ? c.topics.filter((x) => x !== t) : [...c.topics, t],
    }));
  }

  function toggleSource(s: string) {
    setConfig((c) => ({
      ...c,
      source_types: c.source_types.includes(s)
        ? c.source_types.filter((x) => x !== s)
        : [...c.source_types, s],
    }));
  }

  function setDifficulty(key: keyof DifficultyDistribution, val: number) {
    setConfig((c) => ({
      ...c,
      difficulty_distribution: { ...c.difficulty_distribution, [key]: val },
    }));
  }

  async function handleStart() {
    if (!user?.id) return;
    if (!config.test_name.trim()) {
      toast.error("Please enter a test name");
      return;
    }

    const difficultyTotal = Object.values(config.difficulty_distribution).reduce((a, b) => a + b, 0);
    if (difficultyTotal !== 100) {
      toast.error(`Difficulty percentages must total 100% (currently ${difficultyTotal}%). Please adjust the sliders.`);
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // Step 1: Select questions (validates quota + credit balance, no deduction yet)
      const selectRes = await supabase.functions.invoke("select-test-questions", {
        body: { config },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (selectRes.error) throw new Error(selectRes.error.message);
      const selectData = selectRes.data as { question_ids?: string[]; error?: string; code?: string };
      if (selectData?.error) throw new Error(selectData.error);
      const { question_ids } = selectData;

      if (!question_ids || question_ids.length === 0) {
        toast.error(
          "No questions found matching your criteria. Try different settings or add more questions."
        );
        return;
      }

      // Step 2: Atomically deduct credits and insert test row
      const createRes = await supabase.functions.invoke("create-test", {
        body: {
          test_name: config.test_name,
          config,
          question_ids,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (createRes.error) throw new Error(createRes.error.message);
      const createData = createRes.data as { test_id?: string; error?: string };
      if (createData?.error) throw new Error(createData.error);

      const { test_id } = createData;
      if (!test_id) throw new Error("No test ID returned");

      toast.success(`Test created with ${question_ids.length} questions!`);
      navigate(`/app/mock-test/session/${test_id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create test";
      console.error("[TestConfigure] start error:", err);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const difficultyTotal = Object.values(config.difficulty_distribution).reduce((a, b) => a + b, 0);

  // Quick Drill auto-launches — show loading screen instead of configurator UI
  if (isQuick && loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-3 border-violet-500 border-t-transparent" />
        <p className="text-lg font-semibold text-foreground">Selecting your 10 quick questions…</p>
        <p className="text-sm text-muted-foreground">Choosing adaptive questions based on your performance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={isQuick ? "Quick Drill Setup" : "Configure Test"}
        description={
          isQuick
            ? "10 adaptive questions · 10 minutes · start instantly"
            : "Customize your test settings before you start."
        }
      />

      {/* Step indicator */}
      {!isQuick && (
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: "Level" },
            { n: 2, label: "Settings" },
            { n: 3, label: "Start" },
          ].map(({ n, label }) => (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                step === n
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                  : step > n
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-border text-muted-foreground"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step > n ? "bg-green-500/20 text-green-400" : step === n ? "bg-violet-500/20 text-violet-300" : "bg-muted text-muted-foreground"
              }`}>{step > n ? "✓" : n}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Step 1: Level Selection */}
      {(isQuick || step === 1) && !isQuick && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <SectionLabel>Choose Difficulty Level</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(DIFFICULTY_PRESETS) as [DifficultyPreset, { dist: DifficultyDistribution; desc: string }][]).map(([key, { dist, desc }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(key);
                    setConfig((c) => ({ ...c, difficulty_distribution: { ...dist } }));
                  }}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    selectedPreset === key
                      ? "border-violet-500/50 bg-violet-500/10"
                      : "border-border hover:border-violet-500/30"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{key}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  <div className="flex gap-1.5 mt-2">
                    <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full">{dist.EASY}% Easy</span>
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full">{dist.MEDIUM}% Med</span>
                    <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full">{dist.HARD}% Hard</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setStep(2)}>Next →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Settings */}
      {(isQuick || step >= 2) && (
      <>
      {/* Test name */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Test Name</SectionLabel>
          <input
            type="text"
            value={config.test_name}
            onChange={(e) => setConfig((c) => ({ ...c, test_name: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            placeholder="My Practice Test"
          />
        </CardContent>
      </Card>

      {/* Exam type */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Exam Type</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {Object.keys(EXAM_SUBJECTS).map((et) => (
              <button
                key={et}
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    exam_type: et,
                    subjects: EXAM_SUBJECTS[et] ?? [],
                    topics: [],
                    test_name: et === "CUSTOM" ? c.test_name : `${et.replace(/_/g, " ")} Practice Test`,
                  }))
                }
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all border ${
                  config.exam_type === et
                    ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                    : "border-border text-muted-foreground hover:border-violet-500/30"
                }`}
              >
                {et.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subjects */}
      {subjects.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <SectionLabel>Subjects (select to filter)</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSubject(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                    config.subjects.includes(s)
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                      : "border-border text-muted-foreground hover:border-violet-500/30"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Topics */}
      {availableTopics.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <SectionLabel>Topics (optional — leave empty for all)</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {availableTopics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTopic(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                    config.topics.includes(t)
                      ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                      : "border-border text-muted-foreground hover:border-blue-500/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {config.topics.length > 0 && (
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, topics: [] }))}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear topic filter
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Question source */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Question Source</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {SOURCE_OPTIONS.map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => toggleSource(src.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                  config.source_types.includes(src.id)
                    ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                    : "border-border text-muted-foreground hover:border-violet-500/30"
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Year range */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Year Range (for Previous Year Papers)</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">From year</p>
              <input
                type="number"
                min={2000}
                max={new Date().getFullYear()}
                placeholder="e.g. 2018"
                value={config.year_range?.min ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    year_range: {
                      min: e.target.value ? Number(e.target.value) : null,
                      max: c.year_range?.max ?? null,
                    },
                  }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">To year</p>
              <input
                type="number"
                min={2000}
                max={new Date().getFullYear()}
                placeholder={String(new Date().getFullYear())}
                value={config.year_range?.max ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    year_range: {
                      min: c.year_range?.min ?? null,
                      max: e.target.value ? Number(e.target.value) : null,
                    },
                  }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Question count and duration */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <SectionLabel>Questions</SectionLabel>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={config.question_count}
                  onChange={(e) => setConfig((c) => ({ ...c, question_count: Number(e.target.value) }))}
                  className="flex-1 accent-violet-500"
                />
                <span className="text-sm font-bold text-foreground w-8 text-right">
                  {config.question_count}
                </span>
              </div>
            </div>
            <div>
              <SectionLabel>Duration (mins)</SectionLabel>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={180}
                  step={5}
                  value={config.duration_minutes}
                  onChange={(e) => setConfig((c) => ({ ...c, duration_minutes: Number(e.target.value) }))}
                  className="flex-1 accent-violet-500"
                />
                <span className="text-sm font-bold text-foreground w-8 text-right">
                  {config.duration_minutes}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Difficulty distribution */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Difficulty Distribution (%)</SectionLabel>
          {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
            <div key={d} className="flex items-center gap-3">
              <span
                className={`text-xs font-semibold w-14 ${
                  d === "EASY" ? "text-green-400" : d === "MEDIUM" ? "text-amber-400" : "text-red-400"
                }`}
              >
                {d}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={config.difficulty_distribution[d]}
                onChange={(e) => setDifficulty(d, Number(e.target.value))}
                className="flex-1 accent-violet-500"
              />
              <span className="text-xs font-bold text-foreground w-8 text-right">
                {config.difficulty_distribution[d]}%
              </span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Sum: {difficultyTotal}%
            {difficultyTotal !== 100 && (
              <span className="text-amber-400 ml-1">(should total 100%)</span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Marking scheme */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Marking Scheme</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Correct (+)</p>
              <input
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={config.marks_positive}
                onChange={(e) => setConfig((c) => ({ ...c, marks_positive: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Wrong (−)</p>
              <input
                type="number"
                min={0}
                max={5}
                step={0.25}
                value={config.marks_negative}
                onChange={(e) => setConfig((c) => ({ ...c, marks_negative: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.randomize_order}
              onChange={(e) => setConfig((c) => ({ ...c, randomize_order: e.target.checked }))}
              className="accent-violet-500 w-4 h-4"
            />
            <span className="text-sm text-foreground">Randomize question order</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.shuffle_options}
              onChange={(e) => setConfig((c) => ({ ...c, shuffle_options: e.target.checked }))}
              className="accent-violet-500 w-4 h-4"
            />
            <span className="text-sm text-foreground">Shuffle answer options (A/B/C/D)</span>
          </label>
        </CardContent>
      </Card>

      {/* Question count presets */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <SectionLabel>Quick Select — Questions</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            {QUESTION_COUNT_PRESETS.map((n) => (
              <button key={n} type="button" onClick={() => setConfig((c) => ({ ...c, question_count: n }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${config.question_count === n ? "border-violet-500/50 bg-violet-500/15 text-violet-300" : "border-border text-muted-foreground hover:border-violet-500/30"}`}
              >{n} Qs</button>
            ))}
          </div>
          <SectionLabel>Quick Select — Duration</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            {DURATION_PRESETS.map((m) => (
              <button key={m} type="button" onClick={() => setConfig((c) => ({ ...c, duration_minutes: m }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${config.duration_minutes === m ? "border-violet-500/50 bg-violet-500/15 text-violet-300" : "border-border text-muted-foreground hover:border-violet-500/30"}`}
              >{m} min</button>
            ))}
            <button type="button" onClick={() => setConfig((c) => ({ ...c, duration_minutes: 0 }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${config.duration_minutes === 0 ? "border-violet-500/50 bg-violet-500/15 text-violet-300" : "border-border text-muted-foreground hover:border-violet-500/30"}`}
            >No limit</button>
          </div>
        </CardContent>
      </Card>

      </>
      )}

      {/* Step 3: Summary + Start */}
      {(isQuick || step >= 2) && (
      <>
      {/* Credit notice */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="text-violet-300 font-semibold">2 credits</span> will be deducted when the
          test is created successfully. Free plan: up to 2 tests per month.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
        <p className="font-semibold mb-1">Test Summary</p>
        <p className="text-muted-foreground text-xs">
          {config.question_count} questions · {config.duration_minutes > 0 ? `${config.duration_minutes} minutes` : "No time limit"} · {selectedPreset ?? "Custom"} difficulty · {config.subjects.length > 0 ? config.subjects.join(" + ") : "All subjects"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/app/mock-test")} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleStart} loading={loading} className="flex-1">
          <Zap className="h-4 w-4 mr-2" />
          Start Test
        </Button>
      </div>
      </>
      )}
    </div>
  );
}
