import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SHELL_STANDARD } from "@/lib/ui/responsivePage";
import { supabase } from "@/lib/supabase/client";
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
import {
  previewRoleBank,
  type BankPreviewQuestion,
  type RoleBankPreview,
} from "@/lib/assessments/assessmentBankPreview";
import { cn } from "@/lib/utils";

/** Kill-switch: within-attempt adaptive selection is off until product enables it. */
export const ADAPTIVE_ASSESSMENTS_ENABLED = false;

const DEFAULT_QUESTION_COUNT = 20;

function formatCategoryLabel(category: string): string {
  return category
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function BlueprintWeightsCard({
  title,
  weights,
  why,
  boostedCategories,
}: {
  title: string;
  weights: CategoryWeights;
  why: string;
  boostedCategories: string[];
}) {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          {boostedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {boostedCategories.map((cat) => (
                <Badge key={cat} variant="amber" size="sm">
                  Boosted: {formatCategoryLabel(cat)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <ul className="space-y-3">
          {sorted.map(([category, pct]) => (
            <li key={category}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span>{formatCategoryLabel(category)}</span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <ProgressBar value={pct} max={100} size="xs" color="violet" />
            </li>
          ))}
        </ul>

        <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{why}</p>
      </CardContent>
    </Card>
  );
}

function BankReadinessPanel({
  preview,
  loading,
}: {
  preview: RoleBankPreview;
  loading: boolean;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Question bank — {preview.roleLabel}</h3>
            <p className="text-xs text-muted-foreground">
              Template <span className="font-mono">{preview.templateSlug}</span> ·{" "}
              {preview.eligibleCount} eligible · {preview.totalNeeded} needed
            </p>
          </div>
          {loading ? (
            <Badge variant="gray" size="sm">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Loading
            </Badge>
          ) : preview.canAssemble ? (
            <Badge variant="emerald" size="sm">
              <CheckCircle2 className="mr-1 inline h-3 w-3" />
              Ready
            </Badge>
          ) : (
            <Badge variant="amber" size="sm">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Short by {preview.assemblyGap}
            </Badge>
          )}
        </div>

        {!preview.canAssemble && preview.insufficientMessage && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
            role="alert"
          >
            {preview.insufficientMessage}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Needed</th>
                <th className="px-3 py-2 font-medium">Available</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.categoryStatus.map((row) => (
                <tr key={row.category} className="border-t border-border">
                  <td className="px-3 py-2">{formatCategoryLabel(row.category)}</td>
                  <td className="px-3 py-2 tabular-nums">{row.needed}</td>
                  <td className="px-3 py-2 tabular-nums">{row.available}</td>
                  <td className="px-3 py-2">
                    {row.shortfall > 0 ? (
                      <Badge variant="amber" size="sm">
                        Need {row.shortfall} more
                      </Badge>
                    ) : (
                      <Badge variant="emerald" size="sm">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Simulated selection preview
          </p>
          {preview.selectedPreview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No questions could be selected with the current bank.
            </p>
          ) : (
            <ul className="space-y-2">
              {preview.selectedPreview.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-secondary/20 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" size="sm">
                      {formatCategoryLabel(item.category)}
                    </Badge>
                    <Link
                      to={`/app/admin/questions/${item.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {item.preview}
                    </Link>
                  </div>
                  {item.reasons.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.reasons.join(" · ")}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAssessmentsPreview() {
  const roles = selectableRoleOptions();
  const [roleA, setRoleA] = useState<AssessmentRoleSlug>("backend-developer");
  const [roleB, setRoleB] = useState<AssessmentRoleSlug>("data-analyst");
  const [weak, setWeak] = useState("sql, joins");
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [bankQuestions, setBankQuestions] = useState<BankPreviewQuestion[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);

  const loadBank = useCallback(async () => {
    setBankLoading(true);
    setBankError(null);
    try {
      const { data, error } = await supabase
        .from("questions")
        .select(
          "id, category, subject, topic, tags, difficulty, question_type, license_type, publish_status, review_status, is_verified, is_public, eligible_roles, cross_functional, uploaded_by, created_by, question_text",
        )
        .eq("publish_status", "published")
        .eq("review_status", "approved")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(2500);

      if (error) throw error;
      setBankQuestions((data ?? []) as BankPreviewQuestion[]);
    } catch (err) {
      setBankError(err instanceof Error ? err.message : "Could not load question bank.");
      setBankQuestions([]);
    } finally {
      setBankLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBank();
  }, [loadBank]);

  const weakTopics = useMemo(
    () => weak.split(",").map((s) => s.trim()).filter(Boolean),
    [weak],
  );

  const blueprintPreview = useMemo(() => {
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
  }, [roleA, roleB, weakTopics]);

  const bankA = useMemo(
    () =>
      previewRoleBank({
        roleSlug: roleA,
        weights: blueprintPreview.a.weights,
        weakTopics,
        questionCount,
        questions: bankQuestions,
      }),
    [roleA, blueprintPreview.a.weights, weakTopics, questionCount, bankQuestions],
  );

  const bankB = useMemo(
    () =>
      previewRoleBank({
        roleSlug: roleB,
        weights: blueprintPreview.b.weights,
        weakTopics,
        questionCount,
        questions: bankQuestions,
      }),
    [roleB, blueprintPreview.b.weights, weakTopics, questionCount, bankQuestions],
  );

  return (
    <div className={cn(PAGE_SHELL_STANDARD, "space-y-6 pb-10")}>
      <PageHeader
        title="Assessment blueprint preview"
        description={`Simulate role blueprints and bank readiness before publish. Policy ${BLUEPRINT_POLICY_VERSION} / ${SELECTION_POLICY_VERSION}. Adaptive within-attempt: ${ADAPTIVE_ASSESSMENTS_ENABLED ? "on" : "off"}.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadBank()}
            disabled={bankLoading}
            leftIcon={
              bankLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )
            }
          >
            Refresh bank
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Role A</label>
              <Select value={roleA} onValueChange={(v) => setRoleA(v as AssessmentRoleSlug)}>
                <SelectTrigger data-testid="admin-assessment-role-a" className="min-w-0">
                  <SelectValue placeholder="Select role A" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Role B</label>
              <Select value={roleB} onValueChange={(v) => setRoleB(v as AssessmentRoleSlug)}>
                <SelectTrigger data-testid="admin-assessment-role-b" className="min-w-0">
                  <SelectValue placeholder="Select role B" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              label="Weak topics (comma-separated)"
              value={weak}
              onChange={(e) => setWeak(e.target.value)}
              placeholder="sql, joins, react"
              fullWidth
            />

            <Input
              label="Assessment size (questions)"
              type="number"
              min={5}
              max={50}
              value={questionCount}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(next)) {
                  setQuestionCount(Math.min(50, Math.max(5, next)));
                }
              }}
              fullWidth
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="admin-blueprint-differ">
            <span>
              Blueprints differ materially:{" "}
              <strong>{blueprintPreview.differ ? "Yes" : "No"}</strong>
            </span>
            {blueprintPreview.differ ? (
              <Badge variant="emerald" size="sm">Personalization safe</Badge>
            ) : (
              <Badge variant="amber" size="sm">Low differentiation</Badge>
            )}
            {!bankLoading && (
              <>
                <Badge variant={bankA.canAssemble ? "emerald" : "amber"} size="sm">
                  {roleLabel(roleA)}: {bankA.canAssemble ? "bank ready" : `short ${bankA.assemblyGap}`}
                </Badge>
                <Badge variant={bankB.canAssemble ? "emerald" : "amber"} size="sm">
                  {roleLabel(roleB)}: {bankB.canAssemble ? "bank ready" : `short ${bankB.assemblyGap}`}
                </Badge>
              </>
            )}
          </div>

          {!blueprintPreview.differ && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
              data-testid="admin-content-insufficient"
              role="alert"
            >
              <p className="font-semibold">Personalization may not be distinct enough</p>
              <p className="mt-1 text-xs opacity-90">
                These role blueprints are too similar to guarantee different question mixes. If the
                bank cannot diversify safely, assessment assembly will fail rather than repeat
                questions — choose more distinct roles or expand approved content.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Approved public questions only. When the bank cannot fill a blueprint without duplicates,
            assembly fails closed with a user-safe message — never silent repeats.
          </p>
        </CardContent>
      </Card>

      {bankError && (
        <InlineErrorRetry message={bankError} onRetry={() => void loadBank()} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BlueprintWeightsCard
          title={roleLabel(roleA)}
          weights={blueprintPreview.a.weights}
          why={blueprintPreview.whyA}
          boostedCategories={blueprintPreview.a.boostedCategories}
        />
        <BlueprintWeightsCard
          title={roleLabel(roleB)}
          weights={blueprintPreview.b.weights}
          why={blueprintPreview.whyB}
          boostedCategories={blueprintPreview.b.boostedCategories}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BankReadinessPanel preview={bankA} loading={bankLoading} />
        <BankReadinessPanel preview={bankB} loading={bankLoading} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Manage question inventory</p>
            <p className="text-xs text-muted-foreground">
              Add or approve questions with matching categories and eligible roles for each template.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/admin/questions"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-secondary"
            >
              Admin question editor
            </Link>
            <Link
              to="/app/question-bank"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-secondary"
            >
              Question bank
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
