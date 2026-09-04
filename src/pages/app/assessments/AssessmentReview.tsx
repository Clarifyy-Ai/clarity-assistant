import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProcessingStatus } from "@/components/async/ProcessingStatus";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { useAuthStore } from "@/store/authStore";
import {
  assessmentStartIdempotencyKey,
  messageFromAssessmentStartError,
  userMessageForAssessmentError,
  type AssessmentStartSuccess,
} from "@/lib/assessments/assessmentStart";
import {
  buildWhySelected,
  evaluateAssessmentReadiness,
  resolveBlueprintForSetup,
} from "@/lib/assessments/assessmentContext";
import { roleLabel, templateSlugForRole } from "@/lib/assessments/roleNormalize";
import {
  clearAssessmentSetupDraft,
  loadAssessmentSetupDraft,
} from "@/lib/assessments/assessmentSetupStorage";
import { preflightSingleAssessmentTemplate } from "@/lib/assessments/assessmentPreflight";
import { supabase } from "@/lib/supabase/client";
import type { AssessmentRoleSlug } from "@/lib/assessments/taxonomy";

export default function AssessmentReviewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const userId = useAuthStore((s) => s.user?.id);
  const setup = loadAssessmentSetupDraft() ?? {};
  const forceGeneral = params.get("general") === "1" || setup.force_general === true;
  const [starting, setStarting] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const readiness = evaluateAssessmentReadiness({ ...setup, force_general: forceGeneral });
  const roleSlug = (readiness.role_slug ?? "general-aptitude") as AssessmentRoleSlug;
  const blueprint = resolveBlueprintForSetup(
    roleSlug,
    null,
    null,
    String(setup.assessment_objective ?? "role_readiness"),
  );
  const why = useMemo(
    () =>
      buildWhySelected({
        roleLabel: readiness.role_label ?? roleLabel(roleSlug),
        objective: String(setup.assessment_objective ?? "role_readiness"),
        boostedCategories: blueprint.boostedCategories,
        personalized: !forceGeneral && readiness.personalized,
        resumeSkills: setup.skills_include,
      }),
    [readiness, roleSlug, setup, blueprint.boostedCategories, forceGeneral],
  );

  /** Resolve by published slug only — never fall back to an unrelated template. */
  async function resolveTemplateId(): Promise<string | null> {
    const slug = forceGeneral ? "general-aptitude" : templateSlugForRole(roleSlug);
    const { data, error } = await supabase
      .from("exam_templates")
      .select("id, slug")
      .eq("is_published", true)
      .eq("slug", slug)
      .maybeSingle();
    if (error) return null;
    return (data?.id as string) ?? null;
  }

  async function startAssessment() {
    if (inFlight.current || starting) return;
    if (!forceGeneral && !readiness.ready) {
      toast.error(readiness.message);
      void navigate("/app/assessments/setup");
      return;
    }
    if (forceGeneral && !readiness.ready) {
      toast.error(readiness.message);
      void navigate("/app/assessments/setup");
      return;
    }
    inFlight.current = true;
    setStarting(true);
    setPreflightMessage(null);
    try {
      const templateId = await resolveTemplateId();
      if (!templateId) {
        const msg = userMessageForAssessmentError(
          forceGeneral ? "ASSESSMENT_NOT_FOUND" : "ROLE_NOT_SUPPORTED",
        );
        toast.error(msg);
        setPreflightMessage(msg);
        if (!forceGeneral) void navigate("/app/assessments/setup");
        return;
      }

      const requested =
        typeof setup.question_count === "number" && setup.question_count > 0
          ? setup.question_count
          : forceGeneral
            ? 6
            : undefined;
      const pref = await preflightSingleAssessmentTemplate(templateId, requested);
      if (!pref.startable) {
        const msg =
          pref.message ??
          userMessageForAssessmentError("INSUFFICIENT_QUESTION_INVENTORY", {
            requested_count: pref.requested ?? requested,
            available_count: pref.available ?? undefined,
          });
        setPreflightMessage(msg);
        toast.error(msg);
        return;
      }

      const idem = userId
        ? assessmentStartIdempotencyKey(userId, `${templateId}:${roleSlug}:${forceGeneral ? "g" : "p"}`)
        : undefined;
      // Do not invent missing personalization fields — Edge fail-closes with PROFILE_CONTEXT_INSUFFICIENT.
      const setupPayload = forceGeneral
        ? {
            ...setup,
            role_slug: "general-aptitude",
            force_general: true,
            question_count: setup.question_count ?? 6,
            difficulty: setup.difficulty ?? "medium",
            experience_level: setup.experience_level ?? "mid",
            assessment_objective: setup.assessment_objective ?? "baseline",
            target_role: setup.target_role || "General",
          }
        : {
            ...setup,
            role_slug: roleSlug,
            force_general: false,
            question_count: setup.question_count,
            difficulty: setup.difficulty,
            experience_level: setup.experience_level,
            assessment_objective: setup.assessment_objective,
            target_role: setup.target_role ?? readiness.role_label ?? roleLabel(roleSlug),
          };
      const result = await fetchEdgeJson<AssessmentStartSuccess>("assemble-assessment", {
        template_id: templateId,
        role_slug: roleSlug,
        force_general: forceGeneral || undefined,
        setup: setupPayload,
        idempotency_key: idem,
      }, {
        headers: idem ? { "x-idempotency-key": idem } : undefined,
      });
      if (!result.test_id) {
        throw new Error(userMessageForAssessmentError("ASSESSMENT_START_FAILED"));
      }
      clearAssessmentSetupDraft();
      void navigate(`/app/assessments/session/${result.test_id}`);
    } catch (err) {
      const mapped = messageFromAssessmentStartError(err);
      toast.error(mapped.text);
      setPreflightMessage(mapped.text);
      if (
        err instanceof ApiClientError &&
        (err.code === "PROFILE_CONTEXT_INSUFFICIENT" || err.code === "ROLE_NOT_SUPPORTED")
      ) {
        void navigate("/app/assessments/setup");
      }
    } finally {
      inFlight.current = false;
      setStarting(false);
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Review assessment"
        description="Confirm the personalized blueprint before questions are locked for this attempt."
      />
      <div className={STACK_GRID}>
        {forceGeneral && (
          <Badge variant="amber" className="w-fit">General assessment (not personalized)</Badge>
        )}
        <Card data-testid="assessment-review-card">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Role / domain</dt>
              <dd className="font-medium">{readiness.role_label} · {setup.domain || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Experience</dt>
              <dd className="font-medium">{String(setup.experience_level ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Objective</dt>
              <dd className="font-medium">{String(setup.assessment_objective ?? "—").replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Difficulty</dt>
              <dd className="font-medium">{String(setup.difficulty ?? "medium")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Questions / duration</dt>
              <dd className="font-medium">
                {setup.question_count ?? 6} questions · {setup.duration_minutes ?? 15} min
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Skills included</dt>
              <dd className="font-medium">
                {(setup.skills_include ?? []).join(", ") || Object.keys(blueprint.weights).join(", ")}
              </dd>
            </div>
          </dl>
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Topic allocation</p>
            <ul className="text-sm space-y-1">
              {Object.entries(blueprint.weights).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{k}</span>
                  <span className="text-muted-foreground">{v}%</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed" data-testid="assessment-why-selected">
            {why}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2">
            Marking: server-side objective scoring. Negative marking follows the template when configured.
            Credits: charged only if your plan requires them for mock assessments — failed personalization does not consume credits.
          </p>
          {preflightMessage && (
            <p className="mt-3 text-sm text-destructive" role="alert" data-testid="assessment-review-preflight-error">
              {preflightMessage}
            </p>
          )}
        </Card>
        <div className="flex flex-wrap gap-2 items-center">
          <Button loading={starting} onClick={() => void startAssessment()} data-testid="assessment-review-start">
            Start assessment
          </Button>
          <Button variant="ghost" onClick={() => void navigate("/app/assessments/setup")}>
            Edit setup
          </Button>
        </div>
        {starting && (
          <ProcessingStatus
            message="Preparing assessment…"
            stage="assessment_start"
            className="mt-3"
          />
        )}
      </div>
    </div>
  );
}
