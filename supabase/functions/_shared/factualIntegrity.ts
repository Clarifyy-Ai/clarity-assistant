/**
 * Shared STAR factual integrity checks for Edge Functions.
 * Flag invented numbers / multi-word proper nouns not present in source.
 */

const NUMBER_RE = /\b\d+(?:[.,]\d+)?%?\b|\b\d{1,3}(?:,\d{3})+\b/g;
const PROPER_NOUN_RE =
  /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}|[A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/,/g, "").trim();
}

function collectNumbers(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of text.matchAll(NUMBER_RE)) {
    set.add(normalizeToken(m[0]));
  }
  return set;
}

function collectProperNouns(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of text.matchAll(PROPER_NOUN_RE)) {
    const t = m[0].trim();
    if (/^(Situation|Task|Action|Result|I|We|My|The|A|An)$/i.test(t)) continue;
    set.add(normalizeToken(t));
  }
  return set;
}

export type FactualCheck = {
  ok: boolean;
  inventedNumbers: string[];
  inventedTerms: string[];
};

export function assessStarFactualIntegrity(
  sourceText: string,
  outputText: string,
): FactualCheck {
  const source = String(sourceText ?? "");
  const output = String(outputText ?? "");
  if (!output.trim()) {
    return { ok: false, inventedNumbers: [], inventedTerms: ["(empty)"] };
  }

  const sourceNumbers = collectNumbers(source);
  const inventedNumbers: string[] = [];
  for (const n of collectNumbers(output)) {
    if (!sourceNumbers.has(n)) inventedNumbers.push(n);
  }

  const sourceNouns = collectProperNouns(source);
  const inventedTerms: string[] = [];
  for (const term of collectProperNouns(output)) {
    if (!sourceNouns.has(term) && term.length > 3) inventedTerms.push(term);
  }

  if (inventedNumbers.length > 0) {
    return { ok: false, inventedNumbers, inventedTerms };
  }
  if (inventedTerms.length >= 2) {
    return { ok: false, inventedNumbers, inventedTerms };
  }
  return { ok: true, inventedNumbers: [], inventedTerms: [] };
}

const LIVE_COACH_ALLOWLIST = new Set(
  [
    "situation",
    "task",
    "action",
    "result",
    "star",
    "interviewer",
    "candidate",
    "resume",
    "company",
    "team",
    "project",
    "system",
  ].map((t) => t.toLowerCase()),
);

/**
 * Post-generation gate for live hint / answer.
 * Thin evidence (short/empty source) only fails on invented metrics — scaffolds are allowed.
 */
export function assessLiveCoachFactualIntegrity(
  sourceText: string,
  outputText: string,
): FactualCheck {
  const source = String(sourceText ?? "").trim();
  const output = String(outputText ?? "");
  if (!output.trim()) {
    return { ok: false, inventedNumbers: [], inventedTerms: ["(empty)"] };
  }

  // Scaffold / thin-evidence path: no employer-rich resume — only block invented numbers.
  if (source.length < 80) {
    const sourceNumbers = collectNumbers(source);
    const inventedNumbers: string[] = [];
    for (const n of collectNumbers(output)) {
      if (!sourceNumbers.has(n)) inventedNumbers.push(n);
    }
    if (inventedNumbers.length > 0) {
      return { ok: false, inventedNumbers, inventedTerms: [] };
    }
    return { ok: true, inventedNumbers: [], inventedTerms: [] };
  }

  const base = assessStarFactualIntegrity(source, output);
  if (base.ok) return base;

  // Soften proper-noun false positives for common coaching vocabulary.
  const filteredTerms = base.inventedTerms.filter(
    (t) => !LIVE_COACH_ALLOWLIST.has(t.toLowerCase()),
  );
  if (base.inventedNumbers.length === 0 && filteredTerms.length < 2) {
    return { ok: true, inventedNumbers: [], inventedTerms: [] };
  }
  return { ...base, inventedTerms: filteredTerms };
}

/** Throw when live coach output fails the post-generation gate. */
export function assertLiveCoachOutputGrounded(
  sourceText: string,
  outputText: string,
): void {
  const check = assessLiveCoachFactualIntegrity(sourceText, outputText);
  if (!check.ok) {
    throw new Error("AI returned invalid output (factual integrity gate)");
  }
}

/** Lightweight system-design section presence check (edge mirror). */
export function isValidSystemDesignOutput(text: string): boolean {
  const t = String(text ?? "").trim();
  if (t.length < 120) return false;
  const lower = t.toLowerCase();
  let hits = 0;
  if (/requirement/.test(lower)) hits++;
  if (/architect|high[- ]?level|hld/.test(lower)) hits++;
  if (/\bdata\b/.test(lower)) hits++;
  if (/scal(e|ing)/.test(lower)) hits++;
  if (/trade[- ]?off/.test(lower)) hits++;
  return hits >= 3;
}

export const FACTUAL_INTEGRITY_SYSTEM_RULE = `
FACTUAL INTEGRITY (mandatory):
- Only use employers, job titles, technologies, metrics, dates, awards, and outcomes present in the user input.
- Never invent employers, metrics, technologies, titles, or team sizes.
- If a measurable result is missing, write [Add measurable result if available] or [NEEDS EVIDENCE] — never invent numbers, percentages, revenue, team size, or business results.
- If resume evidence is thin or missing, give a brief scaffold/structure and clearly state what information is still needed — do not fabricate a full answer.
- You may improve wording, structure, and clarity.
- You must NOT silently invent factual claims.
`.trim();
