// @ts-nocheck
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Zap, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

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

function Label({ children }: { children: React.ReactNode }) {
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

  const [config, setConfig] = useState({
    exam_type:              isQuick ? "CUSTOM" : examFromURL,
    test_name:              isQuick ? "Quick Drill" : `${examFromURL.replace(/_/g, " ")} Practice Test`,
    subjects:               isQuick ? [] : (EXAM_SUBJECTS[examFromURL] ?? []),
    topics:                 [] as string[],
    source_types:           ["OFFICIAL_PYP", "AI_GENERATED"] as string[],
    year_range:             yearMinFromURL || yearMaxFromURL
      ? { min: yearMinFromURL, max: yearMaxFromURL }
      : null as { min: number | null; max: number | null } | null,
    difficulty_distribution: isQuick
      ? { EASY: 30, MEDIUM: 50, HARD: 20 }
      : { EASY: 30, MEDIUM: 40, HARD: 30 },
    question_count:         isQuick ? 10 : 30,
    duration_minutes:       isQuick ? 10 : 60,
    marks_positive:         4,
    marks_negative:         1,
    randomize_order:        true,
  });

  const [loading, setLoading] = useState(false);

  const subjects = EXAM_SUBJECTS[config.exam_type] ?? [];
  const availableTopics = EXAM_TOPICS[config.exam_type] ?? [];

  function toggleSubject(s: string) {
    setConfig((c) => ({
      ...c,
      subjects: c.subjects.includes(s)
        ? c.subjects.filter((x) => x !== s)
        : [...c.subjects, s],
    }));
  }

  function toggleTopic(t: string) {
    setConfig((c) => ({
      ...c,
      topics: c.topics.includes(t)
        ? c.topics.filter((x) => x !== t)
        : [...c.topics, t],
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

  function setDifficulty(key: "EASY" | "MEDIUM" | "HARD", val: number) {
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
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await supabase.functions.invoke("select-test-questions", {
        body: { config },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      const { question_ids } = res.data as { question_ids: string[] };

      if (!question_ids || question_ids.length === 0) {
        toast.error("No questions found matching your criteria. Try different settings or add more questions to your bank.");
        return;
      }

      const { data: newTest, error: insertErr } = await supabase
        .from("mock_tests")
        .insert({
          user_id:            user.id,
          test_name:          config.test_name,
          config,
          question_ids,
          status:             "DRAFT",
          time_limit_minutes: config.duration_minutes,
        })
        .select("id")
        .single();

      if (insertErr || !newTest) {
        throw new Error(insertErr?.message ?? "Failed to create test");
      }

      toast.success(`Test created with ${question_ids.length} questions!`);
      navigate(`/app/mock-test/session/${newTest.id}`);
    } catch (err: any) {
      console.error("[TestConfigure] start error:", err);
      toast.error(err.message ?? "Failed to create test");
    } finally {
      setLoading(false);
    }
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

      {/* ── Test name ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <Label>Test Name</Label>
          <input
            type="text"
            value={config.test_name}
            onChange={(e) => setConfig((c) => ({ ...c, test_name: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            placeholder="My Practice Test"
          />
        </CardContent>
      </Card>

      {/* ── Exam type ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <Label>Exam Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {Object.keys(EXAM_SUBJECTS).map((et) => (
              <button
                key={et}
                type="button"
                onClick={() => {
                  setConfig((c) => ({
                    ...c,
                    exam_type: et,
                    subjects: EXAM_SUBJECTS[et] ?? [],
                    topics: [],
                    test_name: et === "CUSTOM" ? c.test_name : `${et.replace(/_/g, " ")} Practice Test`,
                  }));
                }}
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

      {/* ── Subjects ── */}
      {subjects.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <Label>Subjects (select to filter)</Label>
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

      {/* ── Topics ── */}
      {availableTopics.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <Label>Topics (optional — leave empty for all topics)</Label>
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

      {/* ── Source ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <Label>Question Source</Label>
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

      {/* ── Year range ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <Label>Year Range (for Previous Year Papers)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">From year</p>
              <input
                type="number"
                min="2000"
                max={new Date().getFullYear()}
                placeholder="e.g. 2018"
                value={config.year_range?.min ?? ""}
                onChange={(e) => setConfig((c) => ({
                  ...c,
                  year_range: { min: e.target.value ? Number(e.target.value) : null, max: c.year_range?.max ?? null },
                }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">To year</p>
              <input
                type="number"
                min="2000"
                max={new Date().getFullYear()}
                placeholder={String(new Date().getFullYear())}
                value={config.year_range?.max ?? ""}
                onChange={(e) => setConfig((c) => ({
                  ...c,
                  year_range: { min: c.year_range?.min ?? null, max: e.target.value ? Number(e.target.value) : null },
                }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Question count & Duration ── */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Questions</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
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
              <Label>Duration (mins)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="180"
                  step="5"
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

      {/* ── Difficulty distribution ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <Label>Difficulty Distribution (%)</Label>
          {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
            <div key={d} className="flex items-center gap-3">
              <span className={`text-xs font-semibold w-14 ${
                d === "EASY" ? "text-green-400" : d === "MEDIUM" ? "text-amber-400" : "text-red-400"
              }`}>
                {d}
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
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
            Sum: {Object.values(config.difficulty_distribution).reduce((a, b) => a + b, 0)}%
            {Object.values(config.difficulty_distribution).reduce((a, b) => a + b, 0) !== 100 && (
              <span className="text-amber-400 ml-1">(should total 100%)</span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── Marking scheme ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <Label>Marking Scheme</Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Correct (+)</p>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={config.marks_positive}
                onChange={(e) => setConfig((c) => ({ ...c, marks_positive: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Wrong (−)</p>
              <input
                type="number"
                min="0"
                max="5"
                step="0.25"
                value={config.marks_negative}
                onChange={(e) => setConfig((c) => ({ ...c, marks_negative: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Options ── */}
      <Card>
        <CardContent className="py-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.randomize_order}
              onChange={(e) => setConfig((c) => ({ ...c, randomize_order: e.target.checked }))}
              className="accent-violet-500 w-4 h-4"
            />
            <span className="text-sm text-foreground">Randomize question order</span>
          </label>
        </CardContent>
      </Card>

      {/* ── Info row ── */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="text-violet-300 font-semibold">2 credits</span> will be deducted when you start the test.
          Free plan: up to 2 tests per month.
        </p>
      </div>

      {/* ── Start button ── */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/app/mock-test")} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleStart} loading={loading} className="flex-1">
          <Zap className="h-4 w-4 mr-2" />
          Start Test
        </Button>
      </div>
    </div>
  );
}
