import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  deductCredits,
} from "../_shared/utils.ts";

const CREDIT_COST = 5;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

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

  if (!contentType.includes("multipart/form-data")) {
    return null;
  }

  const form = await req.formData();
  const file = form.get("pdf");

  if (!(file instanceof File)) {
    return null;
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("PDF exceeds 15MB limit");
  }

  const base64 = bufferToBase64(await file.arrayBuffer());

  return {
    fileName: file.name,
    base64,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms = 30000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

async function callGemini(base64: string) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("Missing Gemini API key");
  }

  const prompt = `
You are an expert exam question extractor. Read this PDF of exam questions and
extract every MCQ you find as structured JSON.

Rules:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Each question must have exactly 4 options labelled A, B, C, D.
- correct_answer must be one of "A", "B", "C", "D".
- Preserve mathematical notation as plain text (e.g. "x^2 + 3x - 4 = 0").
- Skip any item that is not a valid MCQ with 4 options.
- difficulty must be one of "EASY", "MEDIUM", "HARD" (infer if not stated).

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
      "explanation": "string (optional, can be empty)",
      "subject": "string (e.g. Physics, Quant, History)",
      "topic": "string (specific chapter/topic)",
      "difficulty": "MEDIUM",
      "marks_positive": 4,
      "marks_negative": 1
    }
  ]
}
`.trim();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error("Gemini request failed");
  }

  return await res.json();
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
      return errorResponse(
        "No PDF uploaded",
        "NO_PDF",
        400
      );
    }

    const deduct = await deductCredits(
      userId,
      "parse_question_pdf",
      CREDIT_COST
    );

    if (!deduct.success) {
      return errorResponse(
        "Insufficient credits",
        "NO_CREDITS",
        402
      );
    }

    charged = true;

    let result;

    try {
      result = await withTimeout(
        callGemini(pdf.base64),
        30000
      );
    } catch (err) {
      if (charged) {
        await deductCredits(
          userId,
          "refund_parse_question_pdf",
          -CREDIT_COST
        );
      }

      return errorResponse(
        "PDF parsing failed. Credits refunded.",
        "AI_ERROR",
        502
      );
    }

    const text =
      result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;

    try {
      parsed = JSON.parse(
        text
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim()
      );
    } catch {
      parsed = { questions: [] };
    }

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
      : [];

    return successResponse({
      success: true,
      questions,
      count: questions.length,
    });
  } catch (err) {
    console.error("[parse-question-pdf]", err);

    if (charged && userId) {
      try {
        await deductCredits(
          userId,
          "refund_parse_question_pdf",
          -CREDIT_COST
        );
      } catch {}
    }

    return new Response(
      JSON.stringify({
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  }
});
