import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";
import { selectableRoleOptions, roleLabel } from "@/lib/assessments/roleNormalize";
import {
  applyWeakTopicBoost,
  blueprintForRole,
  blueprintsDifferMaterially,
  BLUEPRINT_POLICY_VERSION,
  SELECTION_POLICY_VERSION,
  type CategoryWeights,
} from "@/lib/assessments/blueprint";
import type { AssessmentRoleSlug } from "@/lib/assessments/taxonomy";
import { buildWhySelected } from "@/lib/assessments/assessmentContext";

/** Kill-switch: within-attempt adaptive selection is off until product enables it. */
export const ADAPTIVE_ASSESSMENTS_ENABLED = false;

export default function AdminAssessmentsPreview() {
  const roles = selectableRoleOptions();
  const [roleA, setRoleA] = useState<AssessmentRoleSlug>("backend-developer");
  const [roleB, setRoleB] = useState<AssessmentRoleSlug>("data-analyst");
  const [weak, setWeak] = useState("sql, joins");

  const preview = useMemo(() => {
    const weakTopics = weak.split(",").map((s) => s.trim()).filter(Boolean);
    const baseA = blueprintForRole(roleA);
    const baseB = blueprintForRole(roleB);
    const boostedA = applyWeakTopicBoost(baseA, weakTopics);
    const boostedB = applyWeakTopicBoost(baseB, weakTopics);
    return {
      a: boostedA,
      b: boostedB,
      differ: blueprintsDifferMaterially(boostedA.weights, boostedB.weights),
      whyA: buildWhySelected({
        roleLabel: roleLabel(roleA),
        objective: "role_readiness",
        boostedCategories: boostedA.boostedCategories,
        personalized: true,
      }),
      whyB: buildWhySelected({
        roleLabel: roleLabel(roleB),
        objective: "role_readiness",
        boostedCategories: boostedB.boostedCategories,
        personalized: true,
      }),
    };
  }, [roleA, roleB, weak]);

  function renderWeights(title: string, weights: CategoryWeights, why: string) {
    return (
      <Card>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <ul className="text-sm space-y-1 mb-3">
          {Object.entries(weights).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-2">
              <span>{k}</span>
              <span className="text-muted-foreground">{v}%</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground leading-relaxed">{why}</p>
      </Card>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Assessment blueprint preview"
        description={`Simulate role blueprints before publish. Policy ${BLUEPRINT_POLICY_VERSION} / ${SELECTION_POLICY_VERSION}. Adaptive within-attempt: ${ADAPTIVE_ASSESSMENTS_ENABLED ? "on" : "off"}.`}
      />
      <div className={STACK_GRID}>
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Role A</span>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={roleA}
                onChange={(e) => setRoleA(e.target.value as AssessmentRoleSlug)}
                data-testid="admin-assessment-role-a"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Role B</span>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={roleB}
                onChange={(e) => setRoleB(e.target.value as AssessmentRoleSlug)}
                data-testid="admin-assessment-role-b"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Weak topics (comma)</span>
              <input
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={weak}
                onChange={(e) => setWeak(e.target.value)}
              />
            </label>
          </div>
          <p className="text-sm mt-3" data-testid="admin-blueprint-differ">
            Blueprints differ materially:{" "}
            <strong>{preview.differ ? "yes" : "no"}</strong>
            {!preview.differ && (
              <span className="text-amber-600"> — CONTENT_INSUFFICIENT risk if bank cannot diversify.</span>
            )}
          </p>
          {!preview.differ && (
            <div
              className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
              data-testid="admin-content-insufficient"
              role="alert"
            >
              <p className="font-semibold">CONTENT_INSUFFICIENT</p>
              <p className="text-xs mt-1 opacity-90">
                These role blueprints do not differ enough to personalize safely. Assemble must fail closed
                with CONTENT_INSUFFICIENT rather than silently repeating questions — pick distinct roles or
                expand the approved bank.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            When the approved bank cannot fill a role blueprint without duplicates, assemble must return CONTENT_INSUFFICIENT — never silent repeats.
          </p>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          {renderWeights(roleLabel(roleA), preview.a.weights, preview.whyA)}
          {renderWeights(roleLabel(roleB), preview.b.weights, preview.whyB)}
        </div>
        <Button variant="secondary" onClick={() => window.location.assign("/app/admin/questions")}>
          Open question bank (eligible_roles)
        </Button>
      </div>
    </div>
  );
}
