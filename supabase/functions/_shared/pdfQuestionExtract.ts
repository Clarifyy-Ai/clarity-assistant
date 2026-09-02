/**
 * Shared PDF / OCR extract helpers for parse-question-pdf + extract-question-paper.
 * Keep in sync with src/lib/gov-exam/extractQuestionPaper.ts for payload rules.
 */

export const EXTRACT_PARSER_VERSION = "1.1.0";
export const MAX_PDF_BASE64_CHARS = 22_000_000;
export const MAX_TEXT_PAYLOAD_CHARS = 200_000;
export const MAX_STORAGE_PATH_LEN = 500;

export const EXTRACT_LICENSE_CLASSES = [
  "official_public",
  "licensed",
  "user_upload",
  "institution",
  "ai_generated",
  "unknown",
] as const;

export type ExtractPayloadOk = {
  ok: true;
  examId: string;
  stageId: string | null;
  sourceId: string | null;
  title: string;
  year: number | null;
  language: string;
  cycle: string | null;
  tier: string | null;
  shift: string | null;
  licenseClass: (typeof EXTRACT_LICENSE_CLASSES)[number];
  storagePath: string | null;
  pdfBase64: string | null;
  textPayload: string | null;
  hasQuestionsArray: boolean;
  createPaper: boolean;
  requireAllValid: boolean;
  documentType: string;
  legacyExamType: string | null;
  mode: "pdf_base64" | "storage_path" | "text_payload" | "structured_questions";
};

export type ExtractPayloadResult =
  | ExtractPayloadOk
  | { ok: false; code: string; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function sanitizeText(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max)
    .trim();
}

function isLicenseClass(
  v: string,
): v is (typeof EXTRACT_LICENSE_CLASSES)[number] {
  return (EXTRACT_LICENSE_CLASSES as readonly string[]).includes(v);
}

export function validateExtractQuestionPaperPayload(
  raw: unknown,
): ExtractPayloadResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "BAD_REQUEST", message: "Invalid JSON body" };
  }
  const b = raw as Record<string, unknown>;

  if (b.downloadRemote === true) {
    return {
      ok: false,
      code: "DOWNLOAD_DISABLED",
      message:
        "Remote download is disabled. Upload a PDF, paste OCR/plain text, enter a storage path, or provide structured questions from an authorized admin upload.",
    };
  }

  const sourceUrl = sanitizeText(b.sourceUrl, 1000);
  if (sourceUrl) {
    return {
      ok: false,
      code: "SCRAPE_FORBIDDEN",
      message:
        "URL fetch is not supported here. Register the official link under Gov Sources, then upload the PDF, paste text, or enter a storage path on this page.",
    };
  }

  const examId = uuidOrNull(b.examId);
  if (!examId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Select an exam before extracting." };
  }

  const licenseRaw = sanitizeText(b.licenseClass, 32) || "user_upload";
  if (!isLicenseClass(licenseRaw)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `License class must be one of: ${EXTRACT_LICENSE_CLASSES.join(", ")}`,
    };
  }

  const storagePath = sanitizeText(b.storagePath, MAX_STORAGE_PATH_LEN) || null;
  const pdfBase64 =
    typeof b.pdfBase64 === "string" && b.pdfBase64.trim()
      ? b.pdfBase64.replace(/\s/g, "")
      : null;
  const textPayload =
    typeof b.textPayload === "string"
      ? b.textPayload.slice(0, MAX_TEXT_PAYLOAD_CHARS)
      : null;
  const hasQuestionsArray = Array.isArray(b.questions);

  if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return {
      ok: false,
      code: "PDF_TOO_LARGE",
      message: "PDF exceeds the ~15MB upload limit. Use a smaller file or paste OCR text instead.",
    };
  }

  if (pdfBase64 && !/^[A-Za-z0-9+/]+=*$/.test(pdfBase64.slice(0, 64))) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "The uploaded PDF could not be encoded. Try re-selecting the file.",
    };
  }

  if (!pdfBase64 && !storagePath && !textPayload && !hasQuestionsArray) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "Provide at least one source: upload a PDF, paste OCR/plain text, enter a storage path, or supply structured questions. Scraping is not supported.",
    };
  }

  const yearNum = Number(b.year);
  const year =
    Number.isFinite(yearNum) && yearNum >= 1990 && yearNum <= 2100
      ? Math.floor(yearNum)
      : null;

  let mode: ExtractPayloadOk["mode"];
  if (hasQuestionsArray) mode = "structured_questions";
  else if (pdfBase64) mode = "pdf_base64";
  else if (storagePath) mode = "storage_path";
  else mode = "text_payload";

  return {
    ok: true,
    examId,
    stageId: uuidOrNull(b.stageId),
    sourceId: uuidOrNull(b.sourceId),
    title: sanitizeText(b.title, 300) || "Previous-year paper extract",
    year,
    language: sanitizeText(b.language, 8) || "en",
    cycle: sanitizeText(b.cycle, 64) || null,
    tier: sanitizeText(b.tier, 64) || null,
    shift: sanitizeText(b.shift, 64) || null,
    licenseClass: licenseRaw,
    storagePath,
    pdfBase64,
    textPayload,
    hasQuestionsArray,
    createPaper: b.createPaper !== false,
    requireAllValid: b.requireAllValid === true,
    documentType: sanitizeText(b.documentType, 64) || "previous_paper",
    legacyExamType: sanitizeText(b.legacyExamType, 64) || null,
    mode,
  };
}

export function normalizePdfExtractedQuestions(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== "object") return item;
    const q = item as Record<string, unknown>;
    const optionsRaw = Array.isArray(q.options) ? q.options : [];
    const options = optionsRaw.map((o) => {
      if (typeof o === "string") return o;
      if (o && typeof o === "object" && "text" in o) {
        return String((o as { text?: unknown }).text ?? "");
      }
      return String(o ?? "");
    });
    return {
      question_text: String(q.question_text ?? ""),
      options,
      correct_answer: q.correct_answer,
      correct_index: q.correct_index,
      explanation: q.explanation,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      section_code: q.section_code,
      page_ref: q.page_ref,
    };
  });
}

export type ConfidenceFlag = {
  index: number;
  flags: string[];
  score: number;
};

export function buildOcrConfidenceFlags(questions: unknown[]): ConfidenceFlag[] {
  return questions.map((item, index) => {
    const flags: string[] = [];
    let score = 1;
    if (!item || typeof item !== "object") {
      return { index, flags: ["invalid_item"], score: 0 };
    }
    const q = item as Record<string, unknown>;
    const text = String(q.question_text ?? "");
    const options = Array.isArray(q.options) ? q.options : [];

    if (text.length < 12) {
      flags.push("short_stem");
      score -= 0.25;
    }
    if (/�|\uFFFD|\[illegible\]|\?\?\?/i.test(text)) {
      flags.push("ocr_garbage");
      score -= 0.35;
    }
    if (options.length !== 4) {
      flags.push("option_count");
      score -= 0.3;
    }
    const optTexts = options.map((o) => {
      if (typeof o === "string") return o;
      if (o && typeof o === "object" && "text" in o) {
        return String((o as { text?: unknown }).text ?? "");
      }
      return "";
    });
    if (optTexts.some((t) => t.trim().length === 0)) {
      flags.push("empty_option");
      score -= 0.25;
    }
    if (new Set(optTexts.map((t) => t.trim().toLowerCase())).size < optTexts.length) {
      flags.push("duplicate_options");
      score -= 0.2;
    }
    if (!q.correct_answer && !Number.isInteger(q.correct_index)) {
      flags.push("missing_answer");
      score -= 0.4;
    }
    if (Number.isInteger(q.correct_index) && q.correct_answer) {
      const letter = String(q.correct_answer).trim().toUpperCase();
      const fromIndex = String.fromCharCode(65 + Number(q.correct_index));
      if (letter.length === 1 && letter !== fromIndex) {
        flags.push("conflicting_answer");
        score -= 0.4;
      }
    }
    if (!q.subject && !q.topic) {
      flags.push("missing_taxonomy");
      score -= 0.05;
    }

    return {
      index,
      flags,
      score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
    };
  });
}

export type AnswerKeyStatus = "mapped" | "needs_review" | "none";

/** Classify answer-key mapping. Never guess: uncertain maps flag for review. */
export function classifyAnswerKeyStatus(input: {
  raw: unknown[];
  acceptedCount: number;
  rejected: Array<{ code?: string }>;
  confidence: ConfidenceFlag[];
}): AnswerKeyStatus {
  const conflicting = input.confidence.some((c) => c.flags.includes("conflicting_answer"))
    || input.raw.some((item) => {
      if (!item || typeof item !== "object") return false;
      const q = item as Record<string, unknown>;
      if (!Number.isInteger(q.correct_index) || q.correct_answer == null || q.correct_answer === "") {
        return false;
      }
      const letter = String(q.correct_answer).trim().toUpperCase();
      const fromIndex = String.fromCharCode(65 + Number(q.correct_index));
      return letter.length === 1 && letter !== fromIndex;
    });
  const missing = input.confidence.some((c) => c.flags.includes("missing_answer"));
  const answerRejected = input.rejected.some((r) => r.code === "ANSWER_VERIFICATION_FAILED");
  if (conflicting || missing || answerRejected) return "needs_review";
  if (input.acceptedCount > 0) return "mapped";
  return "none";
}

export const PDF_QUESTION_EXTRACT_PROMPT = `
You are an expert exam question extractor. Read this PDF of exam questions and
extract every MCQ you find as structured JSON.

Rules:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Each question must have exactly 4 options labelled A, B, C, D.
- correct_answer must be one of "A", "B", "C", "D".
- Preserve mathematical notation using LaTeX in question_text and option text.
- Skip any item that is not a valid MCQ with 4 options.
- difficulty must be one of "EASY", "MEDIUM", "HARD".
- If text is unclear from OCR, still extract best-effort but keep options distinct.
- Never invent image URLs, placeholder hosts, or the caption "Reference Image".
- Describe diagrams in LaTeX inside question_text instead of a fake image.

Schema:
{
  "questions": [
    {
      "question_text": "string",
      "options": [
        {"label": "A", "text": "string"},
        {"label": "B", "text": "string"},
        {"label": "C", "text": "string"},
        {"label": "D", "text": "string"}
      ],
      "correct_answer": "A",
      "explanation": "string",
      "subject": "string",
      "topic": "string",
      "difficulty": "MEDIUM",
      "marks_positive": 4,
      "marks_negative": 1,
      "latex_present": false
    }
  ],
  "raw_ocr_notes": "optional short notes about OCR quality"
}
`.trim();

/**
 * Deterministic MCQ parser for pasted OCR / plain text.
 * Supports Q1. / 1. / 1) stems and A) A. (A) (a) options.
 */
const MCQ_OPTION_LINE = /^[\(\[]?([A-Da-d])[\)\].:\-]\s*(.+)$/;
const MCQ_ANSWER_LINE =
  /^(?:answer|ans|correct(?:\s*option)?)\s*[:\-]\s*[\(\[]?([A-Da-d])(?:[\)\]]|\b)/i;
const MCQ_STEM_PREFIX = /^(?:Q(?:uestion)?\s*)?\d+[.)]\s*/i;

function parseOnePlainTextMcq(block: string): Record<string, unknown> | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const firstOpt = lines.findIndex((line) => MCQ_OPTION_LINE.test(line));
  if (firstOpt < 1) return null;

  const stem = lines
    .slice(0, firstOpt)
    .join(" ")
    .replace(MCQ_STEM_PREFIX, "")
    .trim();
  if (stem.length < 8) return null;

  const optionMap: Record<string, string> = {};
  let answerLetter: string | null = null;
  for (const line of lines.slice(firstOpt)) {
    const opt = line.match(MCQ_OPTION_LINE);
    if (opt) {
      optionMap[opt[1].toUpperCase()] = opt[2].trim();
      continue;
    }
    const ans = line.match(MCQ_ANSWER_LINE);
    if (ans) answerLetter = ans[1].toUpperCase();
  }

  const options = ["A", "B", "C", "D"].map((k) => optionMap[k] || "");
  if (options.filter((o) => o.length > 0).length < 4) return null;

  return {
    question_text: stem,
    options,
    correct_answer: answerLetter ?? "",
    explanation: "",
    subject: "General",
    topic: "Extracted",
    difficulty: "MEDIUM",
  };
}

export function parsePlainTextMcqs(text: string): unknown[] {
  const cleaned = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!cleaned) return [];

  const blocks = cleaned.split(/\n(?=(?:Q(?:uestion)?\s*)?\d+[.)]\s)/i);
  const out: unknown[] = [];
  for (const block of blocks) {
    const parsed = parseOnePlainTextMcq(block);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** True when base64 decodes to a %PDF header (validate before charging credits). */
export function isPdfMagicBase64(b64: string): boolean {
  const compact = String(b64 || "").replace(/\s/g, "");
  if (compact.length < 8) return false;
  try {
    const head = atob(compact.slice(0, 24));
    return head.startsWith("%PDF");
  } catch {
    return false;
  }
}

/** Python document_extract returns `extracted_text` — not `full_text`. */
export function pythonDocumentExtractText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const rec = data as Record<string, unknown>;
  const nested =
    rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)
      ? (rec.data as Record<string, unknown>)
      : rec;
  const candidates = [
    nested.extracted_text,
    nested.full_text,
    nested.text,
    rec.extracted_text,
    rec.full_text,
    rec.text,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

export function pythonExtractLooksScanned(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  const nested =
    rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)
      ? (rec.data as Record<string, unknown>)
      : rec;
  const warnings = Array.isArray(nested.warnings) ? nested.warnings : rec.warnings;
  const joined = Array.isArray(warnings)
    ? warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))).join(" ")
    : "";
  const text = pythonDocumentExtractText(data);
  return (
    (!text || text.trim().length < 20) &&
    /NO_TEXT_EXTRACTED|OCR_UNAVAILABLE|OCR_FAILED|LOW_OCR/i.test(joined)
  );
}

export type PdfImportFailureCode =
  | "INVALID_PDF"
  | "PDF_TOO_LARGE"
  | "EMPTY_PDF"
  | "SCANNED_PDF"
  | "ZERO_QUESTIONS"
  | "PARSER_TIMEOUT"
  | "AI_ERROR";

export function userMessageForPdfImportFailure(
  code: PdfImportFailureCode,
  refunded: boolean,
): string {
  const refund = refunded ? " Credits refunded." : "";
  switch (code) {
    case "INVALID_PDF":
      return "This file is not a valid PDF. Choose a .pdf file that starts with a PDF header.";
    case "PDF_TOO_LARGE":
      return "PDF exceeds the 15 MB upload limit. Split the paper or paste the questions as text.";
    case "EMPTY_PDF":
      return "This PDF is empty.";
    case "SCANNED_PDF":
      return `This looks like a scanned/image PDF with no selectable text. Use a text-based PDF or paste OCR text.${refund}`;
    case "ZERO_QUESTIONS":
      return `No MCQ questions (options A–D) were found in this PDF.${refund} Try another paper or paste the questions as text.`;
    case "PARSER_TIMEOUT":
      return `PDF parsing timed out.${refund} Retry with a smaller file.`;
    default:
      return `PDF parsing failed.${refund}`;
  }
}

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
