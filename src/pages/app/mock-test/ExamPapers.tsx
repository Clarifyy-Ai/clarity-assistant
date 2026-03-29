// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronRight, ArrowLeft, Filter, FileText, Layers, Calendar,
  Play, BookOpen, Trophy, BarChart2, TrendingUp, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ExamPaper {
  id: string;
  exam_type: string;
  exam_name: string;
  year: number;
  session?: string;
  shift?: string;
  total_questions?: number;
  total_marks?: number;
  duration_minutes?: number;
  difficulty_level?: string;
  subject_breakdown?: string[];
}

const EXAM_LABELS: Record<string, string> = {
  JEE_MAIN: "JEE Main", JEE_ADV: "JEE Advanced", NEET: "NEET UG",
  UPSC: "UPSC CSE", SSC_CGL: "SSC CGL", IBPS_PO: "IBPS PO", CUSTOM: "Custom",
};

const OFFICIAL_SETTINGS: Record<string, { questions: number; duration: number; positive: number; negative: number }> = {
  JEE_MAIN: { questions: 90, duration: 180, positive: 4, negative: 1 },
  JEE_ADV: { questions: 54, duration: 180, positive: 4, negative: 1 },
  NEET: { questions: 180, duration: 200, positive: 4, negative: 1 },
  UPSC: { questions: 100, duration: 120, positive: 2, negative: 0.66 },
  SSC_CGL: { questions: 100, duration: 60, positive: 2, negative: 0.5 },
  IBPS_PO: { questions: 100, duration: 60, positive: 1, negative: 0.25 },
};

export default function ExamPapers() {
  const { examType } = useParams<{ examType: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  
  // Filters
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");
  const [durationFilter, setDurationFilter] = useState<string>("All");
  
  // Progress Data
  const [attemptedIds, setAttemptedIds] = useState<Set<string>>(new Set());
  const [averageScore, setAverageScore] = useState<number>(0);
  const [bestPerformance, setBestPerformance] = useState<string>("--");

  useEffect(() => {
    if (!examType) return;
    void loadData();
  }, [examType]);

  async function loadData() {
    setLoading(true);
    try {
      const [papersRes, testsRes] = await Promise.all([
        supabase
          .from("exam_papers")
          .select("*")
          .eq("exam_type", (examType ?? "").toUpperCase())
          .order("year", { ascending: false }),
        user?.id ? supabase
          .from("mock_tests")
          .select("config, overall_score, test_name")
          .eq("user_id", user.id)
          .eq("status", "COMPLETED") : Promise.resolve({ data: [] }),
      ]);
      
      const loadedPapers = (papersRes.data ?? []) as unknown as ExamPaper[];
      setPapers(loadedPapers);

      // Process Progress Tracker
      const userTests = testsRes.data ?? [];
      const attempted = new Set<string>();
      let totalScore = 0;
      let maxScore = -1;
      let bestTest = "--";

      userTests.forEach((t) => {
        const config = t.config as any;
        if (config?.exam_type === (examType ?? "").toUpperCase()) {
           attempted.add(config.year_range?.min?.toString() || "");
           if (t.overall_score) {
             totalScore += t.overall_score;
             if (t.overall_score > maxScore) {
               maxScore = t.overall_score;
               bestTest = t.test_name || "--";
             }
           }
        }
      });

      setAttemptedIds(attempted);
      if (attempted.size > 0) setAverageScore(Math.round(totalScore / attempted.size));
      if (maxScore > -1) setBestPerformance(`${bestTest} (${maxScore}%)`);

    } catch (err) {
      console.error("[ExamPapers] load error:", err);
      toast.error("Failed to load exam papers.");
    } finally {
      setLoading(false);
    }
  }

  // Derived Values
  const years = [...new Set(papers.map((p) => p.year))].sort((a, b) => b - a);
  const examLabel = EXAM_LABELS[(examType ?? "").toUpperCase()] ?? examType ?? "Exam";
  const officialSettings = OFFICIAL_SETTINGS[(examType ?? "").toUpperCase()];

  // Filtering System
  const filtered = papers.filter((p) => {
    if (yearFilter && p.year !== yearFilter) return false;
    if (difficultyFilter !== "All" && p.difficulty_level !== difficultyFilter) return false;
    if (durationFilter !== "All") {
      const dur = p.duration_minutes || officialSettings?.duration || 60;
      if (durationFilter === "Under 30 min" && dur >= 30) return false;
      if (durationFilter === "30-60 min" && (dur < 30 || dur > 60)) return false;
      if (durationFilter === "Full Paper" && dur <= 60) return false;
    }
    return true;
  });

  // Prompt 6: ONE-CLICK LAUNCH ALGORITHM
  async function launchDirectTest(paper: ExamPaper, isPractice: boolean) {
    if (!user?.id) return;
    setLaunchingId(paper.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const s = officialSettings ?? { questions: paper.total_questions ?? 30, duration: paper.duration_minutes ?? 60, positive: 4, negative: 1 };
      
      const config = {
        exam_type: paper.exam_type,
        test_name: `${paper.exam_name} ${paper.year} ${paper.shift ? `Shift ${paper.shift}` : ''}`.trim() + (isPractice ? " (Practice Mode)" : ""),
        subjects: [], // Pulls all subjects associated with exam naturally
        topics: [],
        source_types: ["OFFICIAL_PYP"],
        year_range: { min: paper.year, max: paper.year },
        difficulty_distribution: { EASY: 30, MEDIUM: 40, HARD: 30 },
        question_count: s.questions,
        duration_minutes: isPractice ? 0 : s.duration,
        marks_positive: s.positive,
        marks_negative: s.negative,
        randomize_order: false,
        shuffle_options: !isPractice, // Keeps logic straightforward for Practice Mode
        practice_mode: isPractice, 
      };

      const selectRes = await supabase.functions.invoke("select-test-questions", {
        body: { config }, headers: { Authorization: `Bearer ${token}` }
      });
      if (selectRes.error) throw new Error(selectRes.error.message);
      
      const { question_ids } = selectRes.data;
      if (!question_ids || question_ids.length === 0) {
        throw new Error("No questions available for this paper in the database yet.");
      }

      const createRes = await supabase.functions.invoke("create-test", {
        body: { test_name: config.test_name, config, question_ids },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (createRes.error) throw new Error(createRes.error.message);
      
      toast.success(isPractice ? `Starting Practice Mode...` : `Starting full ${paper.exam_name} ${paper.year} Exam!`);
      navigate(`/app/mock-test/session/${createRes.data.test_id}`);
      
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to launch test automatically.");
      // Fallback redirect to manual config
      navigate(`/app/mock-test/configure?exam=${paper.exam_type}&year_min=${paper.year}&year_max=${paper.year}`);
    } finally {
      setLaunchingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={examLabel + " Papers"}
        description={`Browse and one-click start full official ${examLabel} question papers.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/app/mock-test")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Hub
          </Button>
        }
      />

      {/* PROGRESS TRACKER PER EXAM TYPE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary"><BarChart2 className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attempted</p>
              <p className="text-2xl font-black text-foreground">{attemptedIds.size} <span className="text-sm font-medium text-muted-foreground">/ {papers.length} papers</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><TrendingUp className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Average Score</p>
              <p className="text-2xl font-black text-foreground">{averageScore}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500"><Trophy className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Best Performance</p>
              <p className="text-sm font-bold text-foreground truncate max-w-[150px]" title={bestPerformance}>{bestPerformance}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ADVANCED FILTER BAR */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-center justify-between bg-card p-3 rounded-xl border border-border">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <Filter className="h-4 w-4 text-muted-foreground mx-1" />
          
          <Select value={yearFilter ? String(yearFilter) : "All"} onValueChange={(v) => setYearFilter(v === "All" ? null : Number(v))}>
            <SelectTrigger className="w-[120px] h-8 text-xs font-medium"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Years</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs font-medium"><SelectValue placeholder="Difficulty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Difficulties</SelectItem>
              <SelectItem value="EASY">Easy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HARD">Hard</SelectItem>
            </SelectContent>
          </Select>

          <Select value={durationFilter} onValueChange={setDurationFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs font-medium"><SelectValue placeholder="Duration" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">Any Duration</SelectItem>
              <SelectItem value="Under 30 min">Under 30 min</SelectItem>
              <SelectItem value="30-60 min">30-60 min</SelectItem>
              <SelectItem value="Full Paper">Full Paper (>60m)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 rounded-xl bg-muted/20 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">No papers match your filters</p>
            <Button size="sm" onClick={() => navigate(`/app/mock-test/configure?exam=${(examType ?? "").toUpperCase()}`)}>
              Create Custom AI Test <ChevronRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((paper) => {
            const qsCount = paper.total_questions || officialSettings?.questions || 30;
            const timeLimit = paper.duration_minutes || officialSettings?.duration || 60;
            const hasAttempted = attemptedIds.has(String(paper.year));

            return (
              <Card key={paper.id} className={cn("hover:border-primary/40 transition-all group overflow-hidden relative", hasAttempted ? "bg-muted/10 border-border" : "bg-card shadow-sm")}>
                
                {hasAttempted && (
                  <div className="absolute top-3 right-3 text-green-500 bg-green-500/10 rounded-full p-1 shadow-sm">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}

                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base leading-tight">
                        {paper.exam_name} {paper.year}
                      </h3>
                      {paper.shift && <p className="text-xs font-semibold text-muted-foreground mt-0.5">Shift {paper.shift}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                     <Badge variant="secondary" className="font-mono text-[10px] bg-background border">{qsCount} Qs</Badge>
                     <Badge variant="secondary" className="font-mono text-[10px] bg-background border"><Clock className="w-3 h-3 mr-1"/>{timeLimit}m</Badge>
                     {paper.difficulty_level && (
                       <Badge variant="outline" className={cn("text-[10px]", paper.difficulty_level === "HARD" ? "text-red-500 border-red-500/30 bg-red-500/5" : paper.difficulty_level === "EASY" ? "text-green-500 border-green-500/30 bg-green-500/5" : "text-amber-500 border-amber-500/30 bg-amber-500/5")}>
                         {paper.difficulty_level}
                       </Badge>
                     )}
                  </div>

                  {/* Subject Chips Demo */}
                  {officialSettings && (
                     <div className="flex gap-1.5 mb-5 flex-wrap">
                       <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground font-medium">Phys: {qsCount/3}</span>
                       <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground font-medium">Chem: {qsCount/3}</span>
                       <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground font-medium">Math: {qsCount/3}</span>
                     </div>
                  )}

                  <div className="flex gap-2 mt-auto pt-2 border-t border-border">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-xs"
                      onClick={() => launchDirectTest(paper, true)}
                      disabled={launchingId !== null}
                    >
                      <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                      Practice Mode
                    </Button>
                    <Button 
                      size="sm" 
                      className="flex-1 text-xs shadow-md"
                      onClick={() => launchDirectTest(paper, false)}
                      loading={launchingId === paper.id}
                      disabled={launchingId !== null && launchingId !== paper.id}
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Exam Mode
                    </Button>
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
