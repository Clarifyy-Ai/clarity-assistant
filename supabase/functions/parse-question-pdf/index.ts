import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  deductCredits,
} from "../_shared/utils.ts";
import { geminiGenerateWithPdf, parseJSON } from "../_shared/gemini.ts";

import { creditCost } from "../_shared/creditEconomics.ts";

const CREDIT_COST = creditCost("parse_question_pdf");
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const PDF_EXTRACT_PROMPT = `
You are an expert exam question extractor. Read this PDF of exam questions and
extract every MCQ you find as structured JSON.

Rules:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Each question must have exactly 4 options labelled A, B, C, D.
- correct_answer must be one of "A", "B", "C", "D".
- Preserve mathematical notation using LaTeX in question_text and option text.
- Skip any item that is not a valid MCQ with 4 options.
- difficulty must be one of "EASY", "MEDIUM", "HARD".

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
      "latex_present": false,
      "image_url": ""
    }
  ]
}
`.trim();

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function extractPdf(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return null;

  const form = await req.formData();
  const file = form.get("pdf");
  if (!(file instanceof File)) return null;
  if (file.size > MAX_FILE_SIZE) throw new Error("PDF exceeds 15MB limit");

  return {
    fileName: file.name,
    base64: bufferToBase64(await file.arrayBuffer()),
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let charged = false;
  let userId = "";

  try {
    const auth = await requireAuth(req);
    userId = auth.userId;

    const pdf = await extractPdf(req);
    if (!pdf?.base64) {
      return errorResponse("No PDF uploaded", "NO_PDF", 400, req);
    }

    const deduct = await deductCredits(userId, "parse_question_pdf", CREDIT_COST);
    if (!deduct.success) {
      return errorResponse("Insufficient credits", "NO_CREDITS", 402, req);
    }
    charged = true;

    let rawText: string;
    try {
      rawText = await geminiGenerateWithPdf(PDF_EXTRACT_PROMPT, pdf.base64, {
        temperature: 0.2,
        maxTokens: 4096,
      });
    } catch (err) {
      if (charged) {
        await deductCredits(userId, "refund_parse_question_pdf", -CREDIT_COST);
      }
      const msg = err instanceof Error ? err.message : "Gemini PDF parse failed";
      console.error("[parse-question-pdf] Gemini error:", msg);
      return errorResponse(
        "PDF parsing failed. Credits refunded.",
        "AI_ERROR",
        502,
        req
      );
    }

    const parsed = parseJSON<{ questions?: unknown[] }>(rawText, { questions: [] });
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return successResponse(
      { questions, count: questions.length },
      undefined,
      200,
      req
    );
  } catch (err) {
    console.error("[parse-question-pdf]", err);

    if (charged && userId) {
      try {
        await deductCredits(userId, "refund_parse_question_pdf", -CREDIT_COST);
      } catch {
        /* ignore refund failure */
      }
    }

    return errorResponse(
      "Internal server error",
      "INTERNAL",
      500,
      req
    );
  }
});
