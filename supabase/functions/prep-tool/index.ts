// prep-tool/index.ts — FIXED, SECURE, PRODUCTION-READY

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  successResponse,
  errorResponse,
  deductCredits,
  log
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
/*                               TOOL PROMPTS                                 */
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
Give progressive hints (general → specific) for this coding problem.
Do NOT reveal the full solution.

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
Rephrase and improve this answer. Preserve authenticity.
Return ONLY the improved answer.

${input}
`,

  project_build: (input) => `
Create a polished project showcase with:
- overview
- achievements
- tech rationale
- challenges
- STAR-format version
- 3 follow-up questions + answers

${input}
`,

  raw_prompt: (input) => input,
};

/* -------------------------------------------------------------------------- */
/*                                   HANDLER                                  */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "prep-tool";

  try {
    /* ----------------------- AUTH ----------------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;

    /* ----------------------- BODY ----------------------- */
    const body = await req.json().catch(() => null);
    if (!body || typeof body.tool_id !== "string" || typeof body.input !== "string") {
      return errorResponse("Missing tool_id or input", "INVALID_REQUEST", 400);
    }

    const { tool_id } = body;

    const promptFn = TOOL_PROMPTS[tool_id];
    if (!promptFn) {
      return errorResponse(`Unknown tool_id: ${tool_id}`, "INVALID_TOOL", 400);
    }

    const sanitizedInput = sanitizeInput(body.input);

    /* ------------------- CREDIT DEDUCTION ------------------- */
    const credit = await deductCredits(userId, `prep_tool_${tool_id}`, 3);
    if (!credit.success) {
      return errorResponse("Insufficient credits", "INSUFFICIENT_CREDITS", 402);
    }

    /* ----------------------- PROMPT ----------------------- */
    const prompt = promptFn(sanitizedInput);

    /* ----------------------- AI CALL ----------------------- */
    const raw = await geminiGenerate(prompt, undefined, 0.6, 1200);
    const cleaned = sanitizeAIOutput(raw);

    /* ----------------------- RESPOND ----------------------- */
    log(FN, "info", "Prep tool executed", {
      userId, tool_id, inputLength: sanitizedInput.length
    });

    return successResponse(
      { result: cleaned },
      { creditsCharged: 3 }
    );

  } catch (err) {
    console.error("prep-tool error:", err);
    return errorResponse("Internal error", "INTERNAL", 500);
  }
});
