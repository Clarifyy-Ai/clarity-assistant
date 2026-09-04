import type { AssessmentRoleSlug } from "@/lib/assessments/taxonomy";

export const BLUEPRINT_POLICY_VERSION = "assessment-blueprint-v1";
export const SELECTION_POLICY_VERSION = "assessment-selection-v1";

export type CategoryWeights = Record<string, number>;

/** Default category blueprints — must sum to 100. */
export const ROLE_BLUEPRINTS: Record<AssessmentRoleSlug, CategoryWeights> = {
  "backend-developer": {
    backend: 35,
    sql: 25,
    java: 15,
    python: 10,
    devops: 15,
  },
  "frontend-developer": {
    javascript: 30,
    react: 25,
    html: 15,
    css: 15,
    backend: 15,
  },
  "full-stack-developer": {
    javascript: 20,
    react: 15,
    backend: 25,
    sql: 20,
    html: 10,
    css: 10,
  },
  "data-analyst": {
    sql: 45,
    aptitude: 30,
    python: 25,
  },
  "qa-engineer": {
    aptitude: 30,
    backend: 25,
    sql: 25,
    javascript: 20,
  },
  "devops-assessment": {
    devops: 55,
    backend: 25,
    sql: 20,
  },
  "python-assessment": { python: 70, sql: 20, aptitude: 10 },
  "sql-assessment": { sql: 80, aptitude: 20 },
  "java-developer": { java: 70, backend: 20, sql: 10 },
  "react-assessment": { react: 60, javascript: 25, css: 15 },
  "general-aptitude": { aptitude: 70, hr: 30 },
  "hr-interview": { hr: 80, aptitude: 20 },
};

const WEAK_BOOST_POINTS = 10;
const MAX_CATEGORY_PCT = 40;

export function sumWeights(weights: CategoryWeights): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

export function normalizeWeights(weights: CategoryWeights): CategoryWeights {
  const total = sumWeights(weights);
  if (total <= 0) return weights;
  const out: CategoryWeights = {};
  for (const [k, v] of Object.entries(weights)) {
    out[k] = Math.round((v / total) * 1000) / 10;
  }
  // Fix rounding drift on largest key
  const drift = 100 - sumWeights(out);
  const keys = Object.keys(out);
  if (keys.length && Math.abs(drift) >= 0.05) {
    const largest = keys.reduce((a, b) => (out[a] >= out[b] ? a : b));
    out[largest] = Math.round((out[largest] + drift) * 10) / 10;
  }
  return out;
}

export function blueprintForRole(
  role: AssessmentRoleSlug,
  templateOverride?: CategoryWeights | null,
): CategoryWeights {
  if (templateOverride && Object.keys(templateOverride).length > 0) {
    return normalizeWeights(templateOverride);
  }
  return { ...(ROLE_BLUEPRINTS[role] ?? ROLE_BLUEPRINTS["general-aptitude"]) };
}

/**
 * Apply bounded weak-topic boost. Matching is case-insensitive substring on category keys.
 */
export function applyWeakTopicBoost(
  baseline: CategoryWeights,
  weakTopics: string[] | null | undefined,
): { weights: CategoryWeights; boostedCategories: string[] } {
  const weak = (weakTopics ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (weak.length === 0) {
    return { weights: normalizeWeights(baseline), boostedCategories: [] };
  }

  const next = { ...baseline };
  const boosted: string[] = [];
  for (const cat of Object.keys(next)) {
    const hit = weak.some((w) => w.includes(cat) || cat.includes(w));
    if (!hit) continue;
    next[cat] = Math.min(MAX_CATEGORY_PCT, next[cat] + WEAK_BOOST_POINTS);
    boosted.push(cat);
  }
  if (boosted.length === 0) {
    return { weights: normalizeWeights(baseline), boostedCategories: [] };
  }
  return { weights: normalizeWeights(next), boostedCategories: boosted };
}

export function allocateQuestionCounts(
  total: number,
  weights: CategoryWeights,
): Record<string, number> {
  const cats = Object.keys(weights);
  if (cats.length === 0 || total <= 0) return {};
  const raw = cats.map((c) => ({
    cat: c,
    ideal: (weights[c] / 100) * total,
  }));
  const floors = raw.map((r) => ({
    cat: r.cat,
    n: Math.floor(r.ideal),
    frac: r.ideal - Math.floor(r.ideal),
  }));
  let assigned = floors.reduce((s, f) => s + f.n, 0);
  let remaining = total - assigned;
  floors.sort((a, b) => b.frac - a.frac);
  const out: Record<string, number> = {};
  for (const f of floors) out[f.cat] = f.n;
  for (const f of floors) {
    if (remaining <= 0) break;
    out[f.cat] += 1;
    remaining -= 1;
  }
  return out;
}

export function blueprintsDifferMaterially(
  a: CategoryWeights,
  b: CategoryWeights,
  minDeltaPct = 15,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let maxDelta = 0;
  for (const k of keys) {
    maxDelta = Math.max(maxDelta, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
  }
  return maxDelta >= minDeltaPct;
}
