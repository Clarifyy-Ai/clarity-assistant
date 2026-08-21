import type { ParsedResume } from "@/types/ai.types";

const MAX_RESUME_LIST_ITEMS = 100;
const MAX_RESUME_FIELD_LENGTH = 4_000;

function text(value: unknown, max = MAX_RESUME_FIELD_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function textList(value: unknown, maxItems = MAX_RESUME_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 200))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

/** Normalize edge parse-resume JSON (`name`) into app ParsedResume (`full_name`). */
export function normalizeParsedResume(raw: Record<string, unknown> | null): ParsedResume | null {
  if (!raw || typeof raw !== "object") return null;

  const skills = textList(raw.skills);
  const tech_stack = textList(raw.tech_stack);

  return {
    full_name: text(raw.full_name) ?? text(raw.name, 200),
    email: text(raw.email, 320),
    phone: text(raw.phone, 80),
    location: text(raw.location, 200),
    summary: text(raw.summary) ?? text(raw.profile),
    skills,
    tech_stack,
    // AI output is untrusted: only retain object entries. Consumers can safely
    // render these fields even when a provider returns partial/malformed JSON.
    experience: Array.isArray(raw.experience)
      ? raw.experience.filter((item): item is ParsedResume["experience"][number] => Boolean(item && typeof item === "object")).slice(0, MAX_RESUME_LIST_ITEMS)
      : [],
    projects: Array.isArray(raw.projects)
      ? raw.projects.filter((item): item is ParsedResume["projects"][number] => Boolean(item && typeof item === "object")).slice(0, MAX_RESUME_LIST_ITEMS)
      : [],
    education: Array.isArray(raw.education)
      ? raw.education.filter((item): item is ParsedResume["education"][number] => Boolean(item && typeof item === "object")).slice(0, MAX_RESUME_LIST_ITEMS)
      : [],
    total_years_experience:
      typeof raw.total_years_experience === "number" && Number.isFinite(raw.total_years_experience)
        ? Math.max(0, Math.min(60, raw.total_years_experience))
        : null,
    seniority_signal: null,
  };
}

export function parseResumeContentString(content: string | null | undefined): ParsedResume | null {
  if (!content?.trim()) return null;
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    if (typeof raw._parse_error === "string" && raw._parse_error) return null;
    return normalizeParsedResume(raw);
  } catch {
    const text = content.trim();
    if (text.length < 20) return null;
    return normalizeParsedResume({ summary: text.slice(0, 8000) });
  }
}

export type ResumeParseStatus = "pending" | "parsing" | "ready" | "error";

export function getResumeParseStatus(
  content: string | null | undefined,
  isParsingGlobally: boolean,
): ResumeParseStatus {
  if (content?.trim()) {
    try {
      const raw = JSON.parse(content) as Record<string, unknown>;
      if (typeof raw._parse_error === "string" && raw._parse_error) {
        return "error";
      }
    } catch {
      // non-JSON content still counts as ready below
    }
  }

  const parsed = parseResumeContentString(content);
  if (parsed && (parsed.summary || parsed.skills.length > 0 || parsed.experience.length > 0)) {
    return "ready";
  }
  if (isParsingGlobally && !content) return "parsing";
  if (content?.trim()) return "ready";
  return "pending";
}

/** Compact block for generate-hint / generate-answer prompts. */
export function formatParsedResumeForAI(
  parsed: ParsedResume | null,
  extras?: {
    jdSnippet?: string | null;
    instructions?: string | null;
    coverLetter?: string | null;
    role?: string | null;
    company?: string | null;
  },
): string {
  const parts: string[] = [];

  if (extras?.role || extras?.company) {
    parts.push(
      `Target role: ${extras.role ?? "—"} at ${extras.company ?? "—"}`,
    );
  }

  if (parsed) {
    if (parsed.full_name) parts.push(`Candidate: ${parsed.full_name}`);
    if (parsed.summary) parts.push(`Summary: ${parsed.summary}`);
    const skills = [...new Set([...parsed.skills, ...parsed.tech_stack])].slice(0, 20);
    if (skills.length) parts.push(`Skills: ${skills.join(", ")}`);
    if (parsed.experience?.length) {
      const expLines = parsed.experience.slice(0, 4).map((e) => {
        const bullet = Array.isArray(e.impact_bullets)
          ? e.impact_bullets.find((item) => typeof item === "string")?.slice(0, 120)
          : typeof e.description === "string" ? e.description.slice(0, 120) : "";
        const title = typeof e.title === "string" ? e.title : "Role";
        const company = typeof e.company === "string" ? e.company : "Unknown company";
        return `• ${title} @ ${company}${bullet ? ` — ${bullet}` : ""}`;
      });
      parts.push(`Experience:\n${expLines.join("\n")}`);
    }
    if (parsed.projects?.length) {
      const proj = parsed.projects.slice(0, 3)
        .map((p) => typeof p.name === "string" ? p.name : null)
        .filter((name): name is string => Boolean(name))
        .join("; ");
      if (proj) parts.push(`Projects: ${proj}`);
    }
  }

  if (extras?.jdSnippet?.trim()) {
    parts.push(`Job description:\n${extras.jdSnippet.trim().slice(0, 3000)}`);
  }

  if (extras?.coverLetter?.trim()) {
    parts.push(`Cover letter:\n${extras.coverLetter.trim().slice(0, 2000)}`);
  }

  if (extras?.instructions?.trim()) {
    parts.push(`Session instructions (follow these):\n${extras.instructions.trim().slice(0, 1500)}`);
  }

  return parts.join("\n\n") || "None provided.";
}
