/**
 * Format-aware document field normalization.
 * Never coerce objects with String() — that yields "[object Object]".
 */

import {
  extractJdFieldsFromText as extractJdFieldsFromTextShared,
  type ExtractedJdFields,
} from "../../../supabase/functions/_shared/jdFieldExtract.ts";

const MAX_SKILL = 200;
const MAX_SKILLS = 100;

export function skillItemToString(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.replace(/\s+/g, " ").trim();
    if (!t || t === "[object Object]") return null;
    return t.slice(0, MAX_SKILL);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  for (const key of ["name", "skill", "label", "text", "title", "value"]) {
    const inner = row[key];
    if (typeof inner === "string") {
      const t = inner.replace(/\s+/g, " ").trim();
      if (t && t !== "[object Object]") return t.slice(0, MAX_SKILL);
    }
  }
  return null;
}

export function normalizeSkillList(value: unknown, maxItems = MAX_SKILLS): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,;|/\n]+/)
      .map((item) => skillItemToString(item))
      .filter((item): item is string => Boolean(item))
      .slice(0, maxItems);
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = skillItemToString(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

const SKILL_SECTION_ALIASES = new Set([
  "skills",
  "technical skills",
  "key skills",
  "core skills",
  "tech stack",
  "technologies",
  "competencies",
  "tools",
  "technical competencies",
  "technical skill set",
  "skill set",
  "technical proficiency",
]);

const OTHER_RESUME_SECTIONS = new Set([
  "experience",
  "work experience",
  "employment history",
  "professional experience",
  "education",
  "projects",
  "summary",
  "profile",
  "objective",
  "professional summary",
  "certifications",
  "achievements",
  "languages",
  "about me",
]);

/**
 * Recover skill chips from resume prose when structured `skills[]` is empty
 * (common for deterministic parse stubs that only store summary text).
 */
export function extractSkillsFromResumeText(text: string, maxItems = 40): string[] {
  const clipped = (text ?? "").replace(/\u0000/g, "").trim();
  if (!clipped) return [];

  const collected: string[] = [];
  let inSkills = false;

  for (const raw of clipped.split(/\r?\n/)) {
    const line = raw.replace(/^[\s•*\-\d.]+/, "").trim();
    if (!line) continue;

    const inline = line.match(/^(.{1,60}?)\s*[:\-–]\s*(.+)$/);
    if (inline) {
      const label = inline[1].replace(/:$/, "").trim().toLowerCase();
      if (SKILL_SECTION_ALIASES.has(label)) {
        collected.push(...normalizeSkillList(inline[2], maxItems));
        inSkills = true;
        continue;
      }
    }

    const heading = line.replace(/:$/, "").trim().toLowerCase();
    if (SKILL_SECTION_ALIASES.has(heading)) {
      inSkills = true;
      continue;
    }
    if (OTHER_RESUME_SECTIONS.has(heading)) {
      inSkills = false;
      continue;
    }
    if (inSkills) {
      collected.push(...normalizeSkillList(line, maxItems));
    }
  }

  return normalizeSkillList(collected, maxItems);
}

export function looksLikeBinaryDump(text: string): boolean {
  const sample = text.slice(0, 4_000);
  if (!sample.trim()) return false;
  if (sample.includes("%PDF-") && /endobj|endstream|xref/.test(sample)) return true;
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) control += 1;
  }
  if (control / sample.length > 0.08) return true;
  const replacement = (sample.match(/\uFFFD/g) ?? []).length;
  return replacement > 12;
}

export function looksLikeUploadedFilenameStub(text: string): boolean {
  return /^\s*\[Uploaded file:\s*.+\]\s*$/i.test(text.trim());
}

const RESUME_HINTS =
  /\b(experience|education|skills?|resume|curriculum vitae|\bcv\b|professional summary|work history|bachelor|master of|linkedin)\b/i;
const JD_HINTS =
  /\b(job description|responsibilities|requirements|qualifications|we are hiring|about the role|what you.?ll do|preferred qualifications)\b/i;
const UNRELATED_HINTS =
  /\b(invoice|receipt|bank statement|tax return|utility bill|boarding pass|medical record|prescription)\b/i;

export type DocumentQualityKind =
  | "resume"
  | "job_description"
  | "unrelated"
  | "binary"
  | "filename_stub"
  | "thin"
  | "unknown";

export type DocumentQuality = {
  kind: DocumentQualityKind;
  confidence: number;
  warnings: string[];
  showProfile: boolean;
};

export function assessExtractedDocumentQuality(
  text: string | null | undefined,
  expected: "resume" | "job_description" | "unknown" = "unknown",
): DocumentQuality {
  const raw = (text ?? "").trim();
  if (!raw) {
    return { kind: "thin", confidence: 0, warnings: ["No extracted text."], showProfile: false };
  }
  if (looksLikeBinaryDump(raw)) {
    return {
      kind: "binary",
      confidence: 0.95,
      warnings: ["This file looks like raw PDF binary, not readable text."],
      showProfile: false,
    };
  }
  if (looksLikeUploadedFilenameStub(raw)) {
    return {
      kind: "filename_stub",
      confidence: 0.9,
      warnings: ["Only the file name was stored; the document body was not extracted."],
      showProfile: false,
    };
  }
  if (raw.length < 40) {
    return { kind: "thin", confidence: 0.2, warnings: ["Extracted text is too short."], showProfile: false };
  }

  const resumeScore = RESUME_HINTS.test(raw) ? 1 : 0;
  const jdScore = JD_HINTS.test(raw) ? 1 : 0;
  const unrelated = UNRELATED_HINTS.test(raw);

  if (unrelated && resumeScore === 0 && jdScore === 0) {
    return {
      kind: "unrelated",
      confidence: 0.8,
      warnings: ["This document does not look like a resume or job description."],
      showProfile: false,
    };
  }

  if (expected === "resume" && jdScore && !resumeScore) {
    return {
      kind: "job_description",
      confidence: 0.7,
      warnings: ["This file looks like a job description, not a resume."],
      showProfile: false,
    };
  }
  if (expected === "job_description" && resumeScore && !jdScore) {
    return {
      kind: "resume",
      confidence: 0.65,
      warnings: ["This file looks like a resume, not a job description."],
      showProfile: false,
    };
  }

  if (expected === "resume" && resumeScore) {
    return { kind: "resume", confidence: 0.75, warnings: [], showProfile: true };
  }
  if (expected === "job_description" && jdScore) {
    return { kind: "job_description", confidence: 0.75, warnings: [], showProfile: true };
  }
  if (resumeScore) {
    return { kind: "resume", confidence: 0.6, warnings: [], showProfile: expected !== "job_description" };
  }
  if (jdScore) {
    return { kind: "job_description", confidence: 0.6, warnings: [], showProfile: expected !== "resume" };
  }

  if (expected === "resume" && raw.length >= 40 && /\b(engineer|developer|software|manager|intern|designer)\b/i.test(raw)) {
    return { kind: "resume", confidence: 0.45, warnings: [], showProfile: true };
  }

  return {
    kind: "unknown",
    confidence: 0.35,
    warnings: ["Could not confidently classify this document."],
    showProfile: raw.length >= 120 && expected !== "resume",
  };
}

export type { ExtractedJdFields };

const EMPTY_JD_FIELDS: ExtractedJdFields = {
  role: null,
  company: null,
  location: null,
  salary_range: null,
  required_skills: [],
  summary: "",
};

export function extractJdFieldsFromText(text: string): ExtractedJdFields {
  const clipped = text.replace(/\u0000/g, "").trim().slice(0, 50_000);
  const quality = assessExtractedDocumentQuality(clipped, "job_description");
  if (quality.kind === "binary" || quality.kind === "filename_stub" || !clipped) {
    return { ...EMPTY_JD_FIELDS };
  }
  return extractJdFieldsFromTextShared(clipped);
}

/** True when JD body is real extracted text (not stub/binary garbage). */
export function isJdContentReadyForDisplay(content: string | null | undefined): boolean {
  const text = (content ?? "").trim();
  if (!text) return false;
  if (looksLikeUploadedFilenameStub(text)) return false;
  if (looksLikeBinaryDump(text)) return false;
  return true;
}

/**
 * After a client timeout/error on parse-document, keep the row when the edge
 * already wrote ready content — do not clobber with parse_status=error.
 */
export function shouldKeepJdParseSuccess(row: {
  parse_status?: string | null;
  content?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  return row.parse_status === "ready" && isJdContentReadyForDisplay(row.content);
}

export type JdParsedDataShape = {
  required_skills?: string[];
  key_phrases?: string[];
  location?: string | null;
  role?: string | null;
  company?: string | null;
  salary_range?: string | null;
};

/** Merge heuristic fields into existing parsed_data without wiping populated values. */
export function buildHealedJdParsedData(
  content: string,
  existing: JdParsedDataShape | null | undefined,
): { parsed_data: JdParsedDataShape; shouldWrite: boolean } {
  const fields = extractJdFieldsFromText(content);
  const existingSkills = normalizeSkillList(existing?.required_skills);
  const parsed_data: JdParsedDataShape = {
    ...existing,
    required_skills: existingSkills.length > 0 ? existingSkills : fields.required_skills,
    location: existing?.location || fields.location,
    role: existing?.role || fields.role,
    company: existing?.company || fields.company,
    salary_range: existing?.salary_range || fields.salary_range,
  };
  if (existing?.key_phrases) {
    parsed_data.key_phrases = normalizeSkillList(existing.key_phrases);
  }

  const shouldWrite =
    Boolean(fields.location && !existing?.location) ||
    Boolean(fields.salary_range && !existing?.salary_range) ||
    Boolean(fields.required_skills.length > 0 && existingSkills.length === 0) ||
    Boolean(fields.role && !existing?.role) ||
    Boolean(fields.company && !existing?.company);

  return { parsed_data, shouldWrite };
}

/** JDDetail display flags: never hide real body solely because parse_status is error. */
export function getJdDetailParseUi(jd: {
  content?: string | null;
  parse_status?: string | null;
}): { contentReady: boolean; showParseRecovery: boolean } {
  const contentReady = isJdContentReadyForDisplay(jd.content);
  const status = jd.parse_status ?? "";
  const showParseRecovery =
    !contentReady || status === "error" || status === "parsing";
  return { contentReady, showParseRecovery };
}
