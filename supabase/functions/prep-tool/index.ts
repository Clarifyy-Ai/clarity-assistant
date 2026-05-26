// prep-tool/index.ts — FIXED, SECURE, PRODUCTION-READY

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  successResponse,
  errorResponse,
  deductCredits,
  log,
} from "../_shared/utils.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

/* -------------------------------------------------------------------------- */
/*                          SANITIZATION HELPERS                              */
/* -------------------------------------------------------------------------- */

function sanitizeInput(text: string, max = 2500): string {
  return String(text ?? "")
    .replace(/```/g, "")             // remove code fences
    .replace(/[^\x20-\x7E\n]/g, "")  // remove non-printable
    .replace(/\s{2,}/g, " ")         // compress whitespace
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
  coding_hint:   8,
  rephrase:      6,
  project_build: 10,
  star_method:   10,
  system_design: 5,
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
Provide a detailed system design breakdown:
- Requirements
- High-level architecture
- Data model
- Scaling
- Tradeoffs
- What to mention in interview

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
Polish the language, flow, and impact. Quantify results where possible.
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

  try {
    /* ----------------------- AUTH ----------------------- */
    const auth   = await requireAuth(req);
    const userId = auth.userId;

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

    /* ------------------- CREDIT DEDUCTION ------------------- */
    const toolCost = getToolCost(tool_id);
    const credit   = await deductCredits(userId, `prep_tool_${tool_id}` as any, toolCost);
    if (!credit.success) {
      return errorResponse("Insufficient credits", "INSUFFICIENT_CREDITS", 402, req);
    }

    /* ----------------------- PROMPT ----------------------- */
    const prompt = promptFn(sanitizedInput);

    /* ----------------------- AI CALL ----------------------- */
    let raw: string;
    try {
      raw = await geminiGenerate(prompt, undefined, 0.6, 1200, auth.byok?.gemini);
      if (!raw || raw.trim().length === 0) {
        throw new Error("AI returned empty response");
      }
    } catch (aiErr) {
      // Refund credits — user didn't get a useful result
      await deductCredits(userId, `refund_prep_tool_${tool_id}` as any, -toolCost);
      log(FN, "error", "AI call failed, credits refunded", { userId, tool_id, err: String(aiErr) });
      return errorResponse(
        "AI service temporarily unavailable. Credits refunded.",
        "AI_ERROR",
        502,
        req
      );
    }

    const cleaned = sanitizeAIOutput(raw);

    /* ----------------------- RESPOND ----------------------- */
    log(FN, "info", "Prep tool executed", {
      userId,
      tool_id,
      inputLength: sanitizedInput.length,
    });

    return successResponse(
      { result: cleaned },
      { creditsCharged: toolCost },
      200,
      req
    );
  } catch (err) {
    console.error("prep-tool error:", err);
    return errorResponse("Internal error", "INTERNAL", 500, req);
  }
});
