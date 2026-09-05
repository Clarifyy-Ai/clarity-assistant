import { allocateQuestionCounts, type CategoryWeights } from "@/lib/assessments/blueprint";
import { userMessageForAssessmentError } from "@/lib/assessments/assessmentStart";
import { roleLabel, templateSlugForRole } from "@/lib/assessments/roleNormalize";
import {
  selectDeterministicQuestions,
  type SelectionCandidate,
} from "@/lib/assessments/selectionScore";
import {
  isEligibleAssessmentQuestion,
  type AssessmentRoleSlug,
  type TaxonomyQuestion,
  type TemplateTaxonomy,
} from "@/lib/assessments/taxonomy";

export type BankPreviewQuestion = TaxonomyQuestion & {
  question_text?: string | null;
};

export type CategoryBankStatus = {
  category: string;
  needed: number;
  available: number;
  shortfall: number;
};

export type SelectedQuestionPreview = {
  id: string;
  category: string;
  preview: string;
  reasons: string[];
};

export type RoleBankPreview = {
  roleSlug: AssessmentRoleSlug;
  roleLabel: string;
  templateSlug: string;
  quotas: Record<string, number>;
  totalNeeded: number;
  eligibleCount: number;
  categoryStatus: CategoryBankStatus[];
  canAssemble: boolean;
  assemblyGap: number;
  selectedPreview: SelectedQuestionPreview[];
  insufficientMessage: string | null;
};

export function templateForRolePreview(
  roleSlug: AssessmentRoleSlug,
  weights: CategoryWeights,
): TemplateTaxonomy {
  return {
    slug: templateSlugForRole(roleSlug),
    role_slug: roleSlug,
    category_distribution: weights,
    strict_taxonomy: true,
    is_active: true,
    is_published: true,
  };
}

function tokenBlob(q: TaxonomyQuestion): string {
  return [q.category, q.subject, q.topic, ...(q.tags ?? []), ...(q.eligible_roles ?? [])]
    .map((t) => String(t ?? "").toLowerCase())
    .join(" ");
}

function questionMatchesCategory(q: TaxonomyQuestion, category: string): boolean {
  return tokenBlob(q).includes(category.toLowerCase());
}

function toSelectionCandidate(q: BankPreviewQuestion): SelectionCandidate {
  return {
    id: q.id,
    category: q.category,
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty,
    eligible_roles: q.eligible_roles,
    tags: q.tags,
    review_status: q.review_status,
    is_verified: q.is_verified,
  };
}

export function truncateQuestionPreview(text: string | null | undefined, max = 96): string {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled question";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function previewRoleBank(input: {
  roleSlug: AssessmentRoleSlug;
  weights: CategoryWeights;
  weakTopics: string[];
  questionCount: number;
  questions: BankPreviewQuestion[];
}): RoleBankPreview {
  const template = templateForRolePreview(input.roleSlug, input.weights);
  const quotas = allocateQuestionCounts(input.questionCount, input.weights);
  const totalNeeded = Object.values(quotas).reduce((sum, n) => sum + n, 0);

  const eligible = input.questions.filter((q) => isEligibleAssessmentQuestion(q, template));
  const byId = new Map(input.questions.map((q) => [q.id, q]));

  const categoryStatus: CategoryBankStatus[] = Object.entries(quotas).map(([category, needed]) => {
    const available = eligible.filter((q) => questionMatchesCategory(q, category)).length;
    return {
      category,
      needed,
      available,
      shortfall: Math.max(0, needed - available),
    };
  });

  const { questionIds, ledger } = selectDeterministicQuestions(
    eligible.map(toSelectionCandidate),
    quotas,
    {
      roleSlug: input.roleSlug,
      roleLabel: roleLabel(input.roleSlug),
      selectionSeed: `admin-preview:${input.roleSlug}`,
      weakTopics: input.weakTopics,
    },
  );

  const assemblyGap = Math.max(0, totalNeeded - questionIds.length);
  const canAssemble = assemblyGap === 0;

  const insufficientMessage = canAssemble
    ? null
    : assemblyGap > 0 && eligible.length < totalNeeded
      ? userMessageForAssessmentError("INSUFFICIENT_QUESTION_INVENTORY", {
          requested_count: totalNeeded,
          available_count: eligible.length,
        })
      : userMessageForAssessmentError("CONTENT_INSUFFICIENT");

  const selectedPreview: SelectedQuestionPreview[] = ledger.slice(0, 8).map((row) => {
    const q = byId.get(row.questionId);
    const category =
      [q?.category, q?.subject, q?.topic].map((v) => String(v ?? "").trim()).find(Boolean) ??
      "general";
    return {
      id: row.questionId,
      category,
      preview: truncateQuestionPreview(q?.question_text),
      reasons: row.selectedBecause,
    };
  });

  return {
    roleSlug: input.roleSlug,
    roleLabel: roleLabel(input.roleSlug),
    templateSlug: template.slug,
    quotas,
    totalNeeded,
    eligibleCount: eligible.length,
    categoryStatus,
    canAssemble,
    assemblyGap,
    selectedPreview,
    insufficientMessage,
  };
}
