// ─────────────────────────────────────────────────────────────────────────────
// generate-star-answer/index.ts — Generate a full STAR-format answer
// for a behavioural interview question, optionally grounded in the
// user's resume and target role context.
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders }  from "../_shared/cors.ts";
import {
  handleCors, parseBody, requireAuth,
  successResponse, errorResponse,
  deductCredits, callAI,
  requireFields, trimToMaxTokens, log,
} from "../_shared/utils.ts";
import type { STARAnswer, ModelId } from "../_shared/types.ts";

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "generate-star-answer";

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = await requireAuth(req);

    // ── Body ────────────────────────────────────────────────────────────────
    const body = await parseBody<{
      questionText:   string;
      resumeText?:    string;
      jobDescription?: string;
      company?:       string;
      role?:          string;
      model?:         ModelId;
    }>(req);

    const validation = requireFields(body as Record<string, unknown>, ["questionText"]);
    if (!validation.valid) {
      return errorResponse(validation.errors[0].message, "VALIDATION_ERROR", 400);
    }

    const {
      questionText,
      resumeText,
      jobDescription,
      company,
      role,
      model = "gpt-4o",
    } = body;

    // ── Credits ─────────────────────────────────────────────────────────────
    const credit = await deductCredits(auth.userId, "generate_star");
    if (!credit.success) {
      return errorResponse(credit.error ?? "Insufficient credits.", "INSUFFICIENT_CREDITS", 402);
    }

    // ── Prompt ──────────────────────────────────────────────────────────────
    const contextParts: string[] = [];

    if (resumeText)     contextParts.push(`Resume:\n${trimToMaxTokens(resumeText, 4000)}`);
    if (jobDescription) contextParts.push(`Job Description:\n${trimToMaxTokens(jobDescription, 2000)}`);
    if (company)        contextParts.push(`Target Company: ${company}`);
    if (role)           contextParts.push(`Target Role: ${role}`);

    const context = contextParts.length > 0
      ? `\n\n## Candidate Context\n${contextParts.join("\n\n")}`
      : "";

    const systemPrompt = `You are an expert interview coach specialising in the STAR method.
Generate compelling, specific, and authentic STAR-format answers.
Use concrete metrics and outcomes wherever possible.
Keep each section concise but impactful.
Return ONLY a valid JSON object — no markdown fences, no extra text.${context}`;

    const userPrompt = `Generate a complete STAR answer for this behavioural interview question:

"${questionText}"

Return this exact JSON structure:
{
  "situation": "2–3 sentences setting the scene (context, team size, timeframe)",
  "task": "1–2 sentences describing your specific responsibility or challenge",
  "action": "3–5 sentences detailing the specific steps YOU took (use 'I', not 'we')",
  "result": "2–3 sentences with measurable outcomes (%, $, time saved, promotions, etc.)",
  "fullAnswer": "A smooth 3–4 paragraph narrative combining all four sections naturally"
}`;

    // ── AI call ─────────────────────────────────────────────────────────────
    const aiResult = await callAI({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      maxTokens:   1200,
      temperature: 0.72,
    });

    // ── Parse JSON ───────────────────────────────────────────────────────────
    let star: STARAnswer;
    try {
      const cleaned = aiResult.text
        .replace(/^```json\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      star = JSON.parse(cleaned) as STARAnswer;
    } catch {
      // Fallback: return raw text as fullAnswer
      star = {
        situation:  "",
        task:       "",
        action:     "",
        result:     "",
        fullAnswer: aiResult.text,
      };
    }

    log(FN, "info", "STAR answer generated", {
      userId: auth.userId, model, tokens: aiResult.totalTokens,
    });

    return successResponse(star, {
      model:          model,
      tokensUsed:     aiResult.totalTokens,
      creditsCharged: 2,
      latencyMs:      aiResult.latencyMs,
    });

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Failed to generate STAR answer.", "INTERNAL_ERROR", 500);
  }
});
