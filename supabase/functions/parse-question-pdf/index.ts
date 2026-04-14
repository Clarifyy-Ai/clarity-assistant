// supabase/functions/parse-question-pdf/index.ts
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  getAdminClient,
  errorResponse,
  successResponse,
  deductCredits,
} from "../_shared/utils.ts";

const CREDIT_COST = 5;

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

function cleanText(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[^\x20-\x7E\n\t]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function extractPdf(req: Request): Promise<{ base64: string; fileName?: string } | null> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("pdf");
    if (!(file instanceof File)) return null;

    const base64 = bufferToBase64(await file.arrayBuffer());
    return { base64, fileName: file.name };
  }

  if (contentType.includes("application/json") || contentType === "") {
    try {
      const body = await req.json();
      if (typeof body?.pdf_base64 === "string" && body.pdf_base64.trim()) {
        return { base64: body.pdf_base64.trim(), fileName: body.file_name };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parseJSONArray(raw: string): ParsedQuestion[] | null {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!list || list.length === 0) return null;

    return list
      .filter((q: any) => typeof q?.question_text === "string" && q.question_text.trim().length > 5)
      .map((q: any) => ({
        question_text: String(q.question_text).trim().slice(0, 2000),
        question_type: ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "NUMERICAL", "CODING"].includes(String(q.question_type))
          ? String(q.question_type)
          : Array.isArray(q.options) && q.options.length >= 2
          ? "MCQ"
          : "SHORT_ANSWER",
        options:
          Array.isArray(q.options) && q.options.length > 0
            ? q.options.slice(0, 4).map((opt: any, idx: number) => ({
                label: String(opt?.label ?? ["A", "B", "C", "D"][idx]).slice(0, 1),
                text: String(opt?.text ?? "").trim().slice(0, 500),
              }))
            : null,
        correct_answer: String(q.correct_answer ?? "").trim().slice(0, 200),
        explanation: String(q.explanation ?? "").trim().slice(0, 2000),
        subject: String(q.subject ?? "General").trim().slice(0, 100),
        topic: String(q.topic ?? "General").trim().slice(0, 100),
        difficulty: ["EASY", "MEDIUM", "HARD"].includes(String(q.difficulty))
          ? String(q.difficulty)
          : "MEDIUM",
        marks_positive: Number(q.marks_positive ?? 4) || 4,
        marks_negative: Number(q.marks_negative ?? 1) || 1,
        source_year: Number.isFinite(Number(q.source_year)) ? Number(q.source_year) : null,
        exam_type: q.exam_type ? String(q.exam_type).trim().slice(0, 50) : null,
        latex_present:
          /\$|\\\(|\\\[/.test(String(q.question_text ?? "")) ||
          /\$|\\\(|\\\[/.test(String(q.explanation ?? "")),
      }))
      .filter((q) => q.question_text.length > 5);
  } catch {
    return null;
  }
}

async function geminiExtractFromPdf(base64: string): Promise<ParsedQuestion[] | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;

  const prompt = `
Extract all exam questions from this PDF and return only valid JSON.
Output format:
{
  "questions": [
    {
      "question_text": "...",
      "question_type": "MCQ",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "explanation": "",
      "subject": "Physics",
      "topic": "Mechanics",
      "difficulty": "MEDIUM",
      "marks_positive": 4,
      "marks_negative": 1,
      "source_year": null,
      "exam_type": null
    }
  ]
}`.trim();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseJSONArray(text);
  } catch (err) {
    console.warn("[parse-question-pdf] geminiExtractFromPdf failed:", err);
    return null;
  }
}

async function ocrExtract(base64: string): Promise<string | null> {
  const apiKey = Deno.env.get("OCR_API_KEY");
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: new URLSearchParams({
        base64Image: `data:application/pdf;base64,${base64}`,
        language: "eng",
        scale: "true",
        OCREngine: "2",
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.ParsedResults?.map((x: any) => x?.ParsedText ?? "").join("\n\n") ?? "";
    return cleanText(text);
  } catch (err) {
    console.warn("[parse-question-pdf] OCR failed:", err);
    return null;
  }
}

async function geminiExtractFromText(text: string): Promise<ParsedQuestion[] | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey || !text.trim()) return null;

  const prompt = `
Extract all exam questions from the following OCR text and return only valid JSON.
Output format:
{
  "questions": [
    {
      "question_text": "...",
      "question_type": "MCQ",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "explanation": "",
      "subject": "General",
      "topic": "General",
      "difficulty": "MEDIUM",
      "marks_positive": 4,
      "marks_negative": 1,
      "source_year": null,
      "exam_type": null
    }
  ]
}

OCR Text:
${text.slice(0, 30000)}
`.trim();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseJSONArray(raw);
  } catch (err) {
    console.warn("[parse-question-pdf] geminiExtractFromText failed:", err);
    return null;
  }
}

function manualParse(text: string): ParsedQuestion[] {
  if (!text.trim()) return [];

  const blocks = text
    .split(/(?:^|\n)\s*(?:Q\.?\s*)?\d+\s*[\.\)]\s+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const result: ParsedQuestion[] = [];

  for (const block of blocks) {
    const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-D])[\.\)]\s+(.+?)(?=(?:\n\s*[A-D][\.\)]\s+)|$)/gis)];
    const questionText = block.split(/\n\s*[A-D][\.\)]\s+/i)[0]?.trim() ?? "";

    if (!questionText) continue;

    if (optionMatches.length >= 2) {
      result.push({
        question_text: questionText.slice(0, 2000),
        question_type: "MCQ",
        options: optionMatches.slice(0, 4).map((m) => ({
          label: String(m[1]).toUpperCase(),
          text: cleanText(String(m[2] ?? "")).slice(0, 500),
        })),
        correct_answer: "",
        explanation: "",
        subject: "General",
        topic: "General",
        difficulty: "MEDIUM",
        marks_positive: 4,
        marks_negative: 1,
        source_year: null,
        exam_type: null,
        latex_present: /\$|\\\(|\\\[/.test(questionText),
      });
    } else {
      result.push({
        question_text: questionText.slice(0, 2000),
        question_type: "SHORT_ANSWER",
        options: null,
        correct_answer: "",
        explanation: "",
        subject: "General",
        topic: "General",
        difficulty: "MEDIUM",
        marks_positive: 4,
        marks_negative: 1,
        source_year: null,
        exam_type: null,
        latex_present: /\$|\\\(|\\\[/.test(questionText),
      });
    }
  }

  return result;
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
      return errorResponse("No PDF uploaded.", "NO_PDF", 400);
    }

    if (auth.credits !== -1 && auth.credits < CREDIT_COST) {
      return errorResponse("Not enough credits.", "NO_CREDITS", 403);
    }

    const deduct = await deductCredits(userId, "parse_question_pdf", CREDIT_COST);
    if (auth.credits !== -1) {
      if (!deduct.success) {
        return errorResponse("Unable to deduct credits.", "CREDIT_FAIL", 500);
      }
      charged = true;
    }

    const aiPdfQuestions = await geminiExtractFromPdf(pdf.base64);
    if (aiPdfQuestions && aiPdfQuestions.length > 0) {
      return successResponse({
        questions: aiPdfQuestions,
        summary: `${aiPdfQuestions.length} questions parsed from PDF.`,
        mode: "ai",
      });
    }

    const ocrText = await ocrExtract(pdf.base64);
    if (ocrText) {
      const aiTextQuestions = await geminiExtractFromText(ocrText);
      if (aiTextQuestions && aiTextQuestions.length > 0) {
        return successResponse({
          questions: aiTextQuestions,
          summary: `${aiTextQuestions.length} questions extracted from OCR text.`,
          mode: "ocr",
        });
      }

      const manual = manualParse(ocrText);
      if (manual.length > 0) {
        return successResponse({
          questions: manual,
          summary: `${manual.length} questions extracted with fallback parser.`,
          mode: "manual",
        });
      }
    }

    if (charged) {
      try {
        const admin = getAdminClient();
        await admin.rpc("add_credits", {
          p_user_id: userId,
          p_amount: CREDIT_COST,
          p_action: "refund",
          p_description: "PDF parse failed - refund",
        });
      } catch (refundErr) {
        console.error("[parse-question-pdf] Refund failed:", refundErr);
      }
    }

    return errorResponse(
      "No questions could be extracted from this PDF. Try a clearer PDF or an OCR-friendly scan.",
      "NO_QUESTIONS_FOUND",
      422
    );
  } catch (err) {
    console.error("[parse-question-pdf] Unhandled error:", err);

    if (charged && userId) {
      try {
        const admin = getAdminClient();
        await admin.rpc("add_credits", {
          p_user_id: userId,
          p_amount: CREDIT_COST,
          p_action: "refund",
          p_description: "PDF parse error - refund",
        });
      } catch (refundErr) {
        console.error("[parse-question-pdf] Refund failed:", refundErr);
      }
    }

    return errorResponse(
      err instanceof Error ? err.message : "Internal error.",
      "INTERNAL_ERROR",
      500
    );
  }
});
