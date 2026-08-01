import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  getAdminClient,
} from "../_shared/utils.ts";
import { deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { geminiGenerateWithPdf, parseJSON } from "../_shared/gemini.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  PDF_QUESTION_EXTRACT_PROMPT,
  bufferToBase64,
} from "../_shared/pdfQuestionExtract.ts";

const CREDIT_COST = creditCost("parse_question_pdf");
const MAX_FILE_SIZE = 15 * 1024 * 1024;

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

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "parse-question-pdf",
      userId,
    );
    if (rateLimited) return rateLimited;

    const capabilityGate = requireCapabilityForFunction(auth.planId, "parse-question-pdf", req);
    if (capabilityGate) return capabilityGate;

    const pdf = await extractPdf(req);
    if (!pdf?.base64) {
      return errorResponse("No PDF uploaded", "NO_PDF", 400, req);
    }

    const creditResult = await deductCreditsAtomic({
      userId,
      action: "parse_question_pdf",
      cost: CREDIT_COST,
      idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
    });
    if (!creditResult.success) {
      return errorResponse("Insufficient credits", "NO_CREDITS", 402, req);
    }
    charged = true;

    let rawText: string;
    try {
      rawText = await geminiGenerateWithPdf(
        PDF_QUESTION_EXTRACT_PROMPT,
        pdf.base64,
        {
          temperature: 0.2,
          maxTokens: 4096,
        },
      );
    } catch (err) {
      if (charged) {
        await refundCredits({
          userId,
          cost: CREDIT_COST,
          reason: "parse-question-pdf AI call failure",
        });
      }
      const msg = err instanceof Error ? err.message : "Gemini PDF parse failed";
      console.error("[parse-question-pdf] Gemini error:", msg);
      return errorResponse(
        "PDF parsing failed. Credits refunded.",
        "AI_ERROR",
        502,
        req,
      );
    }

    const parsed = parseJSON<{ questions?: unknown[] }>(rawText, { questions: [] });
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return successResponse(
      { questions, count: questions.length },
      undefined,
      200,
      req,
    );
  } catch (err) {
    console.error("[parse-question-pdf]", err);

    if (charged && userId) {
      try {
        await refundCredits({
          userId,
          cost: CREDIT_COST,
          reason: "parse-question-pdf unhandled error",
        });
      } catch {
        /* ignore refund failure */
      }
    }

    return errorResponse(
      "Internal server error",
      "INTERNAL",
      500,
      req,
    );
  }
});
