// analyze-test-performance/index.ts — FIXED VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

const SYSTEM_PROMPT = `
You are an expert exam coach for competitive exams like JEE, NEET, UPSC, SSC.
Provide structured, actionable analysis. Never output markdown or anything
outside the required format. Always return high‑quality, structured paragraphs.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ----------------------------------
       AUTHENTICATION (SAFEST VERSION)
    ---------------------------------- */

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const db = createServiceClient();

    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = user.id;

    /* ----------------------------------
       VALIDATE BODY
    ---------------------------------- */

    const body = await req.json();
    const { test_id } = body ?? {};

    if (!test_id) {
      return new Response(JSON.stringify({ error: "Missing test_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    /* ----------------------------------
       OWNERSHIP CHECK: test_analyses
    ---------------------------------- */

    const { data: analysis, error: aErr } = await db
      .from("test_analyses")
      .select("*")
      .eq("test_id", test_id)
      .eq("user_id", userId)
      .single();

    if (aErr || !analysis) {
      return new Response(
        JSON.stringify({
          error: "Test analysis not found. Ensure the test is submitted.",
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    /* ----------------------------------
       RETURN CACHED ANALYSIS IF EXISTS
    ---------------------------------- */

    if (analysis.ai_analysis_text) {
      return new Response(
        JSON.stringify({
          success: true,
          cached: true,
          analysis: analysis.ai_analysis_text,
        }),
        { headers: corsHeaders }
      );
    }

    /* ----------------------------------
       FETCH TEST CONFIG & VALIDATE
    ---------------------------------- */

    const { data: test, error: tErr } = await db
      .from("mock_tests")
      .select("test_name, config, submitted_at")
      .eq("id", test_id)
      .eq("user_id", userId)
      .single();

    if (tErr || !test) {
      return new Response(JSON.stringify({ error: "Test not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (!test.submitted_at) {
      return new Response(
        JSON.stringify({ error: "Test must be submitted before analysis." }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* ----------------------------------
       SANITIZE ANALYSIS OBJECT
    ---------------------------------- */

    const safe = (x: any, lim = 300) =>
      typeof x === "string" ? x.slice(0, lim) : JSON.stringify(x).slice(0, lim);

    const subjectBreakdown = JSON.stringify(
      analysis.subject_breakdown ?? {},
      null,
      2
    ).slice(0, 2000);

    const weakTopics = (analysis.weak_topics ?? []).slice(0, 20);
    const strongTopics = (analysis.strong_topics ?? []).slice(0, 20);

    /* ----------------------------------
       BUILD PROMPT SAFELY
    ---------------------------------- */

    const prompt = `
Analyze the student's test performance. Write a structured,
actionable 600-word coaching report.

TEST: ${safe(test.test_name, 200)}
Score: ${analysis.total_score} / ${analysis.max_score} (${analysis.accuracy}%)
Attempt Rate: ${analysis.attempt_percentage}%
Predicted Percentile: ${analysis.predicted_percentile}

SUBJECT BREAKDOWN:
${subjectBreakdown}

WEAK TOPICS: ${weakTopics.join(", ") || "None"}
STRONG TOPICS: ${strongTopics.join(", ") || "None"}

TIME ANALYSIS:
Average seconds/question: ${analysis.time_analysis?.avg_seconds ?? 0}
Time Traps: ${(analysis.time_analysis?.time_traps ?? []).length}

Write EXACTLY these 5 sections (no markdown headers):

Strengths:
Weak Areas:
Time Management:
7-Day Study Plan:
Exam Strategy:

Use topic and subject names exactly as provided.
`.trim();

    /* ----------------------------------
       CREDIT DEDUCTION (SAFE)
    ---------------------------------- */

    const creditResult = await deductCredits(userId, "ai_test_analysis", 3);
    if (!creditResult.success) {
      return new Response(
        JSON.stringify({
          error: "Insufficient credits. AI analysis costs 3 credits.",
        }),
        { status: 402, headers: corsHeaders }
      );
    }

    /* ----------------------------------
       CALL GEMINI (WITH RETRY)
    ---------------------------------- */

    async function runAI() {
      return geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 2048).catch(() => null);
    }

    let analysisText = await runAI();
    if (!analysisText) analysisText = await runAI(); // retry once

    if (!analysisText) {
      // refund credits if both attempts failed
      await deductCredits(userId, "refund_ai_test_analysis", -3);
      return new Response(JSON.stringify({ error: "AI model failure" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    /* ----------------------------------
       SAVE ANALYSIS
    ---------------------------------- */

    await db
      .from("test_analyses")
      .update({ ai_analysis_text: analysisText })
      .eq("test_id", test_id)
      .eq("user_id", userId);

    /* ----------------------------------
       RETURN SUCCESS
    ---------------------------------- */

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        analysis: analysisText,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[analyze-test-performance] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
