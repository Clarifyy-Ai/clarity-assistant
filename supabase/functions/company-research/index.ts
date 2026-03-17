import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// company-research — AI company interview brief
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { company, role, user_id } = await req.json();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Missing company name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user_id) {
      const ok = await deductCredits(db, user_id, 8, "company_research");
      if (!ok) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const prompt = `
Generate a comprehensive interview preparation brief for a candidate
interviewing at ${company}${role ? ` for a ${role} role` : ""}.

Return ONLY valid JSON:
{
  "overview": "<3-4 sentence company overview: what they do, size, mission>",
  "industry": "<industry/sector>",
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "interview_process": [
    "<step 1>",
    "<step 2>",
    "<step 3>",
    "<step 4>"
  ],
  "questions": [
    "<likely question 1>",
    "<likely question 2>",
    "<likely question 3>",
    "<likely question 4>",
    "<likely question 5>",
    "<likely question 6>",
    "<likely question 7>",
    "<likely question 8>"
  ],
  "values": ["<core value 1>", "<core value 2>", "<core value 3>", "<core value 4>"],
  "tips": [
    "<insider tip 1>",
    "<insider tip 2>",
    "<insider tip 3>"
  ],
  "watch_outs": [
    "<common mistake 1>",
    "<common mistake 2>"
  ]
}

Make the questions highly specific to ${company}'s known interview style${role ? ` and a ${role} role` : ""}.
Include both behavioural and technical/role-specific questions.`;

    const raw  = await geminiGenerate(prompt, undefined, 0.5, 2000);
    const data = parseJSON(raw, {
      overview:          `${company} is a leading company in its industry.`,
      industry:          "Technology",
      tags:              [],
      interview_process: [],
      questions:         [],
      values:            [],
      tips:              [],
      watch_outs:        [],
    });

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("company-research error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
