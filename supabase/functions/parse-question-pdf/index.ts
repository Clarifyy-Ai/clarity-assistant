// parse-question-pdf/index.ts

import { corsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  getAdminClient,
  errorResponse,
  successResponse,
  deductCredits,
} from "../_shared/utils.ts";

const CREDIT_COST = 5;
const MAX_BASE64 = 15 * 1024 * 1024; // ~11MB base64 (~8.2MB pdf)

// ---------------- TYPES --------------------

interface ParsedQuestion {
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING";
  options: { label: string; text: string }[] | null;
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

const EXTRACTION_SYSTEM_PROMPT = `
You are a question paper parser. Extract all questions and answers from the provided PDF document.

Return ONLY a JSON array.

Each object must contain EXACTLY:

{
  "question_text": string,
  "question_type": "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING",
  "options": [{"label":"A","text":""}, ...] | null,
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
- MCQ must have exactly 4 options A–D.
- correct_answer must be A/B/C/D for MCQ.
- explanation must always explain the answer.
- If unclear or incomplete → skip.
- No text outside JSON. No markdown. No code fences.
`;

// ---------------- HELPERS --------------------

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

async function extractPdfBase64(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("pdf");
    if (file instanceof File) return toBase64(await file.arrayBuffer());
    return null;
  }

  if (ct.includes("application/json") || ct === "") {
    try {
      const body = await req.json();
      return typeof body?.pdf_base64 === "string" ? body.pdf_base64 : null;
    } catch {
      return null;
    }
  }

  return null;
}

// --- ATOMIC REFUND ---
async function refundCredits(userId: string, amount: number, reason: string) {
  try {
    const admin = getAdminClient();
    const { error } = await admin.rpc("add_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_action: "refund",
      p_description: `PDF parse refund: ${reason}`,
    });
    if (error) console.error("Refund RPC failed:", error);
  } catch (err) {
    console.error("Refund exception:", err);
  }
}

// ------------------ MAIN ---------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireAuth(req);
    const { userId, credits } = auth;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey)
      return errorResponse("AI service not configured.", "AI_NOT_CONFIGURED", 503);

    const pdfB64 = await extractPdfBase64(req);
    if (!pdfB64 || pdfB64.length < 100)
      return errorResponse(
        "No valid PDF received. Provide multipart/form-data 'pdf' or JSON 'pdf_base64'.",
        "INVALID_PDF",
        400
      );

    if (pdfB64.length > MAX_BASE64)
      return errorResponse("PDF too large. Max size ~10MB.", "FILE_TOO_LARGE", 413);

    if (credits !== -1 && credits < CREDIT_COST)
      return errorResponse(
        `Insufficient credits. This requires ${CREDIT_COST} credits.`,
        "INSUFFICIENT_CREDITS",
        403
      );

    // --- Deduct credits ---
    let charged = false;
    if (credits !== -1) {
      const r = await deductCredits(userId, "parse_question_pdf", CREDIT_COST);
      if (!r.success)
        return errorResponse("Credit deduction failed.", "CREDIT_ERROR", 500);
      charged = true;
    }

    // --- Claude request ---
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 30_000);

    let aiRes: Response;
    try {
      aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 8192,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: pdfB64,
                  },
                },
                { type: "text", text: "Extract all questions into JSON array." },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      clearTimeout(timeout);
      if (charged) await refundCredits(userId, CREDIT_COST, "timeout");
      return errorResponse("AI request failed (timeout/network).", "AI_TIMEOUT", 504);
    }

    clearTimeout(timeout);

    if (!aiRes.ok) {
      if (charged) await refundCredits(userId, CREDIT_COST, "ai_error");
      const errBody = await aiRes.json().catch(() => ({}));
      return errorResponse(
        `AI error: ${errBody?.error?.message ?? "Unknown AI error"}`,
        "AI_ERROR",
        502
      );
    }

    const aiJson = await aiRes.json();
    const content = Array.isArray(aiJson.content) ? aiJson.content : [];
    const firstText = content.find((x: any) => x.type === "text");
    const rawText = firstText?.text ?? "";

    // --- Clean JSON ---
    const cleaned = rawText
      .replace(/```json|```/g, "")
      .replace(/^[^\[{]*/g, "") // strip leading junk
      .replace(/[^\]}]*$/g, "") // strip trailing junk
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      if (charged) await refundCredits(userId, CREDIT_COST, "json_parse");
      return errorResponse("Failed to parse AI JSON.", "PARSE_ERROR", 502);
    }

    const items: ParsedQuestion[] = Array.isArray(parsed)
      ? parsed
      : parsed?.questions ?? [];

    if (!items.length) {
      if (charged) await refundCredits(userId, CREDIT_COST, "zero_questions");
      return errorResponse(
        "No valid questions detected in the PDF.",
        "NO_QUESTIONS",
        422
      );
    }

    // --- Normalize Output ---
    const out: ParsedQuestion[] = items.map((q) => {
      const qText = String(q.question_text ?? "").trim();
      const subject = String(q.subject ?? "").trim();
      const topic = String(q.topic ?? "").trim();
      const qType =
        ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "NUMERICAL", "CODING"].includes(
          q.question_type
        ) ? q.question_type : "MCQ";

      // MCQ options fixing
      let opts = null;
      if (qType === "MCQ") {
        const rawOpts = Array.isArray(q.options) ? q.options : [];
        const normalized = rawOpts.map((o: any) => ({
          label: String(o.label ?? "").trim().toUpperCase(),
          text: String(o.text ?? "").trim(),
        }));

        const labels = ["A", "B", "C", "D"];
        opts = labels.map((L) => {
          const found = normalized.find((x) => x.label === L);
          return found ?? { label: L, text: "" };
        });
      }

      const correct = String(q.correct_answer ?? "")
        .replace(/[^A-D]/gi, "")
        .toUpperCase();

      return {
        question_text: qText,
        question_type: qType,
        options: opts,
        correct_answer: qType === "MCQ" ? correct : String(q.correct_answer ?? ""),
        explanation: String(q.explanation ?? "").trim(),
        subject,
        topic,
        difficulty: ["EASY", "MEDIUM", "HARD"].includes(q.difficulty)
          ? q.difficulty
          : "MEDIUM",
        marks_positive: Number(q.marks_positive ?? 4),
        marks_negative: Number(q.marks_negative ?? 1),
        source_year: typeof q.source_year === "number" ? q.source_year : null,
        exam_type: q.exam_type ? String(q.exam_type) : null,
        latex_present: Boolean(q.latex_present),
      };
    });

    // Summary
    const subjectCounts: Record<string, number> = {};
    for (const q of out)
      subjectCounts[q.subject] = (subjectCounts[q.subject] ?? 0) + 1;

    const summary = `${out.length} questions parsed — ` +
      Object.entries(subjectCounts)
        .map(([s, c]) => `${c} ${s}`)
        .join(", ");

    return successResponse({ questions: out, count: out.length, summary });
  } catch (err) {
    console.error("Unhandled:", err);
    return errorResponse("Internal error.", "INTERNAL_ERROR", 500);
  }
});
