import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { supabase } from "@/lib/supabase/client";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";

type Template = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  passing_percentage: number;
  marks_negative: number;
  difficulty_distribution: Record<string, number>;
  category_distribution: Record<string, number>;
  max_attempts: number | null;
};

export default function AssessmentTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadTemplates() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("exam_templates")
      .select("*")
      .eq("is_published", true)
      .order("title");
    if (error) {
      setLoadError(error.message);
      toast.error(error.message);
      setTemplates([]);
    } else {
      setTemplates((data as Template[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function start(template: Template) {
    setStarting(template.id);
    try {
      const { data, error } = await supabase.rpc("assemble_assessment_from_template", {
        p_template_id: template.id,
      });
      if (error) throw error;
      const testId = (data as { test_id?: string } | null)?.test_id;
      if (!testId) throw new Error("Assessment could not be assembled.");
      navigate(`/app/assessments/session/${testId}`);
    } catch (err) {
      try {
        const fallback = await fetchEdgeJson<{ test_id: string }>("assemble-assessment", {
          template_id: template.id,
        });
        if (fallback.test_id) {
          navigate(`/app/assessments/session/${fallback.test_id}`);
          return;
        }
      } catch {
        /* fall through */
      }
      toast.error(err instanceof Error ? err.message : "Could not start assessment.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Exam Templates"
        description="Clarify original assessments assembled from the internal question bank. These are not official certification papers."
      />
      <div className={STACK_GRID}>
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {!loading && loadError && (
          <InlineErrorRetry message={loadError} onRetry={() => void loadTemplates()} />
        )}
        {!loading && !loadError && templates.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No assessments published yet"
            description="Clarify original templates will appear here once an admin publishes them."
          />
        )}
        {!loading && !loadError && templates.map((template) => (
          <Card key={template.id} className="flex min-w-0 flex-col">
            <h2 className="text-base font-semibold">{template.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
            <p className="mt-3 text-sm">
              {template.question_count} questions · {template.duration_minutes} minutes
            </p>
            <p className="text-xs text-muted-foreground">
              Negative marking {template.marks_negative} · Pass {template.passing_percentage}%
              {template.max_attempts ? ` · Max ${template.max_attempts} attempts` : ""}
            </p>
            <ul className="mt-3 text-xs text-muted-foreground">
              {Object.entries(template.category_distribution ?? {}).map(([k, v]) => (
                <li key={k}>{k} {v}%</li>
              ))}
            </ul>
            <Button className="mt-4" loading={starting === template.id} onClick={() => void start(template)}>
              Start assessment
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
