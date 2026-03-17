import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// polish-star-section — AI-polish one STAR section
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { user_id, question, section, content, context } = await req.json();

    if (!section || !content || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ok = await deductCredits(db, user_id, 2, "prep_polish");
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SECTION_GUIDANCE: Record<string, string> = {
      situation: "Make it concise (2-3 sentences). Set time, place, context clearly.",
      task:      "Clarify YOUR specific role and responsibility. Use 'I was responsible for…'",
      action:    "Use strong action verbs. List 2-3 specific steps YOU took. Use 'I', not 'we'.",
      result:    "Add metrics/numbers if possible. State the business impact. End positively.",
    };

    const prompt = `
Polish this STAR ${section} section for an interview answer.

**Interview question:** ${question ?? "not specified"}
**Section:** ${section.toUpperCase()}
**Guidance for this section:** ${SECTION_GUIDANCE[section] ?? "Make it clear and impactful."}
${context?.resume_text ? `**Candidate background:** ${context.resume_text.slice(0, 400)}` : ""}

**Original text:**
${content}

Improve it by:
- Making it clearer and more impactful
- Fixing grammar and flow
- Adding specificity where possible
- Keeping it concise (under 80 words for this section)

Return ONLY the improved text, no preamble or labels.`;

    const polished = await geminiGenerate(prompt, undefined, 0.5, 200);

    return new Response(
      JSON.stringify({ polished: polished.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("polish-star-section error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
