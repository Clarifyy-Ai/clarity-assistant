// src/pages/app/mock-test/TestConfigure.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock, Zap } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { SessionTrustBanner } from "@/components/session/SessionTrustBanner";
import { toast } from "sonner";
import { resolveExamConfigId } from "@/lib/mock-test/examTypes";
import { launchMockTest } from "@/lib/mock-test/launchMockTest";
import {
  planHasFeature,
  type PlanId,
} from "@/lib/billing/subscriptionManager";

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

const DIFFICULTY_PRESETS: Record<
  DifficultyPreset,
  { dist: DifficultyDistribution; desc: string }
> = {
  BEGINNER: {
    dist: { EASY: 70, MEDIUM: 20, HARD: 10 },
    desc: "Build your fundamentals",
  },
  INTERMEDIATE: {
    dist: { EASY: 20, MEDIUM: 60, HARD: 20 },
    desc: "Test your preparation",
  },
  ADVANCED: {
    dist: { EASY: 10, MEDIUM: 30, HARD: 60 },
    desc: "Push your limits",
  },
  ADAPTIVE: {
    dist: { EASY: 30, MEDIUM: 40, HARD: 30 },
    desc: "Smart difficulty",
  },
};

const QUESTION_COUNT_PRESETS = [10, 20, 30, 50];
const DURATION_PRESETS = [10, 20, 30, 60];

const EXAM_SUBJECTS: Record<string, string[]> = {
  JEE_MAIN: ["Physics", "Chemistry", "Mathematics"],
  JEE_ADV: ["Physics", "Chemistry", "Mathematics"],
  NEET: ["Biology", "Physics", "Chemistry"],
  HPCL_ENGINEER: ["Technical", "English", "Quantitative Aptitude", "Reasoning"],
  PSU: ["General Awareness", "English", "Quantitative Aptitude", "Reasoning"],
  CUSTOM: [],
};

/** Registry government exams use GenerateGovPaper (pattern from get-exam-pattern), not this wizard. */
const REGISTRY_GENERATE_CODES: Record<string, string> = {
  SSC_CGL: "SSC_CGL",
  IBPS_PO: "IBPS_PO",
  UPSC: "UPSC_CSE_PRELIMS",
  RRB_NTPC: "RRB_NTPC",
};

const EXAM_TOPICS: Record<string, string[]> = {
  JEE_MAIN: [
    "Mechanics",
    "Thermodynamics",
    "Electrostatics",
    "Magnetism",
    "Optics",
    "Modern Physics",
    "Organic Chemistry",
    "Inorganic Chemistry",
    "Physical Chemistry",
    "Algebra",
    "Calculus",
    "Trigonometry",
    "Coordinate Geometry",
    "Vectors",
  ],
  JEE_ADV: [
    "Mechanics",
    "Thermodynamics",
    "Electrostatics",
    "Magnetism",
    "Optics",
    "Modern Physics",
    "Organic Chemistry",
    "Inorganic Chemistry",
    "Physical Chemistry",
    "Algebra",
    "Calculus",
    "Trigonometry",
    "Coordinate Geometry",
    "Vectors",
  ],
  NEET: [
    "Cell Biology",
    "Genetics",
    "Human Physiology",
    "Plant Physiology",
    "Ecology",
    "Mechanics",
    "Thermodynamics",
    "Optics",
    "Organic Chemistry",
    "Inorganic Chemistry",
    "Physical Chemistry",
  ],
  UPSC: [
    "History",
    "Geography",
    "Polity",
    "Economy",
    "Science & Technology",
    "Environment",
    "International Relations",
    "Ethics",
  ],
  SSC_CGL: [
    "Number System",
    "Percentage",
    "Ratio",
    "Time & Work",
    "Geometry",
    "Verbal Reasoning",
    "Non-verbal Reasoning",
    "English Grammar",
    "Current Affairs",
  ],
  IBPS_PO: [
    "Number Series",
    "Data Interpretation",
    "Seating Arrangement",
    "Syllogism",
    "Banking Awareness",
    "Reading Comprehension",
  ],
  HPCL_ENGINEER: [
    "Structural Engineering",
    "Soil Mechanics",
    "Fluid Mechanics",
    "Grammar",
    "Comprehension",
    "Quantitative Aptitude",
    "Logical Reasoning",
  ],
  PSU: [
    "Domain Knowledge",
    "English Grammar",
    "Comprehension",
    "Analytical Reasoning",
    "Quantitative Aptitude",
  ],
};

const SOURCE_OPTIONS = [
  { id: "OFFICIAL_PYP", label: "Previous Year Papers", premiumOnly: false },
  { id: "AI_GENERATED", label: "AI-Generated", premiumOnly: true },
  { id: "USER_UPLOAD", label: "My Uploads", premiumOnly: false },
] as const;

const SOURCE_PRESETS = [
  {
    id: "official",
    label: "Official papers only",
    sources: ["OFFICIAL_PYP"] as string[],
    premiumOnly: false,
  },
  {
    id: "mixed",
    label: "Mixed (Official + AI)",
    sources: ["OFFICIAL_PYP", "AI_GENERATED"] as string[],
    premiumOnly: true,
    description: "Pro — fills gaps with analytics-driven AI questions",
  },
  {
    id: "full",
    label: "All sources",
    sources: ["OFFICIAL_PYP", "AI_GENERATED", "USER_UPLOAD"] as string[],
    premiumOnly: true,
    description: "Pro — official, your uploads, and AI gap-fill",
  },
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
  const profile = useAuthStore((s) => s.profile);
  const openUpgradeModal = useUIStore((s) => s.openUpgradeModal);
  const userPlan = (profile?.plan_id ?? profile?.plan ?? "free") as PlanId;
  const canUseAiQuestions = planHasFeature(userPlan, "mock_test_ai");

  const examFromURL = resolveExamConfigId(searchParams.get("exam"));
  const isQuick = searchParams.get("quick") === "true";
  const registryGenerateCode = REGISTRY_GENERATE_CODES[examFromURL];

  useEffect(() => {
    if (isQuick || !registryGenerateCode) return;
    navigate(`/app/mock-test/generate?code=${encodeURIComponent(registryGenerateCode)}`, {
      replace: true,
    });
  }, [isQuick, registryGenerateCode, navigate]);
  const yearMinFromURL = searchParams.get("year_min")
    ? Number(searchParams.get("year_min"))
    : null;
  const yearMaxFromURL = searchParams.get("year_max")
    ? Number(searchParams.get("year_max"))
    : null;

  const [selectedPreset, setSelectedPreset] = useState<DifficultyPreset | null>(
    isQuick ? null : "INTERMEDIATE"
  );
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const autoLaunchedRef = useRef(false);

  const [config, setConfig] = useState<TestConfig>({
    exam_type: isQuick ? "CUSTOM" : examFromURL,
    test_name: isQuick ? "Quick Drill" : `${examFromURL.replace(/_/g, " ")} Practice Test`,
    subjects: [],
    topics: [],
    source_types: ["OFFICIAL_PYP"],
    year_range:
      yearMinFromURL || yearMaxFromURL
        ? { min: yearMinFromURL, max: yearMaxFromURL }
        : null,
    difficulty_distribution: isQuick
      ? { EASY: 30, MEDIUM: 50, HARD: 20 }
      : { EASY: 20, MEDIUM: 60, HARD: 20 },
    question_count: isQuick ? 10 : 30,
    duration_minutes: isQuick ? 10 : 60,
    marks_positive: 4,
    marks_negative: 1,
    randomize_order: true,
    shuffle_options: true,
  });

  useEffect(() => {
    if (!isQuick || !user?.id || autoLaunchedRef.current) return;
    autoLaunchedRef.current = true;
    void handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuick, user?.id]);

  const subjects = EXAM_SUBJECTS[config.exam_type] ?? [];
  const availableTopics = EXAM_TOPICS[config.exam_type] ?? [];

  function toggleSubject(subject: string) {
    setConfig((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter((s) => s !== subject)
        : [...prev.subjects, subject],
    }));
  }

  function toggleTopic(topic: string) {
    setConfig((prev) => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter((t) => t !== topic)
        : [...prev.topics, topic],
    }));
  }

  function toggleSource(source: string) {
    if (source === "AI_GENERATED" && !canUseAiQuestions) {
      openUpgradeModal("pro");
      toast.info("AI-generated exam questions require a Pro plan or higher.");
      return;
    }
    setConfig((prev) => ({
      ...prev,
      source_types: prev.source_types.includes(source)
        ? prev.source_types.filter((s) => s !== source)
        : [...prev.source_types, source],
    }));
  }

  function applySourcePreset(sources: string[], premiumOnly: boolean) {
    if (premiumOnly && !canUseAiQuestions) {
      openUpgradeModal("pro");
      toast.info("Mixed AI papers require a Pro plan or higher.");
      return;
    }
    setConfig((prev) => ({ ...prev, source_types: sources }));
  }

  function setDifficulty(key: keyof DifficultyDistribution, value: number) {
    setConfig((prev) => ({
      ...prev,
      difficulty_distribution: {
        ...prev.difficulty_distribution,
        [key]: value,
      },
    }));
  }

  async function handleStart() {
    if (!user?.id) {
      toast.error("Please log in first.");
      return;
    }

    if (!config.test_name.trim()) {
      toast.error("Please enter a test name.");
      return;
    }

    if (config.source_types.length === 0) {
      toast.error("Please select at least one question source.");
      return;
    }

    if (config.source_types.includes("AI_GENERATED") && !canUseAiQuestions) {
      toast.error("AI-generated questions require a Pro plan. Upgrade or use official papers only.");
      openUpgradeModal("pro");
      return;
    }

    const difficultyTotal = Object.values(config.difficulty_distribution).reduce(
      (sum, value) => sum + value,
      0
    );

    if (difficultyTotal !== 100) {
      toast.error(
        `Difficulty percentages must total 100% (currently ${difficultyTotal}%).`
      );
      return;
    }

    if (
      config.year_range?.min &&
      config.year_range?.max &&
      config.year_range.min > config.year_range.max
    ) {
      toast.error("Year range is invalid. 'From year' cannot be greater than 'To year'.");
      return;
    }

    setLoading(true);

    try {
      const { test_id: testId, question_count, warning, ai_generated_count } =
        await launchMockTest({
          exam_type: config.exam_type,
          test_name: config.test_name,
          subjects: config.subjects,
          topics: config.topics,
          source_types: config.source_types,
          year_range: config.year_range,
          difficulty_distribution: config.difficulty_distribution,
          question_count: config.question_count,
          duration_minutes: config.duration_minutes,
          marks_positive: config.marks_positive,
          marks_negative: config.marks_negative,
          randomize_order: config.randomize_order,
          shuffle_options: config.shuffle_options,
        });

      if (warning) toast.warning(warning);

      toast.success(`Test created with ${question_count} questions.`);
      if (ai_generated_count && ai_generated_count > 0) {
        toast.info(
          `${ai_generated_count} AI questions added from your analytics profile.`,
        );
      }
      navigate(`/app/mock-test/session/${testId}`);
    } catch (err) {
      console.error("[TestConfigure] start error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create test.");
    } finally {
      setLoading(false);
    }
  }

  const difficultyTotal = Object.values(config.difficulty_distribution).reduce(
    (sum, value) => sum + value,
    0
  );

  if (isQuick && loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-semibold text-foreground">
          Selecting your quick drill questions…
        </p>
        <p className="text-sm text-muted-foreground">
          Choosing adaptive questions based on your configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={isQuick ? "Quick Drill Setup" : "Configure Test"}
        description={
          isQuick
            ? "10 adaptive questions · 10 minutes · start instantly"
            : "Customize your test settings before you start."
        }
      />

      <SessionTrustBanner variant="test" />

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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                step === n
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : step > n
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  step > n
                    ? "bg-green-500/20 text-green-400"
                    : step === n
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > n ? "✓" : n}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}

      {!isQuick && step === 1 && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <SectionLabel>Choose Difficulty Level</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {(
                Object.entries(DIFFICULTY_PRESETS) as [
                  DifficultyPreset,
                  { dist: DifficultyDistribution; desc: string }
                ][]
              ).map(([key, { dist, desc }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(key);
                    setConfig((prev) => ({
                      ...prev,
                      difficulty_distribution: { ...dist },
                    }));
                  }}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    selectedPreset === key
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{key}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                  <div className="mt-2 flex gap-1.5">
                    <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                      {dist.EASY}% Easy
                    </span>
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                      {dist.MEDIUM}% Med
                    </span>
                    <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                      {dist.HARD}% Hard
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setStep(2)}>
                Next →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(isQuick || step >= 2) && (
        <>
          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Test Name</SectionLabel>
              <input
                type="text"
                value={config.test_name}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, test_name: e.target.value }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="My Practice Test"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Exam Type</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(EXAM_SUBJECTS).map((examType) => (
                  <button
                    key={examType}
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        exam_type: examType,
                        subjects: [],
                        topics: [],
                        test_name:
                          examType === "CUSTOM"
                            ? prev.test_name
                            : `${examType.replace(/_/g, " ")} Practice Test`,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                      config.exam_type === examType
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {examType.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {subjects.length > 0 && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <SectionLabel>Subjects (select to filter)</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        config.subjects.includes(subject)
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {availableTopics.length > 0 && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <SectionLabel>Topics (optional)</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {availableTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        config.topics.includes(topic)
                          ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                          : "border-border text-muted-foreground hover:border-blue-500/30"
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>

                {config.topics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, topics: [] }))}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear topic filter
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Question Source</SectionLabel>
              <p className="text-xs text-muted-foreground">
                Free users: official previous-year papers and your uploads.
                Pro users can add AI-generated questions — mixed with manual papers and
                tailored to your weak topics from analytics.
              </p>
              <div className="flex flex-wrap gap-2">
                {SOURCE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applySourcePreset(preset.sources, preset.premiumOnly)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                      preset.sources.every((s) => config.source_types.includes(s)) &&
                      config.source_types.length === preset.sources.length
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      {preset.premiumOnly && !canUseAiQuestions && (
                        <Lock className="h-3 w-3 text-amber-400" />
                      )}
                      {preset.label}
                    </span>
                    {"description" in preset && preset.description && (
                      <span className="mt-0.5 block text-[10px] opacity-80">
                        {preset.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((src) => {
                  const locked = src.premiumOnly && !canUseAiQuestions;
                  return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => toggleSource(src.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      config.source_types.includes(src.id)
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : locked
                          ? "border-amber-500/30 text-amber-500/80 hover:border-amber-500/50"
                          : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {locked && <Lock className="mr-1 inline h-3 w-3" />}
                    {src.label}
                    {src.id === "AI_GENERATED" && (
                      <span className="ml-1 text-[10px] opacity-70">Pro</span>
                    )}
                  </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Year Range (Previous Year Papers)</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">From year</p>
                  <input
                    type="number"
                    min={2000}
                    max={new Date().getFullYear()}
                    placeholder="e.g. 2018"
                    value={config.year_range?.min ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        year_range: {
                          min: e.target.value ? Number(e.target.value) : null,
                          max: prev.year_range?.max ?? null,
                        },
                      }))
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">To year</p>
                  <input
                    type="number"
                    min={2000}
                    max={new Date().getFullYear()}
                    placeholder={String(new Date().getFullYear())}
                    value={config.year_range?.max ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        year_range: {
                          min: prev.year_range?.min ?? null,
                          max: e.target.value ? Number(e.target.value) : null,
                        },
                      }))
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-4">
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
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          question_count: Number(e.target.value),
                        }))
                      }
                      className="flex-1 accent-primary"
                    />
                    <span className="w-8 text-right text-sm font-bold text-foreground">
                      {config.question_count}
                    </span>
                  </div>
                </div>
                <div>
                  <SectionLabel>Duration (mins)</SectionLabel>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={180}
                      step={5}
                      value={config.duration_minutes}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          duration_minutes: Number(e.target.value),
                        }))
                      }
                      className="flex-1 accent-primary"
                    />
                    <span className="w-8 text-right text-sm font-bold text-foreground">
                      {config.duration_minutes}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Difficulty Distribution (%)</SectionLabel>
              {(["EASY", "MEDIUM", "HARD"] as const).map((difficulty) => (
                <div key={difficulty} className="flex items-center gap-3">
                  <span
                    className={`w-14 text-xs font-semibold ${
                      difficulty === "EASY"
                        ? "text-green-400"
                        : difficulty === "MEDIUM"
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {difficulty}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={config.difficulty_distribution[difficulty]}
                    onChange={(e) =>
                      setDifficulty(difficulty, Number(e.target.value))
                    }
                    className="flex-1 accent-primary"
                  />
                  <span className="w-8 text-right text-xs font-bold text-foreground">
                    {config.difficulty_distribution[difficulty]}%
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                Sum: {difficultyTotal}%
                {difficultyTotal !== 100 && (
                  <span className="ml-1 text-amber-400">(should total 100%)</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Marking Scheme</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Correct (+)</p>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={config.marks_positive}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        marks_positive: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Wrong (−)</p>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.25}
                    value={config.marks_negative}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        marks_negative: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.randomize_order}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      randomize_order: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm text-foreground">Randomize question order</span>
              </label>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.shuffle_options}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      shuffle_options: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm text-foreground">
                  Shuffle answer options (A/B/C/D)
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              <SectionLabel>Quick Select — Questions</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {QUESTION_COUNT_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, question_count: n }))
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      config.question_count === n
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {n} Qs
                  </button>
                ))}
              </div>

              <SectionLabel>Quick Select — Duration</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, duration_minutes: m }))
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      config.duration_minutes === m
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, duration_minutes: 0 }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    config.duration_minutes === 0
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  No limit
                </button>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-primary">2 credits</span> will be
              deducted when the test is created successfully. Free plan: up to 2 tests
              per month.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
            <p className="mb-1 font-semibold">Test Summary</p>
            <p className="text-xs text-muted-foreground">
              {config.question_count} questions ·{" "}
              {config.duration_minutes > 0
                ? `${config.duration_minutes} minutes`
                : "No time limit"}{" "}
              · {selectedPreset ?? "Custom"} difficulty ·{" "}
              {config.subjects.length > 0 ? config.subjects.join(" + ") : "All subjects"}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/app/mock-test")}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleStart} className="flex-1" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Start Test
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
