/**
 * Shared JD field heuristics — used by parse-document edge and client heal path.
 * Tolerant of PDF text that lacks reliable newlines.
 */

export type ExtractedJdFields = {
  role: string | null;
  company: string | null;
  location: string | null;
  salary_range: string | null;
  required_skills: string[];
  summary: string;
};

const MAX_FIELD = 180;
const MAX_SKILL = 80;

const NEXT_FIELD =
  "\\s+(?:company|employer|location|salary|compensation|pay(?:\\s*range)?|ctc|package|required|requirements|responsibilities|qualifications|benefits|employment|experience|skills|about|job(?:\\s*title|\\s*location|\\s*number|\\s*id)?|$)";

function cleanField(value: string | undefined | null): string | null {
  const g = value?.replace(/\s+/g, " ").trim();
  if (!g || g.length < 2 || g.length > MAX_FIELD) return null;
  if (g === "[object Object]") return null;
  return g;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    const g = cleanField(typeof m?.[1] === "string" ? m[1] : undefined);
    if (g) return g;
  }
  return null;
}

function labeledValue(text: string, labelPattern: string, maxLen = 120): string | null {
  const multiline = new RegExp(`${labelPattern}\\s*[:\\-–—|]\\s*([^\\n]{2,${maxLen}})`, "i");
  const fromLine = cleanField(text.match(multiline)?.[1]);
  if (fromLine) return fromLine;

  const flat = new RegExp(
    `${labelPattern}\\s*[:\\-–—|]?\\s*(.{2,${maxLen}}?)(?=${NEXT_FIELD})`,
    "i",
  );
  return cleanField(text.match(flat)?.[1]);
}

function normalizeSkillToken(line: string): string | null {
  const t = line.replace(/^[\-\*\d.\s]+/, "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 2 || t.length > MAX_SKILL || t === "[object Object]") return null;
  return t;
}

export function extractJdFieldsFromText(text: string): ExtractedJdFields {
  const clipped = (text ?? "").replace(/\u0000/g, "").trim().slice(0, 50_000);
  if (!clipped) {
    return {
      role: null,
      company: null,
      location: null,
      salary_range: null,
      required_skills: [],
      summary: "",
    };
  }

  const role =
    labeledValue(clipped, "(?:job\\s*title|position|role|title|designation)", 120) ??
    firstMatch(clipped, [/we are hiring (?:a[n]? )?([^\n.]{3,80})/i]);

  const company =
    labeledValue(clipped, "(?:company|employer|organization|hiring company)", 120) ??
    firstMatch(clipped, [/about\s+([A-Z][A-Za-z0-9&.\- ]{1,60})\b/]);

  const location =
    labeledValue(
      clipped,
      "(?:job\\s*location|work\\s*location|workplace|work\\s*site|place\\s*of\\s*posting|posting\\s*location|office\\s*location|office|locations?|location)",
      120,
    ) ??
    firstMatch(clipped, [
      /(?:based in|located in)\s+([A-Za-z][A-Za-z0-9\s,/\-–—]{2,80})/i,
      /\b((?:remote|hybrid|on-?site)(?:\s*[,/|]\s*(?:remote|hybrid|on-?site|[A-Za-z][A-Za-z\s]{2,40}))(?:\s*[,/|]\s*(?:[A-Za-z][A-Za-z\s]{2,40}))?)\b/i,
    ]);

  const salary_range =
    labeledValue(
      clipped,
      "(?:salary(?:\\s*range)?|compensation(?:\\s*range)?|pay\\s*range|ctc|package|pay(?:\\s*scale|\\s*band)?|base\\s*salary|annual\\s*salary|expected\\s*salary|remuneration|total\\s*compensation)",
      120,
    ) ??
    firstMatch(clipped, [
      /(?:salary|compensation|ctc|pay)\s*[:\-–—|]?\s*((?:₹|rs\.?|inr|\$|usd)\s*[\d,.]+(?:\s*[-–—to]+\s*(?:₹|rs\.?|\$|usd)?\s*[\d,.]+)?(?:\s*(?:lpa|lac|lakhs?|k|per annum|p\.?\s*a\.?|yearly|annually|\/\s*year))?)/i,
    ]);

  const skillsBlock = clipped.match(
    /(?:required skills|key skills|must have|requirements|technical skills|core skills)[:\s]*([\s\S]{20,1200}?)(?:\n\n|responsibilities|qualifications|benefits|experience|about the role|$)/i,
  );
  const required_skills: string[] = [];
  const seen = new Set<string>();
  for (const raw of (skillsBlock?.[1] ?? "").split(/\n|•|,|;/)) {
    const skill = normalizeSkillToken(raw);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    required_skills.push(skill);
    if (required_skills.length >= 40) break;
  }

  return {
    role,
    company,
    location,
    salary_range,
    required_skills,
    summary: clipped.slice(0, 400),
  };
}
