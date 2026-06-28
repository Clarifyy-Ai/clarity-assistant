// supabase/functions/analyze-test-performance/index.ts — PRODUCTION READY (ALL FEATURES PRESERVED)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { 
  requireAuth, 
  parseBody, 
  errorResponse, 
  deductCredits, 
  callAI, 
  getAdminClient, 
  log 
} from "../_shared/utils.ts";

const SYSTEM_PROMPT = `
You are an expert exam coach for competitive exams like JEE, NEET, UPSC, SSC.
Provide structured, actionable analysis. Never output markdown or anything
outside the required format. Always return high‑quality, structured paragraphs.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  
  const FN = "analyze-test-performance";

  try {
    /* ----------------------------------
       AUTHENTICATION
    ---------------------------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = getAdminClient();

    /* ----------------------------------
       VALIDATE BODY
    ---------------------------------- */
    const body = await parseBody<any>(req);
    const { test_id } = body ?? {};

    if (!test_id) {
      return errorResponse("Missing test_id", "INVALID_REQUEST", 400);
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
      return errorResponse("Test analysis not found. Ensure the test is submitted.", "NOT_FOUND", 404);
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
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
      return errorResponse("Test not found", "NOT_FOUND", 404);
    }

    if (!test.submitted_at) {
      return errorResponse("Test must be submitted before analysis.", "INVALID_STATE", 400);
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
    const analysisCost = creditCost("analyze_test_performance");
    const creditResult = await deductCredits(userId, "analyze_test_performance" as any, analysisCost);
    if (!creditResult.success) {
      return errorResponse(`Insufficient credits. AI analysis costs ${analysisCost} credits.`, "INSUFFICIENT_CREDITS", 402);
    }

    /* ----------------------------------
       CALL AI (WITH RETRY)
    ---------------------------------- */
    async function runAI() {
      return callAI({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        maxTokens: 2048,
        temperature: 0.7
      }).catch(() => null);
    }

    let aiResult = await runAI();
    if (!aiResult) aiResult = await runAI(); // retry once

    if (!aiResult) {
      // refund credits if both attempts failed
      await deductCredits(userId, "refund_ai_test_analysis" as any, -analysisCost);
      return errorResponse("AI model failure", "AI_ERROR", 500);
    }

    const analysisText = aiResult.text;

    /* ----------------------------------
       SAVE ANALYSIS
    ---------------------------------- */
    await db
      .from("test_analyses")
      .update({ ai_analysis_text: analysisText })
      .eq("test_id", test_id)
      .eq("user_id", userId);

    log(FN, "info", "Test performance analysis generated", { userId, test_id });

    /* ----------------------------------
       RETURN SUCCESS
    ---------------------------------- */
    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        analysis: analysisText,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "analyze-test-performance error", err);
    return errorResponse("Internal error", "INTERNAL_ERROR", 500);
  }
});
