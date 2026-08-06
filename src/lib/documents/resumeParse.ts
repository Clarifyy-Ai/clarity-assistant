import type { ParsedResume } from "@/types/ai.types";

/** Normalize edge parse-resume JSON (`name`) into app ParsedResume (`full_name`). */
export function normalizeParsedResume(raw: Record<string, unknown> | null): ParsedResume | null {
  if (!raw || typeof raw !== "object") return null;

  const skills = Array.isArray(raw.skills)
    ? raw.skills.map(String).filter(Boolean)
    : [];
  const tech_stack = Array.isArray(raw.tech_stack)
    ? raw.tech_stack.map(String).filter(Boolean)
    : [];

  return {
    full_name:
      (typeof raw.full_name === "string" && raw.full_name) ||
      (typeof raw.name === "string" && raw.name) ||
      null,
    email: typeof raw.email === "string" ? raw.email : null,
    phone: typeof raw.phone === "string" ? raw.phone : null,
    location: typeof raw.location === "string" ? raw.location : null,
    summary:
      (typeof raw.summary === "string" && raw.summary) ||
      (typeof raw.profile === "string" && raw.profile) ||
      null,
    skills,
    tech_stack,
    experience: Array.isArray(raw.experience) ? (raw.experience as ParsedResume["experience"]) : [],
    projects: Array.isArray(raw.projects) ? (raw.projects as ParsedResume["projects"]) : [],
    education: Array.isArray(raw.education) ? (raw.education as ParsedResume["education"]) : [],
    total_years_experience:
      typeof raw.total_years_experience === "number"
        ? raw.total_years_experience
        : null,
    seniority_signal: null,
  };
}

export function parseResumeContentString(content: string | null | undefined): ParsedResume | null {
  if (!content?.trim()) return null;
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    return normalizeParsedResume(raw);
  } catch {
    return null;
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
        const bullet = e.impact_bullets?.[0] ?? e.description?.slice(0, 120) ?? "";
        return `• ${e.title} @ ${e.company}${bullet ? ` — ${bullet}` : ""}`;
      });
      parts.push(`Experience:\n${expLines.join("\n")}`);
    }
    if (parsed.projects?.length) {
      const proj = parsed.projects.slice(0, 3).map((p) => p.name).join("; ");
      parts.push(`Projects: ${proj}`);
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
