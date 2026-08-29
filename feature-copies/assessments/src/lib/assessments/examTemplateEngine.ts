import { PUBLISHABLE_LICENSES, type LicenseType } from "@/lib/content/license";
import { isAssessmentReadyQuestion } from "@/lib/assessments/questionQuality";
import {
  isEligibleAssessmentQuestion,
  type TaxonomyQuestion,
  type TemplateTaxonomy,
} from "@/lib/assessments/taxonomy";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type BankQuestionLite = TaxonomyQuestion & {
  id: string;
  question_text?: string | null;
  question_type?: string | null;
  options?: unknown;
  correct_answer?: string | null;
  explanation?: string | null;
};

export type ExamBlueprint = {
  id: string;
  slug?: string;
  title: string;
  question_count: number;
  duration_minutes: number;
  passing_percentage: number;
  marks_positive: number;
  marks_negative: number;
  randomize: boolean;
  max_attempts?: number | null;
  strict_taxonomy?: boolean | null;
  role_slug?: string | null;
  is_active?: boolean | null;
  is_published?: boolean | null;
  difficulty_distribution: Partial<Record<Difficulty, number>>;
  category_distribution: Record<string, number>;
};

export type AssemblyResult = {
  questionIds: string[];
  unfilled: number;
  usedCategories: string[];
  availableCount: number;
  requestedCount: number;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function matchesCategory(question: BankQuestionLite, category: string): boolean {
  const target = category.trim().toLowerCase();
  return [question.category, question.subject, question.topic]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === target);
}

function asTemplate(blueprint: ExamBlueprint): TemplateTaxonomy {
  return {
    slug: blueprint.slug || blueprint.id,
    role_slug: blueprint.role_slug || blueprint.slug || blueprint.id,
    category_distribution: blueprint.category_distribution,
    strict_taxonomy: blueprint.strict_taxonomy !== false,
    is_active: blueprint.is_active !== false,
    is_published: blueprint.is_published !== false,
  };
}

export function isEligibleForPublicAssessment(
  question: BankQuestionLite,
  userId?: string | null,
): boolean {
  if (question.publish_status !== "published") return false;
  if (question.review_status === "rejected" || question.review_status === "unreviewed") return false;
  const license = (question.license_type ?? "UNKNOWN") as LicenseType;
  if (!PUBLISHABLE_LICENSES.includes(license)) return false;
  if (!isAssessmentReadyQuestion(question) && question.question_text) return false;
  if (question.is_public) return true;
  if (!userId) return false;
  return question.uploaded_by === userId || question.created_by === userId;
}

export function filterEligibleTemplateQuestions(
  blueprint: ExamBlueprint,
  pool: BankQuestionLite[],
  userId?: string | null,
): BankQuestionLite[] {
  const template = asTemplate(blueprint);
  const seen = new Set<string>();
  const eligible: BankQuestionLite[] = [];
  for (const question of pool) {
    if (seen.has(question.id)) continue;
    if (!isEligibleForPublicAssessment(question, userId)) continue;
    if (!isEligibleAssessmentQuestion(question, template, userId)) continue;
    seen.add(question.id);
    eligible.push(question);
  }
  return eligible;
}

export function assembleExamInstance(
  blueprint: ExamBlueprint,
  pool: BankQuestionLite[],
  options?: { seed?: number; userId?: string | null },
): AssemblyResult {
  const rand = mulberry32(options?.seed ?? Date.now() % 1_000_000);
  const eligible = filterEligibleTemplateQuestions(blueprint, pool, options?.userId);
  const picked = new Set<string>();
  const usedCategories: string[] = [];

  const take = (candidates: BankQuestionLite[], count: number) => {
    const available = shuffle(
      candidates.filter((q) => !picked.has(q.id)),
      rand,
    );
    for (const question of available.slice(0, Math.max(0, count))) {
      picked.add(question.id);
    }
  };

  const total = Math.max(0, blueprint.question_count);
  const categories = Object.entries(blueprint.category_distribution);
  const difficulties = Object.entries(blueprint.difficulty_distribution) as Array<[Difficulty, number]>;

  for (const [category, pct] of categories) {
    const categoryCount = Math.round((total * Number(pct || 0)) / 100);
    if (categoryCount <= 0) continue;
    usedCategories.push(category);
    const inCategory = eligible.filter((q) => matchesCategory(q, category));
    for (const [difficulty, diffPct] of difficulties) {
      const need = Math.round((categoryCount * Number(diffPct || 0)) / 100);
      take(
        inCategory.filter((q) => String(q.difficulty).toUpperCase() === difficulty),
        need,
      );
    }
    take(inCategory, categoryCount - [...picked].filter((id) => inCategory.some((q) => q.id === id)).length);
  }

  if (picked.size < total) {
    take(eligible, total - picked.size);
  }

  const questionIds = [...picked];
  const selected = blueprint.randomize
    ? shuffle(questionIds, rand).slice(0, total)
    : questionIds.slice(0, total);

  return {
    questionIds: selected,
    unfilled: Math.max(0, total - selected.length),
    usedCategories,
    availableCount: eligible.length,
    requestedCount: total,
  };
}

export function hasDuplicateQuestionIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

export function inventoryAllowsStart(result: AssemblyResult): boolean {
  return result.unfilled === 0 && result.questionIds.length === result.requestedCount;
}
