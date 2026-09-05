import { readExperienceFromProfile } from "@/lib/assessments/assessmentContext";

export type CodingQuestionRow = {
  id: string;
  title: string;
  description?: string | null;
  difficulty: string;
  language: string;
  evaluation_mode: string;
  created_at?: string | null;
};

export type CodingSubmissionSummary = {
  question_id: string;
  score: number | null;
  status: string;
  execution_status?: string | null;
};

export type CodingQuestionProgress = {
  attemptCount: number;
  bestScore: number | null;
  passed: boolean;
  status: "not_started" | "in_progress" | "passed";
};

export type CodingProfileContext = {
  targetRole: string | null;
  experienceLevel: string | null;
  weakAreas: string[];
  preferredLanguage: string | null;
  personalized: boolean;
};

export type ScoredCodingQuestion = CodingQuestionRow & {
  progress: CodingQuestionProgress;
  recommended: boolean;
  displayTitle: string;
  rankScore: number;
};

const DIFFICULTY_ORDER: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

export function normalizeQuestionTitle(title: string | null | undefined): string {
  return String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function displayQuestionTitle(title: string | null | undefined, id?: string): string {
  const trimmed = String(title ?? "").trim();
  if (trimmed) return trimmed;
  const suffix = id ? id.slice(0, 8) : "unknown";
  return `Untitled problem (${suffix})`;
}

export function readWeakAreasFromProfile(profile: unknown): string[] {
  if (!profile || typeof profile !== "object") return [];
  const row = profile as Record<string, unknown>;
  const weaknesses = row.interview_weaknesses;
  const goals = row.improvement_goals;
  const merged = [
    ...(Array.isArray(weaknesses) ? weaknesses : []),
    ...(Array.isArray(goals) ? goals : []),
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return [...new Set(merged)];
}

export function buildCodingProfileContext(profile: unknown): CodingProfileContext {
  const row = (profile && typeof profile === "object" ? profile : {}) as Record<string, unknown>;
  const targetRole =
    typeof row.target_role === "string" && row.target_role.trim()
      ? row.target_role.trim()
      : null;
  const experienceLevel = readExperienceFromProfile(profile);
  const weakAreas = readWeakAreasFromProfile(profile);
  const preferredLanguage =
    typeof row.preferred_language === "string" && row.preferred_language.trim()
      ? row.preferred_language.trim().toLowerCase()
      : null;
  const personalized = Boolean(targetRole || experienceLevel || weakAreas.length > 0);
  return { targetRole, experienceLevel, weakAreas, preferredLanguage, personalized };
}

export function difficultyAllowedForExperience(
  difficulty: string,
  experienceLevel: string | null | undefined,
): boolean {
  const diff = String(difficulty ?? "EASY").trim().toUpperCase();
  const level = String(experienceLevel ?? "mid").trim().toLowerCase();
  if (level === "intern" || level === "junior") return diff === "EASY";
  if (level === "mid") return diff === "EASY" || diff === "MEDIUM";
  return true;
}

function titleQualityScore(question: CodingQuestionRow): number {
  let score = 0;
  if (String(question.title ?? "").trim()) score += 10;
  if (String(question.description ?? "").trim().length > 20) score += 5;
  return score;
}

/** Collapse near-duplicate catalog rows that share the same normalized title. */
export function dedupeCodingQuestions(questions: CodingQuestionRow[]): CodingQuestionRow[] {
  const groups = new Map<string, CodingQuestionRow[]>();
  for (const question of questions) {
    const key = normalizeQuestionTitle(question.title) || `__id__:${question.id}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(question);
    groups.set(key, bucket);
  }

  const kept: CodingQuestionRow[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]!);
      continue;
    }
    const best = [...group].sort((a, b) => {
      const qualityDiff = titleQualityScore(b) - titleQualityScore(a);
      if (qualityDiff !== 0) return qualityDiff;
      const createdA = a.created_at ? Date.parse(a.created_at) : 0;
      const createdB = b.created_at ? Date.parse(b.created_at) : 0;
      return createdA - createdB;
    })[0]!;
    kept.push(best);
  }
  return kept;
}

export function summarizeSubmissionProgress(
  submissions: CodingSubmissionSummary[],
): CodingQuestionProgress {
  if (!submissions.length) {
    return { attemptCount: 0, bestScore: null, passed: false, status: "not_started" };
  }
  const scored = submissions.filter((row) => row.score != null);
  const bestScore =
    scored.length > 0
      ? Math.max(...scored.map((row) => Number(row.score)))
      : null;
  const passed = submissions.some(
    (row) =>
      row.execution_status === "passed" ||
      (row.score != null && Number(row.score) >= 100),
  );
  return {
    attemptCount: submissions.length,
    bestScore,
    passed,
    status: passed ? "passed" : "in_progress",
  };
}

function matchesWeakAreas(title: string, weakAreas: string[]): boolean {
  if (!weakAreas.length) return false;
  const haystack = title.toLowerCase();
  return weakAreas.some((area) => {
    const needle = area.toLowerCase().trim();
    if (!needle) return false;
    if (haystack.includes(needle)) return true;
    return needle.split(/\s+/).some((token) => token.length > 3 && haystack.includes(token));
  });
}

function matchesTargetRole(title: string, targetRole: string | null): boolean {
  if (!targetRole) return false;
  const role = targetRole.toLowerCase();
  const haystack = title.toLowerCase();
  const codingSignals = ["array", "string", "sum", "sort", "search", "tree", "graph", "algorithm"];
  const roleSignals = ["software", "developer", "engineer", "frontend", "backend", "full stack", "fullstack"];
  const roleMatch = roleSignals.some((signal) => role.includes(signal));
  const codingMatch = codingSignals.some((signal) => haystack.includes(signal));
  return roleMatch && codingMatch;
}

function rankScoreForQuestion(
  question: CodingQuestionRow,
  progress: CodingQuestionProgress,
  ctx: CodingProfileContext,
): number {
  let score = 0;
  if (progress.status === "not_started") score += 120;
  else if (progress.status === "in_progress") score += 80;
  else score -= 100;

  if (difficultyAllowedForExperience(question.difficulty, ctx.experienceLevel)) score += 40;
  if (matchesWeakAreas(question.title, ctx.weakAreas)) score += 35;
  if (matchesTargetRole(question.title, ctx.targetRole)) score += 25;
  if (
    ctx.preferredLanguage &&
    String(question.language ?? "").toLowerCase() === ctx.preferredLanguage
  ) {
    score += 15;
  }

  const diffRank = DIFFICULTY_ORDER[String(question.difficulty).toUpperCase()] ?? 1;
  score -= diffRank * 5;
  return score;
}

export function buildPersonalizedCatalog(
  questions: CodingQuestionRow[],
  submissionsByQuestion: Map<string, CodingSubmissionSummary[]>,
  profile: unknown,
): {
  recommended: ScoredCodingQuestion[];
  all: ScoredCodingQuestion[];
  context: CodingProfileContext;
} {
  const context = buildCodingProfileContext(profile);
  const deduped = dedupeCodingQuestions(questions);

  const scored: ScoredCodingQuestion[] = deduped.map((question) => {
    const progress = summarizeSubmissionProgress(submissionsByQuestion.get(question.id) ?? []);
    const rankScore = rankScoreForQuestion(question, progress, context);
    return {
      ...question,
      progress,
      recommended: false,
      displayTitle: displayQuestionTitle(question.title, question.id),
      rankScore,
    };
  });

  scored.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  const incomplete = scored.filter((q) => q.progress.status !== "passed");
  const recommendedIds = new Set(
    incomplete.slice(0, Math.min(3, incomplete.length)).map((q) => q.id),
  );
  for (const item of scored) {
    item.recommended = recommendedIds.has(item.id);
  }

  const recommended = scored.filter((q) => q.recommended);
  return { recommended, all: scored, context };
}

export function buildCatalogSummary(context: CodingProfileContext): string {
  if (!context.personalized) {
    return "Complete your profile to get role- and skill-based recommendations.";
  }
  const parts: string[] = [];
  if (context.targetRole) parts.push(`target role: ${context.targetRole}`);
  if (context.experienceLevel) parts.push(`level: ${context.experienceLevel.replace(/_/g, " ")}`);
  if (context.weakAreas.length) {
    parts.push(`focus: ${context.weakAreas.slice(0, 2).join(", ")}`);
  }
  return `Personalized for your ${parts.join(" · ")}.`;
}
