import type { ParsedResume } from "@/types/ai.types";
import { extractSkillsFromResumeText } from "@/lib/documents/parseNormalize";

const SECTION_HEADERS = [
  "profile summary",
  "professional summary",
  "summary",
  "objective",
  "about me",
  "skills",
  "technical skills",
  "key skills",
  "core skills",
  "experience",
  "work experience",
  "professional experience",
  "employment history",
  "education",
  "projects",
  "certifications",
  "achievements",
  "languages",
] as const;

export type DocumentPreviewSection = {
  heading: string;
  body: string;
};

const SECTION_PATTERN = new RegExp(
  `\\b(${[...SECTION_HEADERS]
    .sort((a, b) => b.length - a.length)
    .map((h) => h.replace(/\s+/g, "\\s+"))
    .join("|")})\\b`,
  "gi",
);

function titleCaseHeading(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Split flattened resume/cover text into labeled sections for display. */
export function splitDocumentTextIntoSections(text: string): DocumentPreviewSection[] {
  const normalized = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const matches = [...normalized.matchAll(SECTION_PATTERN)];
  if (matches.length === 0) {
    return [{ heading: "Content", body: normalized }];
  }

  const sections: DocumentPreviewSection[] = [];
  const intro = normalized.slice(0, matches[0].index ?? 0).trim();
  if (intro) {
    sections.push({ heading: "Header", body: intro });
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const heading = titleCaseHeading(match[0]);
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
    const body = normalized.slice(start, end).trim();
    if (body) sections.push({ heading, body });
  }

  return sections;
}

export function isTextFallbackResume(parsed: ParsedResume | null): boolean {
  if (!parsed?.summary) return false;
  const hasStructure =
    (parsed.experience?.length ?? 0) > 0 ||
    (parsed.education?.length ?? 0) > 0 ||
    (parsed.projects?.length ?? 0) > 0;
  if (hasStructure) return false;
  if (parsed.summary.length > 500) return true;
  return splitDocumentTextIntoSections(parsed.summary).length > 1;
}

export function buildResumePreviewSections(parsed: ParsedResume | null): DocumentPreviewSection[] {
  if (!parsed) return [];

  if (isTextFallbackResume(parsed) && parsed.summary) {
    return splitDocumentTextIntoSections(parsed.summary);
  }

  const sections: DocumentPreviewSection[] = [];
  const headerParts = [parsed.full_name, parsed.location, parsed.email, parsed.phone]
    .filter(Boolean)
    .join(" · ");
  if (headerParts) sections.push({ heading: "Header", body: headerParts });
  if (parsed.summary) sections.push({ heading: "Summary", body: parsed.summary });
  if (parsed.skills.length > 0) {
    sections.push({ heading: "Skills", body: parsed.skills.join(", ") });
  } else if (parsed.summary) {
    const recovered = extractSkillsFromResumeText(parsed.summary);
    if (recovered.length > 0) {
      sections.push({ heading: "Skills", body: recovered.join(", ") });
    }
  }
  if (parsed.experience?.length) {
    const body = parsed.experience
      .slice(0, 4)
      .map((exp) => {
        const title = [exp.title, exp.company, exp.duration].filter(Boolean).join(" @ ");
        const bullet = exp.impact_bullets?.[0] ?? exp.description?.slice(0, 160) ?? "";
        return bullet ? `${title} — ${bullet}` : title;
      })
      .join("\n");
    sections.push({ heading: "Experience", body });
  }
  if (parsed.education?.length) {
    const body = parsed.education
      .slice(0, 3)
      .map((edu) =>
        [edu.institution, edu.degree, edu.field, edu.graduation_year ? String(edu.graduation_year) : null]
          .filter(Boolean)
          .join(" · "),
      )
      .join("\n");
    sections.push({ heading: "Education", body });
  }
  return sections;
}

export function buildPlainTextPreviewSections(text: string): DocumentPreviewSection[] {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return [];
  const sections = splitDocumentTextIntoSections(trimmed);
  return sections.length > 0 ? sections : [{ heading: "Content", body: trimmed }];
}

/** Cover letters: paragraph flow, not resume section headers. */
export function buildCoverLetterPreviewSections(text: string): DocumentPreviewSection[] {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return [];

  const closingMatch = trimmed.match(
    /\b(Sincerely|Best regards|Kind regards|Warm regards|Regards|Thank you|Yours truly|Respectfully)[,\s]/i,
  );
  const dearMatch = trimmed.match(/^Dear\s+/im);

  if (dearMatch || closingMatch) {
    const sections: DocumentPreviewSection[] = [];
    const closingIdx = closingMatch?.index ?? trimmed.length;
    const openingEnd = trimmed.search(/\n\s*\n/);
    const opening = trimmed.slice(0, openingEnd > 0 ? openingEnd : Math.min(280, closingIdx)).trim();
    if (opening) sections.push({ heading: "Opening", body: opening });
    const bodyStart = openingEnd > 0 ? openingEnd : opening.length;
    const body = trimmed.slice(bodyStart, closingIdx).trim();
    if (body) sections.push({ heading: "Body", body });
    const closing = trimmed.slice(closingIdx).trim();
    if (closing) sections.push({ heading: "Closing", body: closing });
    return sections.length > 0 ? sections : [{ heading: "Letter", body: trimmed }];
  }

  const paragraphs = trimmed.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return [{ heading: "Letter", body: trimmed }];
  }
  return paragraphs.map((body, index) => ({
    heading: index === 0 ? "Opening" : index === paragraphs.length - 1 ? "Closing" : `Paragraph ${index + 1}`,
    body,
  }));
}

const PORTFOLIO_SECTION_HEADERS = [
  "featured project",
  "featured work",
  "case study",
  "projects",
  "selected work",
  "highlights",
  "about",
  "experience",
  "skills",
] as const;

/** Portfolio: project/case-study blocks rather than resume layout. */
export function buildPortfolioPreviewSections(text: string): DocumentPreviewSection[] {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return [];

  const pattern = new RegExp(
    `\\b(${[...PORTFOLIO_SECTION_HEADERS]
      .sort((a, b) => b.length - a.length)
      .map((h) => h.replace(/\s+/g, "\\s+"))
      .join("|")})\\b`,
    "gi",
  );
  const matches = [...trimmed.matchAll(pattern)];
  if (matches.length === 0) {
    const blocks = trimmed.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    if (blocks.length <= 1) {
      return [{ heading: "Overview", body: trimmed }];
    }
    return blocks.map((body, index) => ({
      heading: index === 0 ? "Overview" : `Highlight ${index + 1}`,
      body,
    }));
  }

  const sections: DocumentPreviewSection[] = [];
  const intro = trimmed.slice(0, matches[0].index ?? 0).trim();
  if (intro) sections.push({ heading: "Overview", body: intro });

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const heading = titleCaseHeading(match[0]);
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const body = trimmed.slice(start, end).trim();
    if (body) sections.push({ heading, body });
  }
  return sections.length > 0 ? sections : [{ heading: "Overview", body: trimmed }];
}

export function truncatePreviewBody(body: string, max = 320): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}…`;
}
