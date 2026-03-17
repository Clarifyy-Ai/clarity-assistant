import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// generate-debrief — full post-session AI debrief
// Analyses all answers, generates grade, action plan, resources
// ─────────────────────────────────────────────────────────────────

const SYSTEM = `You are a world-class interview coach. Provide
deep, personalised post-session debriefs. Be honest but encouraging.
Always respond with valid JSON.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { session_id, user_id } = await req.json();

    if (!session_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing session_id or user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch session + answers
    const [{ data: session }, { data: answers }] = await Promise.all([
      db.from("sessions").select("*").eq("id", session_id).single(),
      db.from("session_answers").select("*").eq("session_id", session_id)
        .order("question_index"),
    ]);

    if (!session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct credits
    const ok = await deductCredits(db, user_id, 10, "debrief_generation");
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from answers
    const answerSummary = (answers ?? []).map((a: any, i: number) =>
      `Q${i + 1}: ${a.question_text}\nAnswer: ${a.transcript?.slice(0, 400) ?? "No response"}\nScore: ${a.score ?? "N/A"}`
    ).join("\n\n");

    const prompt = `
Analyse this complete interview session and generate a detailed debrief.

**Session info:**
- Type: ${session.session_type}
- Target company: ${session.target_company ?? "not specified"}
- Overall score: ${session.overall_score ?? "N/A"}
- Total questions: ${answers?.length ?? 0}
- Avg WPM: ${session.avg_wpm ?? "N/A"}
- Total filler words: ${session.total_filler_words ?? 0}

**Question-by-question summary:**
${answerSummary}

Return ONLY valid JSON:
{
  "overall_grade": "<A+|A|B+|B|C+|C|D>",
  "summary": "<2-3 sentence overall assessment>",
  "insight": "<One powerful insight or observation>",
  "priority_focus": "<The single most important thing to improve>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "skill_gaps": [
    {
      "skill": "<skill name>",
      "current": <1-10>,
      "target": <1-10>,
      "note": "<brief note>"
    }
  ],
  "action_plan": [
    {
      "day": <1-7>,
      "title": "<action title>",
      "description": "<what to do>",
      "time_estimate": "<e.g. 30 min>"
    }
  ],
  "resources": [
    {
      "title": "<resource title>",
      "type": "<video|book|article|course>",
      "description": "<why this helps>",
      "url": "<optional URL>"
    }
  ],
  "next_session_goals": ["<goal 1>", "<goal 2>", "<goal 3>"]
}`;

    const raw    = await geminiGenerate(prompt, SYSTEM, 0.4, 3000);
    const parsed = parseJSON(raw, {
      overall_grade:      "C",
      summary:            "Unable to generate debrief.",
      insight:            "",
      priority_focus:     "",
      strengths:          [],
      improvements:       [],
      skill_gaps:         [],
      action_plan:        [],
      resources:          [],
      next_session_goals: [],
    });

    // Save to DB
    const { data: debrief } = await db
      .from("session_debriefs")
      .insert({
        session_id,
        user_id,
        overall_grade:      parsed.overall_grade,
        summary:            parsed.summary,
        insight:            parsed.insight,
        priority_focus:     parsed.priority_focus,
        strengths:          parsed.strengths,
        improvements:       parsed.improvements,
        skill_gaps:         parsed.skill_gaps,
        action_plan:        parsed.action_plan,
        resources:          parsed.resources,
        next_session_goals: parsed.next_session_goals,
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({ debrief, session }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("generate-debrief error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
