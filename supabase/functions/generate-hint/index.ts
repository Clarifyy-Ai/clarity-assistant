import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// generate-hint — AI hint for current session question
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const {
      user_id,
      question,
      interview_type,
      target_company,
      transcript,
      resume_text,
      regenerate = false,
    } = await req.json();

    if (!question || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct 2 credits
    const ok = await deductCredits(db, user_id, 2, "hint");
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `
You are an interview coach giving a real-time hint to a candidate.

**Question:** ${question}
**Interview type:** ${interview_type ?? "behavioural"}
**Target company:** ${target_company ?? "not specified"}
${transcript ? `**What they've said so far:** ${transcript.slice(0, 400)}` : "**They haven't started yet.**"}
${resume_text ? `**Their background:** ${resume_text.slice(0, 500)}` : ""}

Write a concise, practical hint (max 120 words) that:
1. Reminds them of a relevant STAR framework element they might be missing
2. Suggests a specific angle or example type to use
3. If they've started, tells them what to add next
4. Does NOT answer the question for them

Keep it conversational, like a coach whispering in their ear.
${regenerate ? "This is a regenerated hint — make it different from a typical first hint." : ""}`;

    const hint = await geminiGenerate(prompt, undefined, 0.7, 300);

    return new Response(
      JSON.stringify({ hint: hint.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("generate-hint error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
