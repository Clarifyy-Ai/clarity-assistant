/**
 * Allowlisted official-portal PYQ collector shared by collect-exam-papers
 * (admin) and run-daily-exam-scrape (cron).
 */

import { mapExamType } from "./examTypeMap.ts";
import { geminiGenerateWithPdf, parseJSON } from "./gemini.ts";
import { takeUniqueStemRows } from "./questionStemDedupe.ts";
import { createServiceClient } from "./supabase.ts";

type Db = ReturnType<typeof createServiceClient>;

export const ALLOWED_HOSTS = new Set([
  "nta.ac.in",
  "www.nta.ac.in",
  "upsc.gov.in",
  "www.upsc.gov.in",
  "ssc.nic.in",
  "www.ssc.nic.in",
  "ssc.gov.in",
  "www.ssc.gov.in",
  "ibps.in",
  "www.ibps.in",
]);

/**
 * Official paper PDFs are frequently served from government CDN subdomains
 * (e.g. NTA via cdnbbsr.s3waas.gov.in / digialm). We allowlist those for PDF
 * downloads, while still restricting listing-page fetches to ALLOWED_HOSTS.
 */
export const ALLOWED_PDF_HOSTS = new Set<string>([
  ...ALLOWED_HOSTS,
  "cdnbbsr.s3waas.gov.in",
  "cdn3.digialm.com",
  "cdn.digialm.com",
  "documents.upsc.gov.in",
  "static.upsc.gov.in",
  "ibpsonline.ibps.in",
]);

/** Default listing pages per frontend exam id (admin can override with listing_url). */
export const DEFAULT_LISTINGS: Record<string, string[]> = {
  JEE_MAIN: ["https://nta.ac.in/Downloads"],
  NEET: ["https://nta.ac.in/Downloads"],
  UPSC: ["https://upsc.gov.in/examinations/previous-question-papers"],
  SSC_CGL: ["https://ssc.nic.in"],
  IBPS_PO: ["https://www.ibps.in"],
};

export const DAILY_EXAM_TYPES = Object.keys(DEFAULT_LISTINGS);

const PDF_PROMPT = `
Extract all MCQs from this official exam PDF as JSON only.
Each question: question_text, options A-D, correct_answer (A|B|C|D), explanation, subject, topic, difficulty (EASY|MEDIUM|HARD).
Return: { "questions": [ ... ] }
`.trim();

export type CollectExamPapersResult = {
  imported: number;
  pdfs_processed: number;
  pdfs_found: number;
  exam_type: string;
  exam_id: string;
  year: number;
  errors?: string[];
  message?: string;
};

export type CollectExamPapersInput = {
  db: Db;
  examTypeRaw: string;
  year: number;
  listingUrl?: string;
  maxPdfs?: number;
  systemUserId?: string | null;
};

export function sanitizeText(v: unknown, max = 120): string {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, max).trim();
}

import { isRestrictedCoachingDomain } from "./officialDomainAllowlist.ts";

export function isAllowedHost(raw: string, hosts: Set<string>): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const hostname = u.hostname.toLowerCase();
    if (isRestrictedCoachingDomain(hostname)) return false;
    return hosts.has(hostname);
  } catch {
    return false;
  }
}

export function isAllowedListingUrl(raw: string): boolean {
  return isAllowedHost(raw, ALLOWED_HOSTS);
}

export function isAllowedPdfUrl(raw: string): boolean {
  return isAllowedHost(raw, ALLOWED_PDF_HOSTS);
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function extractPdfLinks(html: string, pageUrl: string, year?: number, maxPdfs = 5): string[] {
  const all: string[] = [];
  const re = /href=["']([^"']+\.pdf[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const resolved = resolveUrl(m[1], pageUrl);
    if (!resolved || !isAllowedPdfUrl(resolved)) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    all.push(resolved);
  }
  if (!year) return all.slice(0, maxPdfs);
  const yearStr = String(year);
  const withYear = all.filter((u) => u.includes(yearStr));
  return (withYear.length > 0 ? withYear : all).slice(0, maxPdfs);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "CareerPilot-ExamCollector/1.0 (+admin)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return await res.text();
}

async function fetchPdfBase64(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "CareerPilot-ExamCollector/1.0 (+admin)" },
  });
  if (!res.ok) throw new Error(`Failed to download PDF: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) throw new Error("PDF exceeds 15MB limit");
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function collectExamPapers(
  input: CollectExamPapersInput,
): Promise<CollectExamPapersResult> {
  const examId = sanitizeText(input.examTypeRaw, 64).toUpperCase() || "JEE_MAIN";
  const examType = mapExamType(examId);
  const year = input.year;
  const maxPdfs = Math.min(Math.max(input.maxPdfs ?? 5, 1), 5);
  const listingUrl = input.listingUrl ? sanitizeText(input.listingUrl, 500) : "";
  const listings = listingUrl
    ? [listingUrl]
    : DEFAULT_LISTINGS[examId] ?? [];

  if (listings.length === 0) {
    return {
      imported: 0,
      pdfs_processed: 0,
      pdfs_found: 0,
      exam_type: examType,
      exam_id: examId,
      year,
      errors: [
        "No listing URL configured for this exam. Pass listing_url in the request body.",
      ],
      message: "NO_LISTING",
    };
  }

  const pdfUrls: string[] = [];
  const errors: string[] = [];
  for (const page of listings) {
    if (!isAllowedListingUrl(page)) {
      return {
        imported: 0,
        pdfs_processed: 0,
        pdfs_found: 0,
        exam_type: examType,
        exam_id: examId,
        year,
        errors: [`Listing URL not on allowlist: ${page}`],
        message: "FORBIDDEN_URL",
      };
    }
    try {
      const html = await fetchText(page);
      pdfUrls.push(...extractPdfLinks(html, page, year, maxPdfs));
    } catch (err) {
      errors.push(`${page}: ${err instanceof Error ? err.message : "fetch failed"}`);
    }
  }

  const uniquePdfs = [...new Set(pdfUrls)].slice(0, maxPdfs);
  if (uniquePdfs.length === 0) {
    return {
      imported: 0,
      pdfs_found: 0,
      pdfs_processed: 0,
      exam_type: examType,
      exam_id: examId,
      year,
      errors: errors.length ? errors : undefined,
      message:
        errors.length > 0
          ? "Could not fetch any listing pages. See errors[] for details."
          : "No PDF links found on allowlisted pages. Try a different listing_url or year.",
    };
  }

  let totalImported = 0;
  const systemUserId = input.systemUserId?.trim() || null;

  for (const pdfUrl of uniquePdfs) {
    try {
      const base64 = await fetchPdfBase64(pdfUrl);
      const raw = await geminiGenerateWithPdf(PDF_PROMPT, base64, {
        temperature: 0.2,
        maxTokens: 4096,
      });
      const parsed = parseJSON<{ questions?: Record<string, unknown>[] }>(raw, { questions: [] });
      const qs = Array.isArray(parsed.questions) ? parsed.questions : [];

      const rows = qs
        .filter((q) => typeof q.question_text === "string" && String(q.question_text).length > 10)
        .map((q) => {
          const row: Record<string, unknown> = {
            question_text: String(q.question_text).slice(0, 2000),
            question_type: "MCQ",
            options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
            correct_answer: ["A", "B", "C", "D"].includes(String(q.correct_answer))
              ? String(q.correct_answer)
              : "A",
            explanation: q.explanation ? String(q.explanation).slice(0, 2000) : "",
            subject: q.subject ? String(q.subject).slice(0, 120) : "General",
            topic: q.topic ? String(q.topic).slice(0, 120) : "PYQ",
            difficulty: ["EASY", "MEDIUM", "HARD"].includes(String(q.difficulty).toUpperCase())
              ? String(q.difficulty).toUpperCase()
              : "MEDIUM",
            exam_type: examType,
            source: "OFFICIAL_PYP",
            source_year: year,
            is_verified: true,
            is_public: true,
            marks_positive: 4,
            marks_negative: 1,
            latex_present: /[=+\-*/^$\\]/.test(String(q.question_text)),
          };
          if (systemUserId) row.uploaded_by = systemUserId;
          return row as { question_text: string } & Record<string, unknown>;
        });

      if (rows.length === 0) continue;

      const { data: existingPublic } = await input.db
        .from("questions")
        .select("question_text")
        .eq("exam_type", examType)
        .eq("is_public", true)
        .limit(4000);
      const { novel, skipped } = takeUniqueStemRows(
        rows,
        (existingPublic ?? []).map((r) => String((r as { question_text?: string }).question_text ?? "")),
      );
      if (skipped > 0) {
        errors.push(`${pdfUrl}: skipped ${skipped} duplicate stem(s)`);
      }
      if (novel.length === 0) continue;

      const { error: insertErr } = await input.db.from("questions").insert(novel);
      if (insertErr) throw new Error(insertErr.message);
      totalImported += novel.length;
    } catch (err) {
      errors.push(`${pdfUrl}: ${err instanceof Error ? err.message : "parse failed"}`);
    }
  }

  return {
    imported: totalImported,
    pdfs_processed: uniquePdfs.length,
    pdfs_found: uniquePdfs.length,
    exam_type: examType,
    exam_id: examId,
    year,
    errors: errors.length ? errors : undefined,
  };
}
