// polish-star-section/index.ts — SECURE, FIXED PRODUCTION VERSION


import {
  handleCors, parseBody, requireAuth,
  successResponse, errorResponse,
  requireFields, log, getAdminClient
} from "../_shared/utils.ts";
import { deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import type { ModelId } from "../_shared/types.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import {
  assessStarFactualIntegrity,
  FACTUAL_INTEGRITY_SYSTEM_RULE,
} from "../_shared/factualIntegrity.ts";
import {
  AI_RESPONSE_INVALID,
  AI_RESPONSE_INVALID_MESSAGE,
} from "../_shared/structuredParse.ts";
import { callPythonProcess } from "../_shared/pythonClient.ts";

type STARKey = "situation" | "task" | "action" | "result";

const SECTION_GUIDANCE: Record<STARKey, string> = {
  situation: "Set the scene concisely — context, team size, timeframe, and stakes. 2–3 sentences. Only include facts from the user text.",
  task:      "State your specific role or challenge. Use 'I was responsible for…' or 'My task was…'. 1–2 sentences. Do not invent responsibilities.",
  action:    "Detail the exact steps YOU took. Start sentences with strong action verbs. Use 'I', not 'we'. 3–5 sentences. Do not invent tools or steps.",
  result:    "Describe outcomes. Quantify ONLY when the user provided numbers; otherwise use [Add measurable result if available]. 2–3 sentences.",
};

const POLISH_STYLES = ["concise", "detailed", "impactful", "natural"] as const;
type PolishStyle = (typeof POLISH_STYLES)[number];

/* -----------------------------------------------
   SANITIZATION HELPERS
----------------------------------------------- */
function sanitizeInput(text: string, max = 1200): string {
  if (!text) return "";
  return String(text)
    .replace(/```/g, "")               // remove code fences
    .replace(/[^\x20-\x7E\n]/g, "")    // remove non-printable
    .replace(/\s{2,}/g, " ")
    .slice(0, max)
    .trim();
}

function sanitizeAIOutput(text: string): string {
  return String(text)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

/* -----------------------------------------------
   MAIN HANDLER
----------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "polish-star-section";

  try {
    // AUTH
    const auth = await requireAuth(req);

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "polish-star-section",
      auth.userId,
    );
    if (rateLimited) return rateLimited;

    const planGate = requirePlan(auth.planId, "free", req);
    if (planGate) return planGate;

    const capabilityGate = await requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    // BODY
    const rawBody = await parseBody<{
      section: STARKey;
      currentText: string;
      questionText?: string;
      style?: PolishStyle;
      instruction?: string;  
      model?: ModelId;
    }>(req);

    // Required fields
    const validation = requireFields(rawBody as Record<string, unknown>, [
      "section",
      "currentText",
    ]);
    if (!validation.valid) {
      return errorResponse(validation.errors[0].message, "VALIDATION_ERROR", 400, req);
    }

    // Validate section key
    if (!["situation", "task", "action", "result"].includes(rawBody.section)) {
      return errorResponse(
        "section must be one of: situation, task, action, result",
        "VALIDATION_ERROR",
        400,
        req
      );
    }

    const section = rawBody.section;
    const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);

    // Sanitize inputs
    const currentText   = sanitizeInput(rawBody.currentText, 1200);
    const questionText  = rawBody.questionText ? sanitizeInput(rawBody.questionText, 400) : null;
    const instruction   = rawBody.instruction ? sanitizeInput(rawBody.instruction, 600) : null;
    const style         = POLISH_STYLES.includes(rawBody.style ?? "impactful")
                          ? rawBody.style ?? "impactful"
                          : "impactful";

    // AI model
    const model: ModelId = rawBody.model ?? "gpt-4o-mini";

    const polishCost = creditCost("polish_star");
    const idempotencyKey =
      req.headers.get("x-idempotency-key") ??
      req.headers.get("Idempotency-Key") ??
      null;
    const creditResult = await deductCreditsAtomic({
      userId: auth.userId,
      action: "polish_star",
      cost: polishCost,
      idempotencyKey,
    });
    if (!creditResult.success) {
      return creditDenialResponse(req, creditResult, polishCost);
    }

    // Prompt construction — never invite invented metrics
    const styleInstruction = instruction ?? {
      concise:   "Make it shorter and punchier. Remove filler words. Keep only the strongest detail already present.",
      detailed:  "Expand with clearer structure using only facts already present. If metrics are missing, use [Add measurable result if available] — never invent numbers.",
      impactful: "Maximize clarity and impact of existing facts. Lead with the strongest point. Use crisp action verbs. Do not invent outcomes.",
      natural:   "Make it sound natural and conversational while staying professional. Do not invent details."
    }[style];

    const systemPrompt = `
You are an expert interview coach. Your task is to refine ONLY the ${sectionLabel} section of a STAR answer.
Return ONLY the polished text — no labels, no metadata, no commentary.
${FACTUAL_INTEGRITY_SYSTEM_RULE}
Follow guidance strictly:

${SECTION_GUIDANCE[sectionLabel.toLowerCase() as STARKey]}
`.trim();

    const userPrompt = `
${questionText ? `Interview Question: "${questionText}"\n` : ""}

Current ${sectionLabel} Section:
"${currentText}"

Instruction:
${styleInstruction}

Return ONLY the rewritten ${sectionLabel} text:
`.trim();

    // AI CALL — on failure return Python input-based draft (no refund)
    let aiResult;
    try {
      aiResult = await generateWithFallback({
        prompt: userPrompt,
        systemPrompt,
        maxTokens: 400,
        temperature: 0.65,
        model: String(model),
        userId: auth.userId,
        action: "polish_star_section",
      });
    } catch (aiErr) {
      const correlationId = crypto.randomUUID();
      const starPayload: Record<string, string> = {
        situation: "",
        task: "",
        action: "",
        result: "",
      };
      starPayload[section] = currentText;
      const pythonStar = await callPythonProcess({
        operation: "star_evidence",
        operationId: `polish_star:${correlationId}`,
        correlationId,
        payload: {
          ...starPayload,
          question: questionText ?? "",
          section,
          current_text: currentText,
        },
      });
      let pythonText = currentText;
      if (pythonStar.ok && pythonStar.data && typeof pythonStar.data === "object") {
        const data = pythonStar.data as Record<string, unknown>;
        const starDraft =
          data.star_draft && typeof data.star_draft === "object"
            ? (data.star_draft as Record<string, unknown>)
            : data;
        const candidate =
          (typeof starDraft[section] === "string" && starDraft[section]) ||
          (typeof data[section] === "string" && data[section]) ||
          (typeof data.polished === "string" && data.polished) ||
          (typeof data.draft === "string" && data.draft) ||
          "";
        if (candidate.trim()) pythonText = String(candidate).trim();
      }
      if (pythonText.trim()) {
        log(FN, "info", "STAR polish from python draft (AI unavailable)", {
          userId: auth.userId,
          section,
        });
        return successResponse(
          {
            section,
            polished: pythonText,
            original: currentText,
            source: "python",
            draft_kind: "input_based",
          },
          {
            model: "python",
            tokensUsed: 0,
            creditsCharged: polishCost,
            latencyMs: 0,
          },
          200,
          req,
        );
      }
      try {
        await refundCredits({
          userId: auth.userId,
          cost: polishCost,
          reason: "polish-star-section AI and python failure",
        });
      } catch (refundErr) {
        log(FN, "error", "Refund failed", refundErr);
      }
      log(FN, "error", "AI provider failed", aiErr);
      return errorResponse(
        "AI improvement is temporarily unavailable.",
        "PROVIDER_UNAVAILABLE",
        502,
        req
      );
    }

    const polished = sanitizeAIOutput(aiResult.text);
    const sourceBaseline = [questionText, currentText].filter(Boolean).join("\n");
    const factual = assessStarFactualIntegrity(sourceBaseline, polished);
    if (!factual.ok) {
      await refundCredits({
        userId: auth.userId,
        cost: polishCost,
        reason: "polish-star-section factual integrity failed",
      });
      return errorResponse(
        AI_RESPONSE_INVALID_MESSAGE,
        AI_RESPONSE_INVALID,
        422,
        req,
      );
    }

    // LOG
    log(FN, "info", "STAR section polished", {
      userId: auth.userId,
      section,
      style,
      model,
      tokens: aiResult.totalTokens,
    });

    return successResponse(
      { section, polished, original: currentText },
      {
        model,
        tokensUsed: aiResult.totalTokens,
        creditsCharged: polishCost,
        latencyMs: aiResult.latencyMs,
      },
      200,
      req
    );

  } catch (err) {
    if (err instanceof Response) return err;

    log(FN, "error", "Unhandled error", err);
    return errorResponse("Failed to polish STAR section.", "INTERNAL_ERROR", 500, req);
  }
});
