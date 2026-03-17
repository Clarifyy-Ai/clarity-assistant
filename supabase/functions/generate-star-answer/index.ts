import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// generate-star-answer — generate polished STAR answer from builder
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { user_id, question, star, resume_text } = await req.json();

    if (!question || !star || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct 3 credits
    const ok = await deductCredits(db, user_id, 3, "prep_star_generate");
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `
You are an expert interview coach. Transform the raw STAR notes below
into a polished, natural-sounding interview answer (150-350 words).

**Question:** ${question}
${resume_text ? `**Candidate background:** ${resume_text.slice(0, 500)}` : ""}

**Raw STAR notes:**
- Situation: ${star.situation}
- Task: ${star.task}
- Action: ${star.action}
- Result: ${star.result}

Write a flowing, confident first-person answer that:
- Sounds natural when spoken aloud
- Highlights impact with specific metrics where possible
- Uses "I" not "we" for actions
- Ends with a clear, quantified result
- Is between 150-350 words
- Does NOT use "Situation:", "Task:" etc. as headers — flows naturally

Return ONLY the answer text, no preamble.`;

    const answer = await geminiGenerate(prompt, undefined, 0.6, 600);

    return new Response(
      JSON.stringify({ answer: answer.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("generate-star-answer error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
