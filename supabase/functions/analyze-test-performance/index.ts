import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// analyze-test-performance
// Verifies JWT, then generates AI analysis for a completed test.
// Costs 3 credits. Saves to test_analyses.ai_analysis_text.
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert exam coach specializing in competitive exams
like JEE, NEET, UPSC, and SSC. Analyze the student's test performance and provide
a structured, actionable report. Be specific, encouraging, and practical.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ── Verify JWT ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const db = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { test_id } = await req.json();
    if (!test_id) {
      return new Response(JSON.stringify({ error: "Missing test_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch analysis — ownership enforced ───────────────────────
    const { data: analysis, error: aErr } = await db
      .from("test_analyses")
      .select("*")
      .eq("test_id", test_id)
      .eq("user_id", userId)     // ownership check
      .single();

    if (aErr || !analysis) {
      return new Response(
        JSON.stringify({ error: "Test analysis not found. Submit the test first." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If already has AI analysis, return cached
    if (analysis.ai_analysis_text) {
      return new Response(
        JSON.stringify({ success: true, analysis: analysis.ai_analysis_text, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Deduct 3 credits ──────────────────────────────────────────
    const credited = await deductCredits(db, userId, 3, "AI test analysis");
    if (!credited) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits. AI analysis costs 3 credits." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch test config ─────────────────────────────────────────
    const { data: test } = await db
      .from("mock_tests")
      .select("test_name, config, submitted_at")
      .eq("id", test_id)
      .eq("user_id", userId)
      .single();

    const prompt = `Analyze this student's mock test performance and write a comprehensive 600-word coaching report.

TEST: ${test?.test_name ?? "Mock Test"}
Score: ${analysis.total_score} / ${analysis.max_score} (${analysis.accuracy}% accuracy)
Attempt Rate: ${analysis.attempt_percentage}%
Predicted Percentile: ~${analysis.predicted_percentile}th

SUBJECT BREAKDOWN:
${JSON.stringify(analysis.subject_breakdown, null, 2)}

WEAK TOPICS (accuracy < 50%): ${(analysis.weak_topics ?? []).join(", ") || "None identified"}
STRONG TOPICS (accuracy > 80%): ${(analysis.strong_topics ?? []).join(", ") || "None identified"}

TIME ANALYSIS:
Average time per question: ${analysis.time_analysis?.avg_seconds ?? 0} seconds
Time traps (unusually slow questions): ${(analysis.time_analysis?.time_traps ?? []).length}

Write a structured report with EXACTLY these 5 sections using these exact headers:

## Strengths
(What the student did well — be specific about topics and subjects)

## Weak Areas
(Specific topics needing improvement, with why they matter for the exam)

## Time Management
(Analysis of pacing, time traps, and recommended time per question)

## 7-Day Study Plan
(Day-by-day specific actions to address weak areas before the next test)

## Exam Strategy
(Tactical advice for the next attempt — question order, elimination strategies, marking scheme tips)

Be specific, encouraging, and actionable. Use the actual topic and subject names from the data.`;

    const analysisText = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 2048);

    // ── Save to test_analyses ─────────────────────────────────────
    await db
      .from("test_analyses")
      .update({ ai_analysis_text: analysisText })
      .eq("test_id", test_id)
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ success: true, analysis: analysisText, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[analyze-test-performance] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
