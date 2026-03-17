import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// prep-tool — run any PrepLab AI tool
// ─────────────────────────────────────────────────────────────────

const TOOL_PROMPTS: Record<string, (input: string) => string> = {

  jd_fit: (input) => `
Analyse this resume/profile against the job description below.
Rate the fit (0-100) and provide a detailed gap analysis.

${input}

Return as plain text with:
**Fit Score:** X/100
**Strong matches:** (list)
**Gaps to address:** (list)
**Recommendation:** (2-3 sentences)`,

  question_predict: (input) => `
Based on this job description and/or company info, predict the 10 most
likely interview questions. Include a mix of behavioural, technical,
and culture fit questions.

${input}

Format each question numbered, with a brief note on why it's likely.`,

  cover_letter: (input) => `
Write a compelling, tailored cover letter based on this resume and job description.
Keep it to 3 paragraphs, professional tone, under 300 words.
Open with impact, not "I am writing to apply…"

${input}`,

  salary_coach: (input) => `
Create a personalised salary negotiation script for this role and situation.
Include: opening line, counter-offer language, handling pushback,
and closing. Keep it professional and confident.

${input}`,

  linkedin_headline: (input) => `
Write 5 alternative LinkedIn headline options for this professional profile.
Make them keyword-rich, specific, and compelling to recruiters.
Each under 120 characters.

${input}`,

  culture_fit: (input) => `
Analyse how well this candidate's experience and answers align with
the company's stated culture and values. Score (0-100) and explain.

${input}`,
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { user_id, tool_id, input } = await req.json();

    if (!tool_id || !input) {
      return new Response(
        JSON.stringify({ error: "Missing tool_id or input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const promptFn = TOOL_PROMPTS[tool_id];
    if (!promptFn) {
      return new Response(
        JSON.stringify({ error: "Unknown tool" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user_id) {
      const ok = await deductCredits(db, user_id, 3, `prep_tool_${tool_id}`);
      if (!ok) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const prompt = promptFn(input.slice(0, 3000));
    const result = await geminiGenerate(prompt, undefined, 0.6, 1200);

    return new Response(
      JSON.stringify({ result: result.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("prep-tool error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
