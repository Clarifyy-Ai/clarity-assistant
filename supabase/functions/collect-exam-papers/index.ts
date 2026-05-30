/**
 * collect-exam-papers — admin-only scraper for allowlisted official exam portals.
 * Discovers PDF links on public listing pages, extracts MCQs via Gemini, saves to questions bank.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth, errorResponse, successResponse } from "../_shared/utils.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";
import { geminiGenerateWithPdf, parseJSON } from "../_shared/gemini.ts";

const ALLOWED_HOSTS = new Set([
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
const ALLOWED_PDF_HOSTS = new Set<string>([
  ...ALLOWED_HOSTS,
  "cdnbbsr.s3waas.gov.in",
  "cdn3.digialm.com",
  "cdn.digialm.com",
  "documents.upsc.gov.in",
  "static.upsc.gov.in",
  "ibpsonline.ibps.in",
]);


/** Default listing pages per frontend exam id (admin can override with listing_url). */
const DEFAULT_LISTINGS: Record<string, string[]> = {
  JEE_MAIN: ["https://nta.ac.in/Downloads"],
  NEET: ["https://nta.ac.in/Downloads"],
  UPSC: ["https://upsc.gov.in/examinations/previous-question-papers"],
  SSC_CGL: ["https://ssc.nic.in"],
};

const PDF_PROMPT = `
Extract all MCQs from this official exam PDF as JSON only.
Each question: question_text, options A-D, correct_answer (A|B|C|D), explanation, subject, topic, difficulty (EASY|MEDIUM|HARD).
Return: { "questions": [ ... ] }
`.trim();

function sanitizeText(v: unknown, max = 120): string {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, max).trim();
}

function isAllowedHost(raw: string, hosts: Set<string>): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return hosts.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isAllowedListingUrl(raw: string): boolean {
  return isAllowedHost(raw, ALLOWED_HOSTS);
}

function isAllowedPdfUrl(raw: string): boolean {
  return isAllowedHost(raw, ALLOWED_PDF_HOSTS);
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractPdfLinks(html: string, pageUrl: string, year?: number): string[] {
  // Collect every allowlisted PDF on the page, then prefer ones whose URL
  // mentions the requested year. Fall back to all matches if none match the
  // year (handles ranges like "2024-25" that don't include the bare year).
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
  if (!year) return all.slice(0, 5);
  const yearStr = String(year);
  const withYear = all.filter((u) => u.includes(yearStr));
  return (withYear.length > 0 ? withYear : all).slice(0, 5);
}


async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ClarifyAI-ExamCollector/1.0 (+admin)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return await res.text();
}

async function fetchPdfBase64(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ClarifyAI-ExamCollector/1.0 (+admin)" },
  });
  if (!res.ok) throw new Error(`Failed to download PDF: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) throw new Error("PDF exceeds 15MB limit");
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
    }

    const auth = await requireAuth(req);
    await requireAdmin(auth.userId);

    if (!Deno.env.get("GEMINI_API_KEY")?.trim()) {
      return errorResponse(
        "GEMINI_API_KEY not configured on Supabase",
        "CONFIG_ERROR",
        503,
        req
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawExam = sanitizeText(body.exam_type, 64) || "JEE_MAIN";
    const examType = mapExamType(rawExam);
    const year = Number(body.year) || new Date().getFullYear() - 1;
    const listingUrl = sanitizeText(body.listing_url, 500);
    const listings = listingUrl
      ? [listingUrl]
      : DEFAULT_LISTINGS[rawExam.toUpperCase()] ?? [];

    if (listings.length === 0) {
      return errorResponse(
        "No listing URL configured for this exam. Pass listing_url in the request body.",
        "NO_LISTING",
        400,
        req
      );
    }

    const db = createServiceClient();
    const systemUserId = Deno.env.get("SYSTEM_USER_ID") ?? auth.userId;

    const pdfUrls: string[] = [];
    const errors: string[] = [];
    for (const page of listings) {
      if (!isAllowedListingUrl(page)) {
        return errorResponse(`Listing URL not on allowlist: ${page}`, "FORBIDDEN_URL", 403, req);
      }
      try {
        const html = await fetchText(page);
        pdfUrls.push(...extractPdfLinks(html, page, year));
      } catch (err) {
        errors.push(`${page}: ${err instanceof Error ? err.message : "fetch failed"}`);
      }
    }

    const uniquePdfs = [...new Set(pdfUrls)].slice(0, 5);
    if (uniquePdfs.length === 0) {
      return successResponse(
        {
          imported: 0,
          pdfs_found: 0,
          pdfs_processed: 0,
          message:
            errors.length > 0
              ? "Could not fetch any listing pages. See errors[] for details."
              : "No PDF links found on allowlisted pages. Try a different listing_url or year.",
          errors: errors.length ? errors : undefined,
        },
        undefined,
        200,
        req,
      );
    }

    let totalImported = 0;

    const errors: string[] = [];

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
          .map((q) => ({
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
            uploaded_by: systemUserId,
            marks_positive: 4,
            marks_negative: 1,
            latex_present: /[=+\-*/^$\\]/.test(String(q.question_text)),
          }));

        if (rows.length === 0) continue;

        const { error: insertErr } = await db.from("questions").insert(rows);
        if (insertErr) throw new Error(insertErr.message);
        totalImported += rows.length;
      } catch (err) {
        errors.push(`${pdfUrl}: ${err instanceof Error ? err.message : "parse failed"}`);
      }
    }

    return successResponse(
      {
        imported: totalImported,
        pdfs_processed: uniquePdfs.length,
        pdfs_found: uniquePdfs.length,
        exam_type: examType,
        year,
        errors: errors.length ? errors : undefined,
      },
      undefined,
      200,
      req
    );
  } catch (err) {
    console.error("[collect-exam-papers]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("Admin") ? 403 : 500;
    return errorResponse(message, "INTERNAL", status, req);
  }
});
