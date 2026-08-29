// polish-star-section/index.ts — hybrid-backed STAR section polish


import {
  handleCors, parseBody, requireAuth,
  errorResponse,
  requireFields, log, getAdminClient
} from "../_shared/utils.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import type { ModelId } from "../_shared/types.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  assessStarFactualIntegrity,
  FACTUAL_INTEGRITY_SYSTEM_RULE,
} from "../_shared/factualIntegrity.ts";
import {
  AI_RESPONSE_INVALID,
  AI_RESPONSE_INVALID_MESSAGE,
} from "../_shared/structuredParse.ts";
import { callPythonProcess } from "../_shared/pythonClient.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";

type STARKey = "situation" | "task" | "action" | "result";

const SECTION_GUIDANCE: Record<STARKey, string> = {
  situation: "Set the scene concisely — context, team size, timeframe, and stakes. 2–3 sentences. Only include facts from the user text.",
  task:      "State your specific role or challenge. Use 'I was responsible for…' or 'My task was…'. 1–2 sentences. Do not invent responsibilities.",
  action:    "Detail the exact steps YOU took. Start sentences with strong action verbs. Use 'I', not 'we'. 3–5 sentences. Do not invent tools or steps.",
  result:    "Describe outcomes. Quantify ONLY when the user provided numbers; otherwise use [Add measurable result if available]. 2–3 sentences.",
};

const POLISH_STYLES = ["concise", "detailed", "impactful", "natural"] as const;
type PolishStyle = (typeof POLISH_STYLES)[number];

type PolishHybridData = {
  section: STARKey;
  polished: string;
  original: string;
  source?: string;
  draft_kind?: string;
};

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

function extractPythonSectionText(
  data: unknown,
  section: STARKey,
  fallback: string,
): string {
  if (!data || typeof data !== "object") return fallback;
  const obj = data as Record<string, unknown>;
  const starDraft =
    obj.star_draft && typeof obj.star_draft === "object"
      ? (obj.star_draft as Record<string, unknown>)
      : obj;
  const candidate =
    (typeof starDraft[section] === "string" && starDraft[section]) ||
    (typeof obj[section] === "string" && obj[section]) ||
    (typeof obj.polished === "string" && obj.polished) ||
    (typeof obj.draft === "string" && obj.draft) ||
    "";
  return candidate.trim() ? String(candidate).trim() : fallback;
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

    const sourceBaseline = [questionText, currentText].filter(Boolean).join("\n");

    /** Python section draft staged for AI polish (runPython skips success per matrix). */
    let pythonSectionDraft: string | null = null;

    const hybridResult = await executeHybridOperation<PolishHybridData>({
      req,
      auth,
      operation: "star_builder",
      idempotencyKey,
      creditCost: polishCost,
      creditAction: "polish_star",
      body: {
        section,
        currentText,
        questionText,
        style,
        model,
      },
      runDeterministic: async () => {
        if (pythonSectionDraft?.trim()) {
          return {
            section,
            polished: pythonSectionDraft,
            original: currentText,
            source: "python",
            draft_kind: "input_based",
          };
        }
        const cleaned = sanitizeAIOutput(currentText);
        if (!cleaned.trim()) return null;
        return {
          section,
          polished: cleaned,
          original: currentText,
          source: "deterministic",
          draft_kind: "input_based",
        };
      },
      runPython: async (ctx) => {
        const starPayload: Record<string, string> = {
          situation: "",
          task: "",
          action: "",
          result: "",
        };
        starPayload[section] = currentText;
        const pythonStar = await callPythonProcess({
          operation: "star_evidence",
          operationId: ctx.operationId,
          correlationId: ctx.correlationId,
          payload: {
            ...starPayload,
            question: questionText ?? "",
            section,
            current_text: currentText,
          },
        });
        if (!pythonStar.ok) return null;
        const pythonText = extractPythonSectionText(
          pythonStar.data,
          section,
          currentText,
        );
        if (!pythonText.trim()) return null;
        pythonSectionDraft = pythonText;
        // Defer success to runAi — matrix order is python → ai → deterministic.
        return null;
      },
      runAi: async () => {
        const textToPolish = pythonSectionDraft ?? currentText;
        const polishUserPrompt = `
${questionText ? `Interview Question: "${questionText}"\n` : ""}

Current ${sectionLabel} Section:
"${textToPolish}"

Instruction:
${styleInstruction}

Return ONLY the rewritten ${sectionLabel} text:
`.trim();

        const aiResult = await generateWithFallback({
          prompt: polishUserPrompt,
          systemPrompt,
          maxTokens: 400,
          temperature: 0.65,
          model: String(model),
          userId: auth.userId,
          action: "polish_star_section",
        });
        const polished = sanitizeAIOutput(aiResult.text);
        if (!polished.trim()) {
          throw new Error("AI returned empty polish output.");
        }
        return {
          section,
          polished,
          original: currentText,
          source: "ai",
          draft_kind: "polished",
        };
      },
      validate: async (data) => {
        const factual = assessStarFactualIntegrity(sourceBaseline, data.polished);
        if (!factual.ok) {
          throw new Error(AI_RESPONSE_INVALID_MESSAGE);
        }
        if (!data.polished.trim()) {
          throw new Error(AI_RESPONSE_INVALID_MESSAGE);
        }
        return data;
      },
      aiMeta: { provider: "openai", modelVersion: String(model) },
    });

    if (!hybridResult.ok) {
      if (
        hybridResult.code === AI_RESPONSE_INVALID ||
        hybridResult.code === "AI_INVALID_OUTPUT"
      ) {
        return errorResponse(
          AI_RESPONSE_INVALID_MESSAGE,
          AI_RESPONSE_INVALID,
          422,
          req,
        );
      }
      return hybridResult.response;
    }

    log(FN, "info", "STAR section polished", {
      userId: auth.userId,
      section,
      style,
      model,
      hybrid_source: hybridResult.source,
      operation_id: hybridResult.operationId,
    });

    return hybridResult.response;

  } catch (err) {
    if (err instanceof Response) return err;

    log(FN, "error", "Unhandled error", err);
    return errorResponse("Failed to polish STAR section.", "INTERNAL_ERROR", 500, req);
  }
});
