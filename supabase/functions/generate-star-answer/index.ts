// generate-star-answer/index.ts — FIXED & SECURE VERSION


import {
  handleCors,
  parseBody,
  requireAuth,
  successResponse,
  errorResponse,
  requireFields,
  trimToMaxTokens,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import { deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import type { STARAnswer, ModelId } from "../_shared/types.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  AI_RESPONSE_INVALID,
  AI_RESPONSE_INVALID_MESSAGE,
  isStarStructuredAnswer,
  normalizeStarAnswer,
  parseStructuredJson,
  REPAIR_JSON_PROMPT,
} from "../_shared/structuredParse.ts";

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

    const capabilityGate = requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

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
    // DEDUCT CREDITS (atomic + idempotent)
    // -------------------------------
    const starCost = creditCost("star_builder");
    const creditResult = await deductCreditsAtomic({
      userId,
      action: "generate_star",
      cost: starCost,
      idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
    });
    if (!creditResult.success) {
      return errorResponse(
        creditResult.error ?? "Insufficient credits.",
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
    let aiResult;
    try {
      aiResult = await generateWithFallback({
        prompt: userPrompt,
        systemPrompt,
        maxTokens: 1200,
        temperature: 0.72,
        jsonMode: true,
        model: String(model),
        userId,
        action: "generate_star_answer",
      });
    } catch {
      aiResult = null;
    }

    if (!aiResult?.text) {
      await refundCredits({
        userId,
        cost: starCost,
        reason: "generate-star-answer AI call failure",
      });
      return errorResponse("AI service failed.", "AI_ERROR", 502, req);
    }

    // -------------------------------
    // PARSE JSON SAFELY
    // -------------------------------
    let star: STARAnswer | null = null;
    let parsed = parseStructuredJson(aiResult.text, isStarStructuredAnswer);
    if (!parsed.ok) {
      log(FN, "warn", "STAR JSON parse failed; one repair retry", {
        category: parsed.category,
        length: parsed.length,
        model,
      });
      try {
        const repaired = await generateWithFallback({
          prompt: `${REPAIR_JSON_PROMPT}\n\nBroken output:\n${aiResult.text.slice(0, 4000)}`,
          systemPrompt,
          maxTokens: 1200,
          temperature: 0.2,
          jsonMode: true,
          model: String(model),
          userId,
          action: "generate_star_answer_repair",
        });
        parsed = parseStructuredJson(repaired.text, isStarStructuredAnswer);
      } catch {
        parsed = { ok: false, value: null, category: "unavailable", length: aiResult.text.length };
      }
    }
    const normalized = parsed.ok ? normalizeStarAnswer(parsed.value) : null;
    if (!normalized) {
      await refundCredits({
        userId,
        cost: starCost,
        reason: "generate-star-answer invalid JSON",
      });
      return errorResponse(AI_RESPONSE_INVALID_MESSAGE, AI_RESPONSE_INVALID, 422, req);
    }
    star = normalized;

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
