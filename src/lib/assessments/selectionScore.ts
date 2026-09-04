import { SELECTION_POLICY_VERSION } from "@/lib/assessments/blueprint";

export type SelectionCandidate = {
  id: string;
  category?: string | null;
  subject?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  eligible_roles?: string[] | null;
  tags?: string[] | null;
  review_status?: string | null;
  is_verified?: boolean | null;
};

export type SelectionScoreBreakdown = {
  role_relevance: number;
  skill_relevance: number;
  objective_relevance: number;
  weakness_priority: number;
  difficulty_match: number;
  question_quality: number;
  freshness_weight: number;
  previous_exposure_penalty: number;
  semantic_duplicate_penalty: number;
  total: number;
};

export type ScoredSelection = {
  questionId: string;
  score: SelectionScoreBreakdown;
  selectedBecause: string[];
  selectionPolicyVersion: string;
};

function tokenBlob(q: SelectionCandidate): string {
  return [
    q.category,
    q.subject,
    q.topic,
    ...(q.tags ?? []),
    ...(q.eligible_roles ?? []),
  ]
    .map((t) => String(t ?? "").toLowerCase())
    .join(" ");
}

/** Stable FNV-1a style hash for deterministic tie-breaks. */
export function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function scoreCandidate(
  question: SelectionCandidate,
  opts: {
    roleSlug: string;
    targetCategories: string[];
    weakTopics?: string[];
    skillsInclude?: string[];
    difficulty?: string;
    recentQuestionIds?: Set<string>;
    selectedFingerprints?: Set<string>;
    fingerprint?: string;
    roleLabel?: string;
  },
): ScoredSelection {
  const blob = tokenBlob(question);
  const reasons: string[] = [];
  const roles = (question.eligible_roles ?? []).map((r) => r.toLowerCase());
  const role_relevance = roles.includes(opts.roleSlug.toLowerCase()) || blob.includes(opts.roleSlug)
    ? 1
    : opts.targetCategories.some((c) => blob.includes(c.toLowerCase()))
      ? 0.7
      : 0.2;
  if (role_relevance >= 0.7) {
    reasons.push(`Matches ${opts.roleLabel ?? opts.roleSlug} role`);
  }

  const catHit = opts.targetCategories.find((c) => blob.includes(c.toLowerCase()));
  const skill_relevance = catHit ? 0.9 : 0.3;
  if (catHit) reasons.push(`Assesses ${catHit}`);

  const skills = (opts.skillsInclude ?? []).map((s) => s.toLowerCase());
  const objective_relevance = skills.some((s) => blob.includes(s)) ? 0.8 : 0.5;

  const weak = (opts.weakTopics ?? []).map((w) => w.toLowerCase());
  const weakness_priority = weak.some((w) => blob.includes(w) || (catHit && w.includes(catHit)))
    ? 0.85
    : 0;
  if (weakness_priority > 0) reasons.push("Addresses a previously weak topic");

  const diff = String(question.difficulty ?? "medium").toLowerCase();
  const want = String(opts.difficulty ?? "mixed").toLowerCase();
  const difficulty_match =
    want === "mixed" || want === diff ? 1 : want === "medium" && (diff === "easy" || diff === "hard") ? 0.6 : 0.3;
  if (difficulty_match >= 1) {
    reasons.push(`Difficulty matches ${want === "mixed" ? "profile mix" : want} profile`);
  }

  const question_quality =
    question.review_status === "approved" || question.is_verified === true ? 1 : 0.5;
  const freshness_weight = 0.5;
  const previous_exposure_penalty = opts.recentQuestionIds?.has(question.id) ? 0.95 : 0;
  const fp = opts.fingerprint ?? question.id;
  const semantic_duplicate_penalty = opts.selectedFingerprints?.has(fp) ? 1 : 0;

  const total =
    role_relevance +
    skill_relevance +
    objective_relevance +
    weakness_priority +
    difficulty_match +
    question_quality +
    freshness_weight -
    previous_exposure_penalty -
    semantic_duplicate_penalty;

  return {
    questionId: question.id,
    score: {
      role_relevance,
      skill_relevance,
      objective_relevance,
      weakness_priority,
      difficulty_match,
      question_quality,
      freshness_weight,
      previous_exposure_penalty,
      semantic_duplicate_penalty,
      total,
    },
    selectedBecause: reasons.length ? reasons : ["Eligible for blueprint coverage"],
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
  };
}

export function selectDeterministicQuestions(
  candidates: SelectionCandidate[],
  quotas: Record<string, number>,
  opts: {
    roleSlug: string;
    roleLabel?: string;
    selectionSeed: string;
    weakTopics?: string[];
    skillsInclude?: string[];
    difficulty?: string;
    recentQuestionIds?: string[];
  },
): { questionIds: string[]; ledger: ScoredSelection[] } {
  const recent = new Set(opts.recentQuestionIds ?? []);
  const selectedFp = new Set<string>();
  const used = new Set<string>();
  const ledger: ScoredSelection[] = [];
  const questionIds: string[] = [];

  const byCat = (cat: string) =>
    candidates.filter((q) => {
      if (used.has(q.id)) return false;
      const blob = tokenBlob(q);
      return blob.includes(cat.toLowerCase());
    });

  for (const [cat, need] of Object.entries(quotas)) {
    if (need <= 0) continue;
    const pool = byCat(cat);
    const scored = pool
      .map((q) =>
        scoreCandidate(q, {
          roleSlug: opts.roleSlug,
          roleLabel: opts.roleLabel,
          targetCategories: [cat],
          weakTopics: opts.weakTopics,
          skillsInclude: opts.skillsInclude,
          difficulty: opts.difficulty,
          recentQuestionIds: recent,
          selectedFingerprints: selectedFp,
        }),
      )
      .sort((a, b) => {
        if (b.score.total !== a.score.total) return b.score.total - a.score.total;
        return (
          stableHash(`${a.questionId}:${opts.selectionSeed}`) -
          stableHash(`${b.questionId}:${opts.selectionSeed}`)
        );
      });

    let taken = 0;
    for (const row of scored) {
      if (taken >= need) break;
      if (used.has(row.questionId)) continue;
      used.add(row.questionId);
      selectedFp.add(row.questionId);
      questionIds.push(row.questionId);
      ledger.push(row);
      taken += 1;
    }
  }

  // Remainder fill from all remaining candidates (deterministic)
  const totalNeeded = Object.values(quotas).reduce((a, b) => a + b, 0);
  if (questionIds.length < totalNeeded) {
    const scored = candidates
      .filter((q) => !used.has(q.id))
      .map((q) =>
        scoreCandidate(q, {
          roleSlug: opts.roleSlug,
          roleLabel: opts.roleLabel,
          targetCategories: Object.keys(quotas),
          weakTopics: opts.weakTopics,
          skillsInclude: opts.skillsInclude,
          difficulty: opts.difficulty,
          recentQuestionIds: recent,
          selectedFingerprints: selectedFp,
        }),
      )
      .sort((a, b) => {
        if (b.score.total !== a.score.total) return b.score.total - a.score.total;
        return (
          stableHash(`${a.questionId}:${opts.selectionSeed}`) -
          stableHash(`${b.questionId}:${opts.selectionSeed}`)
        );
      });
    for (const row of scored) {
      if (questionIds.length >= totalNeeded) break;
      used.add(row.questionId);
      questionIds.push(row.questionId);
      ledger.push(row);
    }
  }

  return { questionIds, ledger };
}

/** Client-safe ledger (no internal numeric weights). */
export function publicSelectionLedger(ledger: ScoredSelection[]): Array<{
  questionId: string;
  selectedBecause: string[];
  selectionPolicyVersion: string;
}> {
  return ledger.map((row) => ({
    questionId: row.questionId,
    selectedBecause: row.selectedBecause,
    selectionPolicyVersion: row.selectionPolicyVersion,
  }));
}
