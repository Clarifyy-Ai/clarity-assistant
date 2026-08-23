/**
 * Detect suspicious invented claims in STAR AI output vs user source text.
 * Does not delete user-provided numbers; flags tokens that appear only in output.
 */

const NUMBER_RE = /\b\d+(?:[.,]\d+)?%?\b|\b\d{1,3}(?:,\d{3})+\b/g;
/** Simple org / product-ish Proper Nouns (2+ capitalized words or CamelCase tech). */
const PROPER_NOUN_RE =
  /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}|[A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

const PLACEHOLDER_OK = /\[(?:NEEDS EVIDENCE|Add measurable result[^\]]*)\]/i;

export type FactualIntegrityResult =
  | { ok: true }
  | { ok: false; inventedNumbers: string[]; inventedTerms: string[] };

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
    // Skip STAR labels and common sentence starters
    if (/^(Situation|Task|Action|Result|I|We|My|The|A|An)$/i.test(t)) continue;
    set.add(normalizeToken(t));
  }
  return set;
}

/**
 * Compare AI output against the factual baseline (user STAR + question + resume draft).
 * Returns ok:false when output introduces numbers or proper nouns absent from source.
 */
export function assessStarFactualIntegrity(
  sourceText: string,
  outputText: string,
): FactualIntegrityResult {
  const source = String(sourceText ?? "");
  const output = String(outputText ?? "");
  if (!output.trim()) {
    return { ok: false, inventedNumbers: [], inventedTerms: ["(empty)"] };
  }

  // Placeholders for missing evidence are allowed.
  if (PLACEHOLDER_OK.test(output) && output.replace(PLACEHOLDER_OK, "").trim().length < 40) {
    return { ok: true };
  }

  const sourceNumbers = collectNumbers(source);
  const outputNumbers = collectNumbers(output);
  const inventedNumbers: string[] = [];
  for (const n of outputNumbers) {
    if (!sourceNumbers.has(n)) inventedNumbers.push(n);
  }

  const sourceNouns = collectProperNouns(source);
  const outputNouns = collectProperNouns(output);
  const inventedTerms: string[] = [];
  for (const term of outputNouns) {
    if (!sourceNouns.has(term) && term.length > 3) {
      inventedTerms.push(term);
    }
  }

  // Be strict on numbers; soft on proper nouns (require 2+ invented to reduce false positives).
  if (inventedNumbers.length > 0) {
    return { ok: false, inventedNumbers, inventedTerms };
  }
  if (inventedTerms.length >= 2) {
    return { ok: false, inventedNumbers, inventedTerms };
  }

  return { ok: true };
}

export function starSectionsToText(parts: {
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
}): string {
  return [
    parts.situation && `Situation: ${parts.situation}`,
    parts.task && `Task: ${parts.task}`,
    parts.action && `Action: ${parts.action}`,
    parts.result && `Result: ${parts.result}`,
  ]
    .filter(Boolean)
    .join("\n");
}
