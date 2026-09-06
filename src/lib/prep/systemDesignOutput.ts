import { splitMarkdownSections } from "@/lib/prep/structuredOutput";

/** Section title keywords expected from the system_design prep-tool prompt. */
const REQUIRED_SECTION_KEYWORDS = [
  "requirement",
  "architecture",
  "high-level",
  "hld",
  "data",
  "scaling",
  "scale",
  "tradeoff",
  "trade-off",
] as const;

const MIN_RESULT_CHARS = 120;
const MIN_MATCHED_SECTIONS = 3;

export type SystemDesignValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Lightweight keyword gate — mirrors edge `isValidSystemDesignOutput`.
 * Accepts prose or markdown when core design topics appear in the full text.
 */
export function passesSystemDesignKeywordGate(text: string): boolean {
  const t = String(text ?? "").trim();
  if (t.length < MIN_RESULT_CHARS) return false;
  const lower = t.toLowerCase();
  let hits = 0;
  if (/requirement/.test(lower)) hits++;
  if (/architect|high[- ]?level|hld/.test(lower)) hits++;
  if (/\bdata\b/.test(lower)) hits++;
  if (/scal(e|ing)/.test(lower)) hits++;
  if (/trade[- ]?off/.test(lower)) hits++;
  return hits >= MIN_MATCHED_SECTIONS;
}

function titleMatchesKeyword(title: string, keyword: string): boolean {
  return title.toLowerCase().includes(keyword);
}

/**
 * Validate system-design AI output before treating generation as success.
 * Primary gate matches the edge function; section parsing is a secondary fallback.
 */
export function validateSystemDesignOutput(text: string): SystemDesignValidation {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length < MIN_RESULT_CHARS) {
    return { ok: false, reason: "Design output was too short or empty." };
  }

  if (passesSystemDesignKeywordGate(trimmed)) {
    return { ok: true };
  }

  const sections = splitMarkdownSections(trimmed);
  const titles = sections.map((s) => s.title);
  const matched = new Set<string>();

  for (const title of titles) {
    for (const keyword of REQUIRED_SECTION_KEYWORDS) {
      if (titleMatchesKeyword(title, keyword)) matched.add(keyword);
    }
  }

  const families = [
    ["requirement"],
    ["architecture", "high-level", "hld"],
    ["data"],
    ["scaling", "scale"],
    ["tradeoff", "trade-off"],
  ];
  let familyHits = 0;
  for (const family of families) {
    if (family.some((k) => matched.has(k))) familyHits += 1;
  }

  if (familyHits < MIN_MATCHED_SECTIONS && sections.length < MIN_MATCHED_SECTIONS) {
    return {
      ok: false,
      reason: "Design output was missing required sections.",
    };
  }

  const nonemptyBodies = sections.filter((s) => s.body.trim().length >= 20);
  if (nonemptyBodies.length < 2 && trimmed.length < 400) {
    return { ok: false, reason: "Design output was incomplete." };
  }

  return { ok: true };
}
