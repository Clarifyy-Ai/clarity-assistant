// polish-star-section/index.ts — SECURE, FIXED PRODUCTION VERSION


import {
  handleCors, parseBody, requireAuth,
  successResponse, errorResponse,
  deductCredits, callAI,
  requireFields, log
} from "../_shared/utils.ts";
import type { ModelId } from "../_shared/types.ts";

type STARKey = "situation" | "task" | "action" | "result";

const SECTION_GUIDANCE: Record<STARKey, string> = {
  situation: "Set the scene concisely — context, team size, timeframe, and stakes. 2–3 sentences.",
  task:      "State your specific role or challenge. Use 'I was responsible for…' or 'My task was…'. 1–2 sentences.",
  action:    "Detail the exact steps YOU took. Start sentences with strong action verbs. Use 'I', not 'we'. 3–5 sentences.",
  result:    "Quantify outcomes with numbers, percentages, or business impact. 2–3 sentences.",
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
      return errorResponse(validation.errors[0].message, "VALIDATION_ERROR", 400);
    }

    // Validate section key
    if (!["situation", "task", "action", "result"].includes(rawBody.section)) {
      return errorResponse(
        "section must be one of: situation, task, action, result",
        "VALIDATION_ERROR",
        400
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

    // CREDITS (FIXED: cost must be explicit)
    const credit = await deductCredits(auth.userId, "polish_star", 1);
    if (!credit.success) {
      return errorResponse(credit.error ?? "Insufficient credits.", "INSUFFICIENT_CREDITS", 402);
    }

    // Prompt construction
    const styleInstruction = instruction ?? {
      concise:   "Make it shorter and punchier. Remove filler words. Keep only the strongest detail.",
      detailed:  "Expand with more useful and concrete context. Add metrics when plausible.",
      impactful: "Maximize impact. Lead with the strongest point. Use crisp action verbs.",
      natural:   "Make it sound natural and conversational while staying professional."
    }[style];

    const systemPrompt = `
You are an expert interview coach. Your task is to refine ONLY the ${sectionLabel} section of a STAR answer.
Return ONLY the polished text — no labels, no metadata, no commentary.
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

    // AI CALL
    const aiResult = await callAI({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      maxTokens: 400,
      temperature: 0.65,
    });

    const polished = sanitizeAIOutput(aiResult.text);

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
        creditsCharged: 1,
        latencyMs: aiResult.latencyMs,
      }
    );

  } catch (err) {
    if (err instanceof Response) return err;

    log(FN, "error", "Unhandled error", err);
    return errorResponse("Failed to polish STAR section.", "INTERNAL_ERROR", 500);
  }
});
