// generate-debrief/index.ts — FIXED, SECURE, PRODUCTION READY

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

const SYSTEM = `
You are a world‑class interview coach.
Provide deep, structured, personalized post‑session debriefs.
Be honest but encouraging.
Return ONLY valid JSON.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const db = createServiceClient();

    /* -----------------------------------------------------------
       1. AUTHENTICATE USER
    ----------------------------------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: uErr } = await db.auth.getUser(token);

    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authenticatedUserId = user.id;

    /* -----------------------------------------------------------
       2. VALIDATE INPUT
    ----------------------------------------------------------- */
    const body = await req.json().catch(() => null);

    if (!body || typeof body.session_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const session_id = body.session_id.trim();

    if (!session_id) {
      return new Response(JSON.stringify({ error: "Invalid session_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    /* -----------------------------------------------------------
       3. FETCH SESSION (and validate ownership)
    ----------------------------------------------------------- */
    const { data: session, error: sErr } = await db
      .from("sessions")
      .select("*")
      .eq("id", session_id)
      .eq("user_id", authenticatedUserId)
      .single();

    if (sErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    /* -----------------------------------------------------------
       4. FETCH ANSWERS (ensure ownership)
    ----------------------------------------------------------- */
    const { data: answers, error: aErr } = await db
      .from("session_answers")
      .select("*")
      .eq("session_id", session_id)
      .eq("user_id", authenticatedUserId) // VERY important
      .order("question_index");

    if (aErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch answers" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    /* -----------------------------------------------------------
       5. DEDUCT CREDITS SAFELY (10 credits)
       Use new signature: deductCredits(userId, action, cost)
    ----------------------------------------------------------- */
    const creditResult = await deductCredits(
      authenticatedUserId,
      "debrief_generation",
      10
    );

    if (!creditResult.success) {
      return new Response(JSON.stringify({
        error: "Insufficient credits",
      }), {
        status: 402,
        headers: corsHeaders,
      });
    }

    /* -----------------------------------------------------------
       6. BUILD SAFE PROMPT (sanitize + slice)
    ----------------------------------------------------------- */
    const safe = (t: any) =>
      String(t ?? "")
        .replace(/\u0000/g, "")
        .slice(0, 800);

    const safeTranscript = (t: string) =>
      String(t ?? "")
        .replace(/\u0000/g, "")
        .slice(0, 400);

    const answerSummary = (answers ?? [])
      .map((a: any, i: number) => {
        return `
Q${i + 1}: ${safe(a.question_text)}
Answer: ${safeTranscript(a.transcript)}
Score: ${a.score ?? "N/A"}
      `.trim();
      })
      .join("\n\n");

    const prompt = `
Analyze this full interview session and produce a JSON debrief.

Session info:
Type: ${safe(session.session_type)}
Target company: ${safe(session.target_company)}
Overall score: ${session.overall_score ?? "N/A"}
Total questions: ${answers?.length ?? 0}
Avg WPM: ${session.avg_wpm ?? "N/A"}
Total filler words: ${session.total_filler_words ?? 0}

Question-by-question:
${answerSummary}

Return ONLY valid JSON in this exact schema:
{
  "overall_grade": "A+|A|B+|B|C+|C|D",
  "summary": "",
  "insight": "",
  "priority_focus": "",
  "strengths": [],
  "improvements": [],
  "skill_gaps": [
    { "skill": "", "current": 1, "target": 10, "note": "" }
  ],
  "action_plan": [
    { "day": 1, "title": "", "description": "", "time_estimate": "" }
  ],
  "resources": [
    { "title": "", "type": "", "description": "", "url": "" }
  ],
  "next_session_goals": []
}
`.trim();

    /* -----------------------------------------------------------
       7. CALL GEMINI (safe + retry)
    ----------------------------------------------------------- */
    const callAI = () =>
      geminiGenerate(prompt, SYSTEM, 0.4, 3000).catch(() => null);

    let raw = await callAI();
    if (!raw) raw = await callAI(); // retry once

    if (!raw) {
      // refund credits
      await deductCredits(authenticatedUserId, "refund_debrief_generation", -10);

      return new Response(
        JSON.stringify({ error: "AI service failed" }),
        { status: 500, headers: corsHeaders }
      );
    }

    /* -----------------------------------------------------------
       8. SAFE JSON PARSING
    ----------------------------------------------------------- */
    const parsed = parseJSON(raw, {
      overall_grade: "C",
      summary: "Unable to generate debrief.",
      insight: "",
      priority_focus: "",
      strengths: [],
      improvements: [],
      skill_gaps: [],
      action_plan: [],
      resources: [],
      next_session_goals: [],
    });

    /* -----------------------------------------------------------
       9. SAVE TO DB
    ----------------------------------------------------------- */
    const { data: debrief, error: dErr } = await db
      .from("session_debriefs")
      .insert({
        session_id,
        user_id: authenticatedUserId,
        ...parsed,
      })
      .select()
      .single();

    if (dErr) {
      console.error("DB save error:", dErr);

      return new Response(
        JSON.stringify({ error: "Failed to save debrief" }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ debrief, session }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("generate-debrief error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
``
