// ─────────────────────────────────────────────────────────────────────────────
// polish-star-section/index.ts — Polish or rewrite a single STAR section
// (situation / task / action / result) without regenerating the full answer.
// Useful for in-place editing in the STAR Builder UI.
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders }  from "../_shared/cors.ts";
import {
  handleCors, parseBody, requireAuth,
  successResponse, errorResponse,
  deductCredits, callAI,
  requireFields, log,
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

const STYLE_INSTRUCTIONS: Record<PolishStyle, string> = {
  concise:   "Make it shorter and punchier. Remove filler words. Keep only the most impactful detail.",
  detailed:  "Expand with more context and specific details. Add metrics if plausible.",
  impactful: "Rewrite to maximise impact. Lead with the strongest point. Use power verbs.",
  natural:   "Make it sound more natural and conversational while keeping it professional.",
};

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "polish-star-section";

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = await requireAuth(req);

    // ── Body ────────────────────────────────────────────────────────────────
    const body = await parseBody<{
      section:       STARKey;
      currentText:   string;
      questionText?: string;
      style?:        PolishStyle;
      instruction?:  string;    // custom free-text instruction
      model?:        ModelId;
    }>(req);

    const validation = requireFields(body as Record<string, unknown>, [
      "section", "currentText",
    ]);
    if (!validation.valid) {
      return errorResponse(validation.errors[0].message, "VALIDATION_ERROR", 400);
    }

    if (!["situation", "task", "action", "result"].includes(body.section)) {
      return errorResponse(
        "section must be one of: situation, task, action, result",
        "VALIDATION_ERROR",
        400
      );
    }

    const {
      section,
      currentText,
      questionText,
      style        = "impactful",
      instruction,
      model        = "gpt-4o-mini",
    } = body;

    // ── Credits ─────────────────────────────────────────────────────────────
    const credit = await deductCredits(auth.userId, "polish_star");
    if (!credit.success) {
      return errorResponse(credit.error ?? "Insufficient credits.", "INSUFFICIENT_CREDITS", 402);
    }

    // ── Prompt ──────────────────────────────────────────────────────────────
    const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
    const styleInstr   = instruction ?? STYLE_INSTRUCTIONS[style];

    const systemPrompt = `You are an expert interview coach. Your job is to polish a single STAR answer section.
Return ONLY the improved text for the ${sectionLabel} section — no labels, no JSON, no extra commentary.
Keep it within the expected length for this section.

Section guidance: ${SECTION_GUIDANCE[section]}`;

    const userPrompt = [
      questionText ? `Interview Question: "${questionText}"` : null,
      ``,
      `Current ${sectionLabel} section:`,
      `"${currentText}"`,
      ``,
      `Polish instruction: ${styleInstr}`,
      ``,
      `Return only the improved ${sectionLabel} text:`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    // ── AI call ─────────────────────────────────────────────────────────────
    const aiResult = await callAI({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      maxTokens:   400,
      temperature: 0.65,
    });

    const polished = aiResult.text.trim();

    log(FN, "info", "Section polished", {
      userId: auth.userId, section, style, model,
    });

    return successResponse(
      { section, polished, original: currentText },
      {
        model:          model,
        tokensUsed:     aiResult.totalTokens,
        creditsCharged: 1,
        latencyMs:      aiResult.latencyMs,
      }
    );

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Failed to polish STAR section.", "INTERNAL_ERROR", 500);
  }
});
