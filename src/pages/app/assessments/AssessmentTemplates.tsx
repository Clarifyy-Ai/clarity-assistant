import { useEffect, useRef, useState } from "react";
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
import { useAuthStore } from "@/store/authStore";
import {
  assessmentStartIdempotencyKey,
  messageFromAssessmentStartError,
  userMessageForAssessmentError,
  type AssessmentStartSuccess,
} from "@/lib/assessments/assessmentStart";

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
  is_active?: boolean | null;
};

function messageFromStartError(err: unknown): { text: string; retryable: boolean } {
  return messageFromAssessmentStartError(err);
}

export default function AssessmentTemplatesPage() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<{ templateId: string; message: string; retryable: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  async function loadTemplates() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("exam_templates")
      .select("*")
      .eq("is_published", true)
      .order("title");
    if (error) {
      setLoadError("Assessments could not be loaded. Please try again.");
      toast.error("Assessments could not be loaded. Please try again.");
      setTemplates([]);
    } else {
      setTemplates(((data as Template[]) ?? []).filter((row) => row.is_active !== false));
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function start(template: Template) {
    if (inFlight.current.has(template.id) || starting) return;
    inFlight.current.add(template.id);
    setStarting(template.id);
    setStartError(null);
    try {
      const result = await fetchEdgeJson<AssessmentStartSuccess>("assemble-assessment", {
        template_id: template.id,
        idempotency_key: userId ? assessmentStartIdempotencyKey(userId, template.id) : undefined,
      }, {
        headers: userId
          ? { "x-idempotency-key": assessmentStartIdempotencyKey(userId, template.id) }
          : undefined,
      });
      if (!result.test_id) {
        throw new Error(userMessageForAssessmentError("ASSESSMENT_START_FAILED"));
      }
      void navigate(`/app/assessments/session/${result.test_id}`);
    } catch (err) {
      const mapped = messageFromStartError(err);
      setStartError({ templateId: template.id, message: mapped.text, retryable: mapped.retryable });
      toast.error(mapped.text);
    } finally {
      inFlight.current.delete(template.id);
      setStarting(null);
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Exam Templates"
        description="Career Pilot original assessments assembled from the internal question bank. These are not official certification papers."
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
            description="Career Pilot original templates will appear here once an admin publishes them."
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
            {startError?.templateId === template.id && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {startError.message}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                data-testid={`start-assessment-${template.id}`}
                loading={starting === template.id}
                disabled={starting !== null}
                onClick={() => void start(template)}
              >
                {starting === template.id ? "Starting" : "Start assessment"}
              </Button>
              {startError?.templateId === template.id && startError.retryable && (
                <Button
                  variant="outline"
                  disabled={starting !== null}
                  onClick={() => void start(template)}
                >
                  Retry
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
