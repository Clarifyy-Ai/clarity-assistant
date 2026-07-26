// generate-star-answer/index.ts — FIXED & SECURE VERSION


import {
  handleCors,
  parseBody,
  requireAuth,
  successResponse,
  errorResponse,
  deductCredits,
  callAI,
  requireFields,
  trimToMaxTokens,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import type { STARAnswer, ModelId } from "../_shared/types.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";

// Sanitize text to protect prompt
function sanitize(input: any, max = 2000): string {
  return String(input ?? "")
    .replace(/```/g, "")          // remove markdown fences
    .replace(/[^\S\r\n]+/g, " ")  // compress whitespace
    .replace(/[\u0000-\u0008]/g, "")
    .replace(/[\u000B\u000C]/g, "")
    .replace(/[\u000E-\u001F]/g, "")
    .slice(0, max);
}

// Allowed model list
const ALLOWED_MODELS: ModelId[] = ["gpt-4o", "gpt-4o-mini", "gpt-4o-reasoning"];

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "generate-star-answer";

  try {
    // -------------------------------
    // AUTH
    // -------------------------------
    const auth = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "generate-star-answer",
      userId,
    );
    if (rateLimited) return rateLimited;

    const planGate = requirePlan(auth.planId, "free", req);
    if (planGate) return planGate;

    // -------------------------------
    // BODY
    // -------------------------------
    const body = await parseBody<{
      questionText: string;
      resumeText?: string;
      jobDescription?: string;
      company?: string;
      role?: string;
      model?: ModelId;
    }>(req);

    const validation = requireFields(body as Record<string, unknown>, [
      "questionText",
    ]);
    if (!validation.valid) {
      return errorResponse(
        validation.errors[0].message,
        "VALIDATION_ERROR",
        400,
        req
      );
    }

    // -------------------------------
    // SANITIZE INPUT
    // -------------------------------
    const questionText = sanitize(body.questionText, 500);
    const resumeText = sanitize(body.resumeText, 4000);
    const jobDescription = sanitize(body.jobDescription, 2000);
    const company = sanitize(body.company, 120);
    const role = sanitize(body.role, 120);

    let model: ModelId = body.model ?? "gpt-4o";
    if (!ALLOWED_MODELS.includes(model)) model = "gpt-4o";

    // -------------------------------
    // DEDUCT CREDITS (Correct signature: userId, action, cost)
    // -------------------------------
    const starCost = creditCost("star_builder");
    const credit = await deductCredits(userId, "generate_star", starCost);
    if (!credit.success) {
      return errorResponse(
        credit.error ?? "Insufficient credits.",
        "INSUFFICIENT_CREDITS",
        402,
        req
      );
    }

    // -------------------------------
    // BUILD PROMPT
    // -------------------------------
    const contextParts: string[] = [];

    if (resumeText) contextParts.push(`Resume:\n${resumeText}`);
    if (jobDescription) contextParts.push(`Job Description:\n${jobDescription}`);
    if (company) contextParts.push(`Target Company: ${company}`);
    if (role) contextParts.push(`Target Role: ${role}`);

    const context =
      contextParts.length > 0
        ? `\n\n## Candidate Context\n${contextParts.join("\n\n")}`
        : "";

    const systemPrompt = `
You are an expert interview coach specialising in the STAR method.
Generate compelling, specific, and authentic STAR-format answers.
Use metrics wherever possible.
Return ONLY a valid JSON object — no quotes outside JSON, no markdown fences.
${context}
`.trim();

    const userPrompt = `
Generate a complete STAR answer for this behavioural interview question:

"${questionText}"

Return ONLY this JSON:
{
  "situation": "",
  "task": "",
  "action": "",
  "result": "",
  "fullAnswer": ""
}
`.trim();

    // -------------------------------
    // CALL AI (with retry)
    // -------------------------------
    const runAI = () =>
      callAI({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 1200,
        temperature: 0.72,
      });

    let aiResult = await runAI();
    if (!aiResult?.text) aiResult = await runAI(); // retry once

    if (!aiResult?.text) {
      // Refund credits
      await deductCredits(userId, "refund_generate_star", -starCost);
      return errorResponse("AI service failed.", "AI_ERROR", 502, req);
    }

    // -------------------------------
    // PARSE JSON SAFELY
    // -------------------------------
    let star: STARAnswer;
    try {
      const cleaned = aiResult.text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      star = {
        situation: parsed.situation ?? "",
        task: parsed.task ?? "",
        action: parsed.action ?? "",
        result: parsed.result ?? "",
        fullAnswer: parsed.fullAnswer ?? "",
      };
    } catch {
      // fallback includes only fullAnswer
      star = {
        situation: "",
        task: "",
        action: "",
        result: "",
        fullAnswer: aiResult.text.trim(),
      };
    }

    // -------------------------------
    // LOGGING
    // -------------------------------
    log(FN, "info", "STAR answer generated", {
      userId,
      model,
      tokens: aiResult.totalTokens,
    });

    // -------------------------------
    // SUCCESS
    // -------------------------------
    return successResponse(star, {
      model,
      tokensUsed: aiResult.totalTokens,
      creditsCharged: 10,
      latencyMs: aiResult.latencyMs,
    }, 200, req);
  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse(
      "Failed to generate STAR answer.",
      "INTERNAL_ERROR",
      500,
      req
    );
  }
});
