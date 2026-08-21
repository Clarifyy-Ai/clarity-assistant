/**
 * Payload validation + PDF extract normalization for admin extract-question-paper.
 * Unit-testable without a real PDF or network.
 */

export const EXTRACT_PARSER_VERSION = "1.0.0";
export const MAX_PDF_BASE64_CHARS = 22_000_000; // ~15MB binary as base64
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

export type ExtractQuestionPaperInput = {
  examId?: unknown;
  stageId?: unknown;
  sourceId?: unknown;
  title?: unknown;
  year?: unknown;
  language?: unknown;
  cycle?: unknown;
  tier?: unknown;
  shift?: unknown;
  licenseClass?: unknown;
  storagePath?: unknown;
  pdfBase64?: unknown;
  textPayload?: unknown;
  /** Structured questions already extracted (skip AI); still is_public=false */
  questions?: unknown;
  createPaper?: unknown;
  requireAllValid?: unknown;
  downloadRemote?: unknown;
  sourceUrl?: unknown;
  documentType?: unknown;
  legacyExamType?: unknown;
};

export type ExtractPayloadValidation =
  | {
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
    }
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

/**
 * Validate extract-question-paper request body (no PDF parsing).
 * Rejects remote download / scrape attempts.
 */
export function validateExtractQuestionPaperPayload(
  raw: unknown,
): ExtractPayloadValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "BAD_REQUEST", message: "Invalid JSON body" };
  }
  const b = raw as ExtractQuestionPaperInput;

  if (b.downloadRemote === true) {
    return {
      ok: false,
      code: "DOWNLOAD_DISABLED",
      message:
        "Remote download is disabled. Provide pdfBase64, storagePath, textPayload, or questions[] from an authorized admin upload.",
    };
  }

  const sourceUrl = sanitizeText(b.sourceUrl, 1000);
  if (sourceUrl) {
    return {
      ok: false,
      code: "SCRAPE_FORBIDDEN",
      message:
        "extract-question-paper does not fetch URLs. Register the link via Sources, then upload PDF/text/storagePath here.",
    };
  }

  const examId = uuidOrNull(b.examId);
  if (!examId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "examId is required" };
  }

  const licenseRaw = sanitizeText(b.licenseClass, 32) || "user_upload";
  if (!isLicenseClass(licenseRaw)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `licenseClass must be one of: ${EXTRACT_LICENSE_CLASSES.join(", ")}`,
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
      message: "PDF base64 exceeds ~15MB limit",
    };
  }

  // Validate the complete payload. Checking only a prefix lets malformed
  // bytes reach the PDF decoder and produces opaque downstream failures.
  if (
    pdfBase64 &&
    (pdfBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(pdfBase64))
  ) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "pdfBase64 must be valid base64",
    };
  }

  if (!pdfBase64 && !storagePath && !textPayload && !hasQuestionsArray) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "Provide pdfBase64, storagePath, textPayload, and/or questions[] (admin-authorized; no scrape).",
    };
  }

  const yearNum = Number(b.year);
  const year =
    Number.isFinite(yearNum) && yearNum >= 1990 && yearNum <= 2100
      ? Math.floor(yearNum)
      : null;

  let mode: "pdf_base64" | "storage_path" | "text_payload" | "structured_questions";
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

/** Convert parse-question-pdf / Gemini OCR shape → ingest JSON options[] strings. */
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

/** Heuristic confidence flags for OCR review UI (no network). */
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
