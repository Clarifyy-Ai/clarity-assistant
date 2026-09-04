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
import {
  preflightAssessmentTemplates,
  type AssessmentPreflightItem,
} from "@/lib/assessments/assessmentPreflight";
import { templateRoleSlug } from "@/lib/assessments/taxonomy";

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
  role_slug?: string | null;
};

function blockedMessage(
  item: AssessmentPreflightItem | undefined,
  template: Template,
): string | null {
  if (!item) {
    return "Could not verify question inventory. Retry before starting.";
  }
  if (item.startable) {
    return item.resumableTestId ? "Continue your in-progress attempt." : null;
  }
  if (item.message) return item.message;
  if (
    typeof item.available === "number" &&
    typeof item.requested === "number" &&
    item.available < item.requested
  ) {
    return userMessageForAssessmentError("INSUFFICIENT_QUESTION_INVENTORY", {
      requested_count: item.requested,
      available_count: item.available,
    });
  }
  return "This assessment cannot be started right now.";
}

export default function AssessmentTemplatesPage() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preflightById, setPreflightById] = useState<Record<string, AssessmentPreflightItem>>({});
  const [availabilityUnknown, setAvailabilityUnknown] = useState(false);
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
      setPreflightById({});
      setAvailabilityUnknown(true);
    } else {
      const rows = ((data as Template[]) ?? []).filter((row) => row.is_active !== false);
      setTemplates(rows);
      const requestedByTemplateId: Record<string, number> = {};
      for (const row of rows) {
        requestedByTemplateId[row.id] = row.question_count;
      }
      const preflight = await preflightAssessmentTemplates(
        rows.map((r) => r.id),
        { requestedByTemplateId },
      );
      setPreflightById(preflight.byTemplateId);
      setAvailabilityUnknown(!preflight.ok);
      if (!preflight.ok && preflight.errorMessage) {
        toast.error(preflight.errorMessage);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function start(template: Template) {
    if (inFlight.current.has(template.id) || starting) return;
    const pref = preflightById[template.id];
    if (!pref || pref.startable !== true) {
      const message = blockedMessage(pref, template) ?? "This assessment cannot be started.";
      setStartError({
        templateId: template.id,
        message,
        retryable: pref?.retryable === true || !pref,
      });
      toast.error(message);
      return;
    }
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
      const mapped = messageFromAssessmentStartError(err);
      setStartError({ templateId: template.id, message: mapped.text, retryable: mapped.retryable });
      toast.error(mapped.text);
      void loadTemplates();
    } finally {
      inFlight.current.delete(template.id);
      setStarting(null);
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Exam Templates"
        description="Career Pilot original assessments assembled from the internal question bank. These are not official certification papers. Prefer the personalized setup so Backend and Data Analyst paths receive different blueprints."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          data-testid="assessment-open-setup"
          onClick={() => void navigate("/app/assessments/setup")}
          leftIcon={<ClipboardList className="w-4 h-4" />}
        >
          Personalize assessment
        </Button>
        {availabilityUnknown && (
          <Button variant="outline" onClick={() => void loadTemplates()} data-testid="assessment-retry-preflight">
            Retry inventory check
          </Button>
        )}
      </div>
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
        {!loading && !loadError && templates.map((template) => {
          const pref = preflightById[template.id];
          const startable = pref?.startable === true;
          const blocked = blockedMessage(pref, template);
          const resumable = Boolean(pref?.resumableTestId);
          const role = templateRoleSlug(template);
          const setupHref = `/app/assessments/setup?role=${encodeURIComponent(role)}`;
          return (
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
              {typeof pref?.available === "number" && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid={`assessment-inventory-${template.id}`}>
                  Eligible questions: {pref.available} / {pref.requested ?? template.question_count}
                  {typeof pref.attemptsUsed === "number" && template.max_attempts
                    ? ` · Attempts used: ${pref.attemptsUsed}/${template.max_attempts}`
                    : ""}
                </p>
              )}
              {pref?.status === "unknown" && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400" data-testid={`assessment-preflight-unknown-${template.id}`}>
                  Inventory not verified — retry before starting.
                </p>
              )}
              <ul className="mt-3 text-xs text-muted-foreground">
                {Object.entries(template.category_distribution ?? {}).map(([k, v]) => (
                  <li key={k}>{k} {v}%</li>
                ))}
              </ul>
              {(blocked && !startable) || startError?.templateId === template.id ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {startError?.templateId === template.id ? startError.message : blocked}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {!resumable && (
                  <Button
                    data-testid={`personalize-assessment-${template.id}`}
                    disabled={starting !== null || !startable}
                    onClick={() => void navigate(setupHref)}
                  >
                    Personalize & start
                  </Button>
                )}
                <Button
                  data-testid={`start-assessment-${template.id}`}
                  variant={resumable ? "default" : "outline"}
                  loading={starting === template.id}
                  disabled={starting !== null || !startable}
                  onClick={() => void start(template)}
                >
                  {starting === template.id
                    ? "Starting"
                    : resumable
                    ? "Continue assessment"
                    : "Catalog start"}
                </Button>
                {((startError?.templateId === template.id && startError.retryable) ||
                  pref?.status === "unknown") && (
                  <Button
                    variant="outline"
                    disabled={starting !== null}
                    onClick={() => {
                      if (pref?.status === "unknown") void loadTemplates();
                      else void start(template);
                    }}
                  >
                    Retry
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
