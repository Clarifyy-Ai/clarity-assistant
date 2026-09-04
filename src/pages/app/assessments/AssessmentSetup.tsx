import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";
import { useAuthStore } from "@/store/authStore";
import {
  ASSESSMENT_OBJECTIVES,
  EXPERIENCE_LEVELS,
  defaultSetupFromProfile,
  evaluateAssessmentReadiness,
  loadAssessmentSetupDraft,
  saveAssessmentSetupDraft,
  selectableRoleOptions,
  type AssessmentSetupPayload,
} from "@/lib/assessments/assessmentSetupStorage";
import { normalizeRoleInput, roleLabel } from "@/lib/assessments/roleNormalize";
import { readExperienceFromProfile } from "@/lib/assessments/assessmentContext";

export default function AssessmentSetupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useAuthStore((s) => s.profile);
  const [setup, setSetup] = useState<Partial<AssessmentSetupPayload>>(() => {
    const base: Partial<AssessmentSetupPayload> = {
      ...defaultSetupFromProfile(profile),
      ...(loadAssessmentSetupDraft() ?? {}),
    };
    const roleParam = new URLSearchParams(window.location.search).get("role");
    const normalized = roleParam ? normalizeRoleInput(roleParam) : null;
    if (!normalized) return base;
    return {
      ...base,
      role_slug: normalized.slug,
      target_role: roleLabel(normalized.slug),
      force_general: false,
    };
  });

  useEffect(() => {
    if (!profile) return;
    setSetup((prev) => ({
      ...defaultSetupFromProfile(profile),
      ...prev,
      experience_level: prev.experience_level || readExperienceFromProfile(profile) || prev.experience_level,
      target_role: prev.target_role || (profile as { target_role?: string }).target_role || "",
    }));
  }, [profile]);

  // Prefill from catalog deep-link: /app/assessments/setup?role=<slug>
  useEffect(() => {
    const roleParam = params.get("role");
    if (!roleParam) return;
    const normalized = normalizeRoleInput(roleParam);
    if (!normalized) return;
    setSetup((prev) => {
      if (prev.role_slug === normalized.slug && prev.force_general !== true) return prev;
      const next: Partial<AssessmentSetupPayload> = {
        ...prev,
        role_slug: normalized.slug,
        target_role: roleLabel(normalized.slug),
        force_general: false,
      };
      saveAssessmentSetupDraft(next);
      return next;
    });
  }, [params]);

  const readiness = useMemo(
    () =>
      evaluateAssessmentReadiness(setup, {
        target_role: (profile as { target_role?: string } | null)?.target_role,
        experience_level: readExperienceFromProfile(profile),
        has_resume: false,
        has_jd: false,
      }),
    [setup, profile],
  );

  const roles = selectableRoleOptions();

  function patch(partial: Partial<AssessmentSetupPayload>) {
    setSetup((s) => {
      const next = { ...s, ...partial };
      if (partial.target_role != null || partial.role_slug != null) {
        const n = normalizeRoleInput(partial.role_slug || partial.target_role || next.target_role);
        if (n) {
          next.role_slug = n.slug;
          next.target_role = partial.target_role ?? n.originalTitle;
        }
      }
      saveAssessmentSetupDraft(next);
      return next;
    });
  }

  function continuePersonalized() {
    saveAssessmentSetupDraft({ ...setup, force_general: false });
    void navigate("/app/assessments/review");
  }

  function continueGeneral() {
    saveAssessmentSetupDraft({
      ...setup,
      force_general: true,
      role_slug: "general-aptitude",
      target_role: setup.target_role || "General",
      assessment_objective: setup.assessment_objective || "baseline",
      experience_level: setup.experience_level || "mid",
    });
    void navigate("/app/assessments/review?general=1");
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Personalize assessment"
        description="Assessments adapt to your target role, experience, and (when available) résumé and prior performance — not a one-size-fits-all paper."
      />

      <div className={STACK_GRID}>
        {!readiness.ready && (
          <Card className="border-amber-500/30 bg-amber-500/5" data-testid="assessment-readiness-banner">
            <p className="text-sm font-semibold text-foreground">
              {readiness.reasonCode === "ROLE_NOT_SUPPORTED"
                ? "That target role is not supported for personalized assessments yet."
                : "We need a little more information to personalize your assessment."}
            </p>
            <p className="text-xs text-muted-foreground mt-1" data-testid="assessment-missing-fields">
              {readiness.reasonCode === "ROLE_NOT_SUPPORTED"
                ? readiness.message
                : `Missing: ${readiness.missingFields.join(", ") || "required fields"}. Personalized start stays blocked until these are provided — we will not silently start a generic assessment.`}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="secondary" onClick={() => void navigate("/app/settings/profile")}>
                Select target role
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void navigate("/app/documents")}>
                Upload Resume
              </Button>
              <Button size="sm" variant="ghost" onClick={continueGeneral} data-testid="assessment-banner-force-general">
                Continue with a general assessment
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Required</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Target role</span>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={setup.role_slug ?? ""}
                onChange={(e) => {
                  const slug = e.target.value;
                  patch({ role_slug: slug as AssessmentSetupPayload["role_slug"], target_role: roleLabel(slug as never) });
                }}
                data-testid="assessment-setup-role"
              >
                <option value="">Select role</option>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Domain</span>
              <Input
                value={setup.domain ?? ""}
                onChange={(e) => patch({ domain: e.target.value })}
                placeholder="Engineering / Data / Business"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Experience level</span>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={setup.experience_level ?? ""}
                onChange={(e) => patch({ experience_level: e.target.value })}
                data-testid="assessment-setup-experience"
              >
                <option value="">Select level</option>
                {EXPERIENCE_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Objective</span>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={setup.assessment_objective ?? ""}
                onChange={(e) => patch({ assessment_objective: e.target.value })}
                data-testid="assessment-setup-objective"
              >
                <option value="">Select objective</option>
                {ASSESSMENT_OBJECTIVES.map((o) => (
                  <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Difficulty</span>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={setup.difficulty ?? "medium"}
                onChange={(e) => patch({ difficulty: e.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Question count</span>
              <Input
                type="number"
                min={3}
                max={40}
                value={setup.question_count ?? 6}
                onChange={(e) => patch({ question_count: Number(e.target.value) || 6 })}
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Duration (minutes)</span>
              <Input
                type="number"
                min={5}
                max={180}
                value={setup.duration_minutes ?? 15}
                onChange={(e) => patch({ duration_minutes: Number(e.target.value) || 15 })}
              />
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Optional</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Preferred language</span>
              <Input
                value={setup.preferred_language ?? ""}
                onChange={(e) => patch({ preferred_language: e.target.value })}
                placeholder="TypeScript, Python, SQL…"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-muted-foreground">Company</span>
              <Input
                value={setup.company ?? ""}
                onChange={(e) => patch({ company: e.target.value })}
              />
            </label>
            <label className="text-sm space-y-1 sm:col-span-2">
              <span className="text-muted-foreground">Skills to assess (comma-separated)</span>
              <Input
                value={(setup.skills_include ?? []).join(", ")}
                onChange={(e) =>
                  patch({
                    skills_include: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button
            leftIcon={<ClipboardList className="w-4 h-4" />}
            disabled={!readiness.ready}
            onClick={continuePersonalized}
            data-testid="assessment-setup-continue"
          >
            Review personalized assessment
          </Button>
          <Button variant="ghost" onClick={continueGeneral} data-testid="assessment-force-general">
            Continue with a general assessment
          </Button>
          <Button variant="ghost" onClick={() => void navigate("/app/assessments")}>
            Back to templates
          </Button>
        </div>
      </div>
    </div>
  );
}
