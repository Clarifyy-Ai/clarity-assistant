// prep-tool/index.ts — FIXED, SECURE, PRODUCTION-READY

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  successResponse,
  errorResponse,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import {
  createServiceClient,
  deductCreditsAtomic,
  getIdempotentResponse,
  refundCredits,
  storeIdempotentResponse,
} from "../_shared/supabase.ts";
import { generateWithFallback, logAICost } from "../_shared/aiProvider.ts";
import { AI_CREDIT_COSTS } from "../_shared/creditEconomics.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";

import {
  AI_RESPONSE_INVALID,
  AI_RESPONSE_INVALID_MESSAGE,
  isRephraseAlternatives,
  parseStructuredJson,
  REPAIR_JSON_PROMPT,
  type RephraseAlternatives,
} from "../_shared/structuredParse.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import {
  assessStarFactualIntegrity,
  FACTUAL_INTEGRITY_SYSTEM_RULE,
  isValidSystemDesignOutput,
} from "../_shared/factualIntegrity.ts";

function structuredError(
  req: Request,
  message: string,
  code: "PROVIDER_UNAVAILABLE" | "INTERNAL_ERROR" | "AI_RESPONSE_INVALID",
  status: number,
  correlationId: string,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code,
      correlation_id: correlationId,
    }),
    {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

function isProviderFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /missing required|missing.*env|api.?key|GEMINI|OPENAI|ANTHROPIC|provider|unavailable|timeout|ECONNREFUSED|fetch failed|network/i
    .test(msg);
}

/* -------------------------------------------------------------------------- */
/*                          SANITIZATION HELPERS                              */
/* -------------------------------------------------------------------------- */

function sanitizeInput(text: string, max = 2500): string {
  return String(text ?? "")
    .replace(/```/g, "") // remove code fences
    // Strip control chars only — keep Unicode (Hindi, smart quotes, etc.)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, max)
    .trim();
}

function sanitizeAIOutput(text: string): string {
  return String(text ?? "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                         PER-TOOL CREDIT COSTS                              */
/* -------------------------------------------------------------------------- */

const TOOL_COSTS: Record<string, number> = {
  coding_hint:     AI_CREDIT_COSTS.coding_hint,
  coding_solution: AI_CREDIT_COSTS.live_answer,
  rephrase:        AI_CREDIT_COSTS.rephraser,
  project_build:   AI_CREDIT_COSTS.project_builder,
  star_method:     AI_CREDIT_COSTS.star_builder,
  system_design:   AI_CREDIT_COSTS.system_design,
};

function getToolCost(tool_id: string): number {
  return TOOL_COSTS[tool_id] ?? 3;
}

/* -------------------------------------------------------------------------- */
/*                              TOOL PROMPTS                                  */
/* -------------------------------------------------------------------------- */

const TOOL_PROMPTS: Record<string, (input: string) => string> = {
  jd_fit: (input) => `
Analyse this resume/profile against the job description below.
Rate the fit (0-100) and provide a detailed gap analysis.

${input}

Return plain text ONLY with:
Fit Score: X/100
Strong matches: (list)
Gaps to address: (list)
Recommendation: (2-3 sentences)
`,

  question_predict: (input) => `
Based on this job description/company info, predict the 10 most
likely interview questions. Include behavioural, technical, and culture fit.

${input}

Format:
1. Question — why it's likely
2. ...
`,

  cover_letter: (input) => `
Write a tailored, concise 3-paragraph cover letter (<300 words).
Professional tone. Do NOT start with "I am writing to apply...".

${input}
`,

  salary_coach: (input) => `
Create a personalised salary negotiation script. Include:
- opening line
- counter-offer language
- handling pushback
- closing

${input}
`,

  linkedin_headline: (input) => `
Write 5 LinkedIn headline options (<120 characters each).
Keyword-rich and role specific.

${input}
`,

  culture_fit: (input) => `
Analyse how well this candidate aligns with the company's values.
Score (0-100) and explanation.

${input}
`,

  coding_hint: (input) => `
You are a coding interview coach. Give a progressive hint for this problem based on the requested depth level embedded in the input.
- "surface": general direction, data structure to consider, do NOT reveal the algorithm
- "medium": explain the key insight and approach, but not the full solution
- "near-complete": explain the algorithm step by step in detail, including edge cases

${input}
`,

  coding_solution: (input) => `
Explain the optimal solution in interview style.
Include approach, complexity, and edge cases.
NO code.

${input}
`,

  system_design: (input) => `
Provide a detailed system design breakdown with clearly labeled sections:
## 1. Requirements
## 2. High-level architecture
## 3. Data model
## 4. Scaling
## 5. Tradeoffs
## 6. What to mention in interview

Use markdown ## headings for each section. Be concrete and interview-ready.

${input}
`,

  rephrase: (input) => `
Rephrase this interview answer in exactly 3 distinct styles.
Return ONLY valid JSON — no markdown fences, no extra text outside the JSON object.

{
  "formal": "polished, professional, precise version here",
  "confident": "assertive, direct, strong-impact version here",
  "concise": "shorter, punchy, trimmed-down version here"
}

Answer to rephrase:
${input}
`,

  project_build: (input) => `
Create a polished project showcase with:
- overview
- key achievements
- tech rationale
- challenges overcome
- STAR-format version
- 3 follow-up questions + answers

${input}
`,

  star_method: (input) => `
Improve this STAR interview answer. Keep it authentic and specific.
${FACTUAL_INTEGRITY_SYSTEM_RULE}
Polish the language, flow, and impact. Quantify results only when the user provided numbers.
Return the improved version with all 4 sections clearly labeled:

Situation: ...
Task: ...
Action: ...
Result: ...

${input}
`,

  raw_prompt: (input) => input,
};

/* -------------------------------------------------------------------------- */
/*                                  HANDLER                                   */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "prep-tool";
  const correlationId = crypto.randomUUID();

  try {
    /* ----------------------- AUTH ----------------------- */
    const auth   = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "prep-tool",
      userId,
    );
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    const planGate = requirePlan(auth.planId, "free", req);
    if (planGate) return planGate;

    const capabilityGate = requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    /* ----------------------- BODY ----------------------- */
    const body = await req.json().catch(() => null);
    if (!body || typeof body.tool_id !== "string" || typeof body.input !== "string") {
      return errorResponse("Missing tool_id or input", "INVALID_REQUEST", 400, req);
    }

    const { tool_id } = body;

    const promptFn = TOOL_PROMPTS[tool_id];
    if (!promptFn) {
      return errorResponse(`Unknown tool_id: ${tool_id}`, "INVALID_TOOL", 400, req);
    }

    // For coding_hint, prepend depth level to input if provided
    let rawInput = body.input;
    if (tool_id === "coding_hint" && typeof body.depth === "string") {
      const depth = sanitizeInput(body.depth, 20);
      rawInput = `Depth level: ${depth}\n\n${rawInput}`;
    }

    const sanitizedInput = sanitizeInput(rawInput);
    if (sanitizedInput.length < 3) {
      return errorResponse(
        "Input is empty or too short after sanitization.",
        "INVALID_REQUEST",
        400,
        req,
      );
    }

    /* ------------------- CREDIT DEDUCTION ------------------- */
    const toolCost = getToolCost(tool_id);
    // Prefer x-idempotency-key / Idempotency-Key; never invent a random key
    // (that defeats client retries and can double-charge).
    const idempotencyKey =
      req.headers.get("x-idempotency-key") ??
      req.headers.get("Idempotency-Key") ??
      req.headers.get("idempotency-key") ??
      null;
    const requestHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${tool_id}\n${sanitizedInput}`),
    ).then((digest) =>
      Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    );

    // Full-result replay: same key already completed → no second charge / AI call.
    const db = createServiceClient();
    const prior = await getIdempotentResponse(db, idempotencyKey, {
      userId,
      action: `prep_tool_${tool_id}`,
      requestHash,
    });
    const priorPayload = prior?.success ? prior.payload : null;
    if (priorPayload && priorPayload.parse_status !== "failed_invalid_response") {
      log(FN, "info", "Prep tool idempotent replay", {
        userId,
        tool_id,
        correlationId,
      });
      return successResponse(
        {
          result: priorPayload.result,
          alternatives: priorPayload.alternatives,
          cached: true,
        },
        { creditsCharged: 0 },
        200,
        req,
      );
    }

    const creditResult = await deductCreditsAtomic({
      userId,
      action: `prep_tool_${tool_id}`,
      cost: toolCost,
      idempotencyKey,
      requestHash,
    });
    if (!creditResult.success) {
      return creditDenialResponse(req, creditResult, toolCost);
    }

    /* ----------------------- PROMPT ----------------------- */
    const prompt = promptFn(sanitizedInput);

    /* ----------------------- AI CALL ----------------------- */
    let raw: string;
    let usedModel = "gemini-2.0-flash";
    const aiStartMs = Date.now();
    try {
      const ai = await generateWithFallback({
        prompt,
        maxTokens: 1200,
        temperature: 0.6,
        jsonMode: tool_id === "rephrase",
        userId,
        action: `prep_tool_${tool_id}`,
      });
      raw = ai.text;
      usedModel = ai.model;
      if (!raw || raw.trim().length === 0) {
        throw new Error("AI returned empty response");
      }
    } catch (aiErr) {
      await refundCredits({
        userId,
        cost: toolCost,
        reason: `prep-tool AI call failure (${tool_id})`,
      });
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      log(FN, "error", "AI call failed, credits refunded", {
        userId,
        tool_id,
        err: errMsg.slice(0, 500),
      });
      return structuredError(
        req,
        "AI service temporarily unavailable. Credits refunded.",
        "PROVIDER_UNAVAILABLE",
        502,
        correlationId,
      );
    }

    void logAICost(getAdminClient(), {
      userId,
      action: `prep_tool_${tool_id}`,
      model: usedModel,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(raw.length / 4),
      latencyMs: Date.now() - aiStartMs,
      wasFallback: false,
    });

    let alternatives: RephraseAlternatives | null = null;
    let cleaned = sanitizeAIOutput(raw);

    if (tool_id === "system_design" && !isValidSystemDesignOutput(cleaned)) {
      await refundCredits({
        userId,
        cost: toolCost,
        reason: "prep-tool system_design invalid output",
      });
      return structuredError(
        req,
        AI_RESPONSE_INVALID_MESSAGE,
        AI_RESPONSE_INVALID,
        422,
        correlationId,
      );
    }

    if (tool_id === "star_method") {
      const factual = assessStarFactualIntegrity(sanitizedInput, cleaned);
      if (!factual.ok) {
        await refundCredits({
          userId,
          cost: toolCost,
          reason: "prep-tool star_method factual integrity failed",
        });
        log(FN, "warn", "STAR factual integrity rejected output", {
          userId,
          inventedNumbers: factual.inventedNumbers.slice(0, 8),
          inventedTerms: factual.inventedTerms.slice(0, 8),
          correlationId,
        });
        return structuredError(
          req,
          AI_RESPONSE_INVALID_MESSAGE,
          AI_RESPONSE_INVALID,
          422,
          correlationId,
        );
      }
    }

    if (tool_id === "rephrase") {
      let parsed = parseStructuredJson(raw, isRephraseAlternatives);
      if (!parsed.ok) {
        log(FN, "warn", "Rephrase JSON parse failed; one repair retry", {
          category: parsed.category,
          length: parsed.length,
          correlationId,
          model: usedModel,
          operation: tool_id,
        });
        try {
          const repaired = await generateWithFallback({
            prompt: `${REPAIR_JSON_PROMPT}\n\nOriginal answer:\n${sanitizedInput}\n\nBroken output:\n${raw.slice(0, 4000)}`,
            maxTokens: 1200,
            temperature: 0.2,
            jsonMode: true,
            userId,
            action: `prep_tool_${tool_id}_repair`,
          });
          parsed = parseStructuredJson(repaired.text, isRephraseAlternatives);
        } catch {
          parsed = { ok: false, value: null, category: "unavailable", length: raw.length };
        }
      }
      if (!parsed.ok || !parsed.value) {
        await refundCredits({
          userId,
          cost: toolCost,
          reason: "prep-tool rephrase invalid JSON",
        });
        await storeIdempotentResponse(db, idempotencyKey, {
          success: false,
          error: AI_RESPONSE_INVALID,
          payload: { parse_status: "failed_invalid_response", tool_id },
        } as never, {
          userId,
          action: `prep_tool_${tool_id}`,
          requestHash,
        });
        return structuredError(
          req,
          AI_RESPONSE_INVALID_MESSAGE,
          AI_RESPONSE_INVALID,
          422,
          correlationId,
        );
      }
      alternatives = parsed.value;
      cleaned = JSON.stringify(alternatives);
    }

    await storeIdempotentResponse(db, idempotencyKey, {
      success: true,
      balanceAfter: creditResult.balanceAfter,
      transactionId: creditResult.transactionId,
      payload: { result: cleaned, alternatives, tool_id, parse_status: "completed" },
    }, {
      userId,
      action: `prep_tool_${tool_id}`,
      requestHash,
    });

    log(FN, "info", "Prep tool executed", {
      userId,
      tool_id,
      inputLength: sanitizedInput.length,
      correlationId,
    });

    return successResponse(
      { result: cleaned, alternatives },
      { creditsCharged: toolCost },
      200,
      req
    );
  } catch (err) {
    if (err instanceof Response) {
      return withCorsHeaders(req, err);
    }
    const errMsg = err instanceof Error ? err.message : String(err ?? "");
    console.error("prep-tool error:", { correlationId, err: errMsg.slice(0, 500) });
    if (isProviderFailure(err)) {
      return structuredError(
        req,
        "AI service temporarily unavailable. Please try again.",
        "PROVIDER_UNAVAILABLE",
        502,
        correlationId,
      );
    }
    return structuredError(
      req,
      "Internal error",
      "INTERNAL_ERROR",
      500,
      correlationId,
    );
  }
});
