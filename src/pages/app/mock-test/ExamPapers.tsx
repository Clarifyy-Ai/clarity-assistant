import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronRight, ArrowLeft, Filter, FileText, Layers, Calendar,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

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
  difficulty_level?: "EASY" | "MEDIUM" | "HARD";
}

const EXAM_LABELS: Record<string, string> = {
  JEE_MAIN:  "JEE Main",
  JEE_ADV:   "JEE Advanced",
  NEET:      "NEET UG",
  UPSC:      "UPSC CSE",
  SSC_CGL:   "SSC CGL",
  IBPS_PO:   "IBPS PO",
  CUSTOM:    "Custom",
};

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function ExamPapers(): React.ReactElement {
  const { examType } = useParams<{ examType: string }>();
  const navigate = useNavigate();
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!examType) return;
    void loadPapers();
  }, [examType]);

  async function loadPapers() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("exam_papers")
        .select("id, exam_type, exam_name, year, session, shift, total_questions, total_marks, duration_minutes, difficulty_level")
        .eq("exam_type", (examType ?? "").toUpperCase())
        .order("year", { ascending: false });
      setPapers((data ?? []) as ExamPaper[]);
    } catch (err) {
      console.error("[ExamPapers] load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const years = [...new Set(papers.map((p) => p.year))].sort((a, b) => b - a);
  const filtered = yearFilter ? papers.filter((p) => p.year === yearFilter) : papers;
  const examLabel = EXAM_LABELS[(examType ?? "").toUpperCase()] ?? examType ?? "Exam";

  function handleSelectPaper(paper: ExamPaper) {
    navigate(
      `/app/mock-test/configure?exam=${paper.exam_type}&year_min=${paper.year}&year_max=${paper.year}`
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={examLabel + " Papers"}
        description={`Browse and start tests from available ${examLabel} question papers.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/app/mock-test")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Hub
          </Button>
        }
      />

      {/* Year filter */}
      {years.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setYearFilter(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-all",
              !yearFilter
                ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                : "border-border text-muted-foreground hover:border-violet-500/30"
            )}
          >
            All Years
          </button>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYearFilter(yearFilter === y ? null : y)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-all",
                yearFilter === y
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                  : "border-border text-muted-foreground hover:border-violet-500/30"
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">No papers available yet</p>
            <p className="text-sm text-muted-foreground">
              {papers.length === 0
                ? `No ${examLabel} papers have been added to the database yet.`
                : `No papers for ${yearFilter}.`}
            </p>
            <Button
              size="sm"
              onClick={() => navigate(`/app/mock-test/configure?exam=${(examType ?? "").toUpperCase()}`)}
            >
              Create AI-Generated Test
              <ChevronRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((paper) => (
            <Card key={paper.id} className="hover:border-violet-500/30 transition-colors">
              <CardContent className="flex items-center justify-between py-4 px-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <FileText className="h-5 w-5 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm">
                      {paper.exam_name} {paper.year}
                      {paper.session ? ` · ${paper.session}` : ""}
                      {paper.shift ? ` · ${paper.shift}` : ""}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {paper.total_questions && (
                        <span className="text-xs text-muted-foreground">
                          {paper.total_questions} questions
                        </span>
                      )}
                      {paper.total_marks && (
                        <span className="text-xs text-muted-foreground">
                          {paper.total_marks} marks
                        </span>
                      )}
                      {paper.duration_minutes && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {paper.duration_minutes} min
                        </span>
                      )}
                      {paper.difficulty_level && (
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          paper.difficulty_level === "HARD"
                            ? "bg-red-500/10 text-red-400"
                            : paper.difficulty_level === "EASY"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-amber-500/10 text-amber-400"
                        )}>
                          {paper.difficulty_level}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSelectPaper(paper)}
                  className="shrink-0"
                >
                  Start Test
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Configure link */}
      <div className="rounded-xl border border-dashed border-border p-4 text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Want a custom mix? Use the full configurator.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/app/mock-test/configure?exam=${(examType ?? "").toUpperCase()}`)}
        >
          Configure Custom Test
          <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
