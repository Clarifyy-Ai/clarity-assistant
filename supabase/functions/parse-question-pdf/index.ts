import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth, getAdminClient, errorResponse, successResponse, deductCredits } from "../_shared/utils.ts";

const CREDIT_COST = 5;
const MAX_BASE64_CHARS = 15 * 1024 * 1024; // ~11 MB decoded

interface ParsedQuestion {
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING";
  options: Array<{ label: string; text: string }> | null;
  correct_answer: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks_positive: number;
  marks_negative: number;
  source_year: number | null;
  exam_type: string | null;
  latex_present: boolean;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a question paper parser. Extract all questions and answers from the provided PDF document.

For each question return a JSON object with EXACTLY these fields:
{
  "question_text": string,
  "question_type": "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING",
  "options": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}] | null,
  "correct_answer": string,
  "explanation": string,
  "subject": string,
  "topic": string,
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "marks_positive": number,
  "marks_negative": number,
  "source_year": number | null,
  "exam_type": string | null,
  "latex_present": boolean
}

Rules:
- question_type: Use MCQ for multiple choice, TRUE_FALSE for true/false, NUMERICAL for fill-in-the-number, CODING for programming, SHORT_ANSWER for everything else
- options: Only for MCQ — exactly 4 options with labels A, B, C, D. Null for all other types.
- correct_answer: For MCQ use the option letter (A/B/C/D). For others, the full answer text.
- explanation: Always provide a clear explanation of why the answer is correct.
- subject: Auto-detect from content — Physics, Chemistry, Mathematics, Biology, History, Geography, Economics, General Knowledge, Reasoning, English, etc.
- topic: Specific subtopic within the subject (e.g., "Newton's Laws", "Organic Chemistry", "Trigonometry")
- difficulty: EASY for basic recall, MEDIUM for application, HARD for analysis/synthesis
- marks_positive: Default 4 for JEE/NEET, 2 for SSC/UPSC, 1 for others. Adjust if you can detect the exam type.
- marks_negative: Default 1 for JEE/NEET, 0.5 for SSC, 0 for others.
- source_year: The year of the exam paper if detectable from the document, otherwise null.
- exam_type: Detected exam type — JEE_MAIN, JEE_ADVANCED, NEET, UPSC, SSC_CGL, SSC_CHSL, IBPS_PO, SBI_PO, RRB_NTPC, NDA, CDS, or null if unknown.
- latex_present: true if the question contains mathematical symbols or equations.

If a question is unclear, incomplete, or cannot be parsed, skip it entirely.
Return ONLY a valid JSON array of question objects. No prose, no markdown code fences, no explanation outside the JSON.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function extractPdfBase64(req: Request): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("pdf");
      if (file instanceof File) {
        const buffer = await file.arrayBuffer();
        return arrayBufferToBase64(buffer);
      }
      return null;
    } catch { return null; }
  }

  if (contentType.includes("application/json") || contentType === "") {
    try {
      const body = await req.json();
      if (typeof body?.pdf_base64 === "string") return body.pdf_base64;
      return null;
    } catch { return null; }
  }

  return null;
}

// ★ FIX: standalone refund function — uses atomic RPC, no race condition
async function refundCredits(userId: string, amount: number, reason: string): Promise<void> {
  try {
    const admin = getAdminClient();
    // Use atomic RPC instead of read-modify-write
    const { error } = await admin.rpc("increment_credits", {
      user_id: userId,
      amount,
    });
    if (error) {
      console.error(`[parse-question-pdf] Credit refund RPC failed (${reason}):`, error.message);
    }
  } catch (err) {
    console.error(`[parse-question-pdf] Credit refund threw (${reason}):`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    const { userId, credits } = auth;

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return errorResponse("AI service not configured on server.", "AI_NOT_CONFIGURED", 503);
    }

    const pdfBase64 = await extractPdfBase64(req);
    if (!pdfBase64 || pdfBase64.length < 100) {
      return errorResponse(
        "No valid PDF received. POST a multipart/form-data request with a 'pdf' file field, or JSON with pdf_base64.",
        "INVALID_PDF",
        400
      );
    }

    // ★ NEW: file size guard — before credit deduction
    if (pdfBase64.length > MAX_BASE64_CHARS) {
      return errorResponse("PDF too large. Maximum size is ~10 MB.", "FILE_TOO_LARGE", 413);
    }

    if (credits < CREDIT_COST && credits !== -1) {
      return errorResponse(
        `Insufficient credits. PDF parsing costs ${CREDIT_COST} credits.`,
        "INSUFFICIENT_CREDITS",
        402
      );
    }

    let creditDeducted = false;
    if (credits !== -1) {
      const deduction = await deductCredits(userId, "resume_analysis", CREDIT_COST);
      if (!deduction.success) {
        return errorResponse("Failed to deduct credits. Please try again.", "CREDIT_ERROR", 500);
      }
      creditDeducted = true;
    }

    // ★ FIX: initialize to null so TypeScript doesn't complain about uninitialized use
    let anthropicRes: Response | null = null;

    const anthropicController = new AbortController();
    const anthropicTimeout = setTimeout(() => anthropicController.abort(), 50_000);

    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        signal: anthropicController.signal,
        body: JSON.stringify({
          model:      "claude-3-5-sonnet-20241022",
          max_tokens: 8192,
          system:     EXTRACTION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type:   "document",
                  source: {
                    type:       "base64",
                    media_type: "application/pdf",
                    data:       pdfBase64,
                  },
                },
                {
                  type: "text",
                  text: "Extract all questions from this document and return them as a JSON array.",
                },
              ],
            },
          ],
        }),
      });
    } catch (fetchErr) {
      clearTimeout(anthropicTimeout);
      if (creditDeducted) await refundCredits(userId, CREDIT_COST, "fetch_throw");
      return errorResponse("AI request failed (network or timeout).", "AI_TIMEOUT", 504);
    } finally {
      clearTimeout(anthropicTimeout);
    }

    // ★ FIX: null check included
    if (!anthropicRes || !anthropicRes.ok) {
      const errBody = await anthropicRes?.json().catch(() => ({})) ?? {};
      const msg = (errBody as Record<string, unknown>)?.error?.["message"] ?? "Unknown AI error";
      if (creditDeducted) await refundCredits(userId, CREDIT_COST, "ai_error");
      return errorResponse(`AI parsing failed: ${msg}`, "AI_ERROR", 502);
    }

    const anthropicJson = await anthropicRes.json() as Record<string, unknown>;
    const rawText = ((anthropicJson.content as Record<string, unknown>[])?.[0]?.text as string) ?? "";

    let questions: ParsedQuestion[] = [];
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      questions = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
    } catch (parseErr) {
      if (creditDeducted) await refundCredits(userId, CREDIT_COST, "parse_error");
      return errorResponse("Failed to parse AI response as JSON.", "PARSE_ERROR", 502);
    }

    // ★ FIX: check trimmed length, not just truthiness
    const sanitized = questions
      .filter((q) =>
        q.question_text?.trim().length > 0 &&
        q.correct_answer?.trim().length > 0 &&
        q.subject?.trim().length > 0 &&
        q.topic?.trim().length > 0
      )
      .map((q): ParsedQuestion => {
        const qType = ["MCQ","TRUE_FALSE","SHORT_ANSWER","NUMERICAL","CODING"].includes(q.question_type)
          ? q.question_type : "MCQ";

        let options: ParsedQuestion["options"] = null;
        if (qType === "MCQ") {
          const rawOpts = Array.isArray(q.options) ? q.options : [];
          const normalized = rawOpts
            .filter((o) => o && typeof o.label === "string" && typeof o.text === "string")
            .map((o) => ({ label: String(o.label).trim(), text: String(o.text).trim() }));
          options = normalized.length >= 2
            ? normalized.slice(0, 4)
            : [
                { label: "A", text: "" },
                { label: "B", text: "" },
                { label: "C", text: "" },
                { label: "D", text: "" },
              ];
        }

        return {
          question_text:  String(q.question_text).trim(),
          question_type:  qType,
          options,
          correct_answer: String(q.correct_answer).trim(),
          explanation:    String(q.explanation ?? "").trim(),
          subject:        String(q.subject).trim(),
          topic:          String(q.topic).trim(),
          difficulty:     ["EASY","MEDIUM","HARD"].includes(q.difficulty) ? q.difficulty : "MEDIUM",
          marks_positive: typeof q.marks_positive === "number" ? q.marks_positive : 4,
          marks_negative: typeof q.marks_negative === "number" ? q.marks_negative : 1,
          source_year:    typeof q.source_year === "number" ? q.source_year : null,
          exam_type:      q.exam_type ? String(q.exam_type) : null,
          latex_present:  Boolean(q.latex_present),
        };
      });

    const subjectCounts: Record<string, number> = {};
    for (const q of sanitized) {
      subjectCounts[q.subject] = (subjectCounts[q.subject] ?? 0) + 1;
    }
    const summaryParts = Object.entries(subjectCounts)
      .map(([s, c]) => `${c} ${s}`)
      .join(", ");
    const summary = `${sanitized.length} questions imported${summaryParts ? ` — ${summaryParts}` : ""}`;

    return successResponse({ questions: sanitized, count: sanitized.length, summary });

  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[parse-question-pdf] Unhandled error:", message);
    return errorResponse(message, "INTERNAL_ERROR", 500);
  }
});
