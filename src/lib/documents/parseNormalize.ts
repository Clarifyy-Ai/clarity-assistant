/**
 * Format-aware document field normalization.
 * Never coerce objects with String() — that yields "[object Object]".
 */

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

export type ExtractedJdFields = {
  role: string | null;
  company: string | null;
  location: string | null;
  required_skills: string[];
  summary: string;
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    const g = m?.[1]?.replace(/\s+/g, " ").trim();
    if (g && g.length >= 2 && g.length <= 180 && !looksLikeUploadedFilenameStub(g)) {
      return g;
    }
  }
  return null;
}

export function extractJdFieldsFromText(text: string): ExtractedJdFields {
  const clipped = text.replace(/\u0000/g, "").trim().slice(0, 50_000);
  const quality = assessExtractedDocumentQuality(clipped, "job_description");
  if (quality.kind === "binary" || quality.kind === "filename_stub" || !clipped) {
    return { role: null, company: null, location: null, required_skills: [], summary: "" };
  }

  const role = firstMatch(clipped, [
    /(?:job\s*title|position|role|title)\s*[:\-–]\s*([^\n]{3,120})/i,
    /we are hiring (?:a[n]? )?([^\n.]{3,80})/i,
  ]);
  const company = firstMatch(clipped, [
    /(?:company|employer|organization)\s*[:\-–]\s*([^\n]{2,120})/i,
    /about\s+([A-Z][A-Za-z0-9&.\- ]{1,60})\b/,
  ]);
  const location = firstMatch(clipped, [
    /(?:location|based in|office)\s*[:\-–]\s*([^\n]{2,80})/i,
  ]);

  const skillsBlock = clipped.match(
    /(?:required skills|key skills|must have|requirements)[:\s]*([\s\S]{20,1200}?)(?:\n\n|responsibilities|qualifications|benefits|$)/i,
  );
  const required_skills = normalizeSkillList(
    (skillsBlock?.[1] ?? "")
      .split(/\n|•|,|;/)
      .map((line) => line.replace(/^[\-\*\d.\s]+/, "").trim())
      .filter(Boolean),
    40,
  );

  return {
    role,
    company,
    location,
    required_skills,
    summary: clipped.slice(0, 400),
  };
}
