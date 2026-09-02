// supabase/functions/analyze-test-performance/index.ts — hybrid: database → deterministic → python → AI

import { handleCors } from "../_shared/cors.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  getAdminClient,
  log,
} from "../_shared/utils.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { decideAi, getAiFeaturePolicy } from "../_shared/aiFeaturePolicy.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import { hybridSuccess } from "../_shared/hybridResponse.ts";
import { pythonExecuteOperation } from "../_shared/pythonClient.ts";
import { httpStatusForDomainCode } from "../_shared/domainErrors.ts";

const SYSTEM_PROMPT = `
You are an expert exam coach for competitive exams like JEE, NEET, UPSC, SSC.
Provide structured, actionable analysis. Never output markdown or anything
outside the required format. Always return high‑quality, structured paragraphs.
`;

type AnalyzeHybridData = {
  success: true;
  cached: boolean;
  analysis: string;
};

function asStringList(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, limit);
}

/** Narrative from real test aggregates only — never invent topics/scores. */
function deterministicAnalysisText(input: {
  testName: string;
  totalScore: unknown;
  maxScore: unknown;
  accuracy: unknown;
  attemptPercentage: unknown;
  predictedPercentile: unknown;
  weakTopics: string[];
  strongTopics: string[];
  avgSeconds: unknown;
  timeTrapCount: number;
  correct: number;
  total: number;
  scorePercent: number;
}): string {
  const weak = input.weakTopics;
  const strong = input.strongTopics;
  return [
    "Strengths:",
    strong.length > 0
      ? `You showed strength in: ${strong.join(", ")}. Score ${input.totalScore} / ${input.maxScore} (${input.accuracy}%).`
      : `You scored ${input.scorePercent}% (${input.correct}/${input.total || input.maxScore}). Keep reinforcing what you already answer correctly.`,
    "",
    "Weak Areas:",
    weak.length > 0
      ? `Focus next on: ${weak.join(", ")}.`
      : "Review incorrect items and retry a short mixed set.",
    "",
    "Time Management:",
    `Average seconds/question: ${input.avgSeconds ?? 0}. Time traps flagged: ${input.timeTrapCount}. Attempt rate: ${input.attemptPercentage}%.`,
    "",
    "7-Day Study Plan:",
    weak.length > 0
      ? `Day 1–3: drill ${weak.slice(0, 3).join(", ")}. Day 4–5: mixed review. Day 6: timed mini-test. Day 7: revisit explanations for every incorrect answer.`
      : "Day 1–3: revisit incorrect answers. Day 4–5: mixed practice. Day 6: timed set. Day 7: error log review.",
    "",
    "Exam Strategy:",
    `Predicted percentile signal: ${input.predictedPercentile ?? "n/a"}. Drill weak topics with a 10-question custom practice set, then revisit explanations for every incorrect answer.`,
  ].join("\n");
}

function analysisFromPython(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const summary = String(obj.summary ?? "").trim();
  const weak = asStringList(obj.weak_topics ?? obj.weakTopics);
  const recs = asStringList(obj.recommendations);
  if (!summary && weak.length === 0 && recs.length === 0) return null;
  return [
    "Strengths:",
    summary || "See score summary below.",
    "",
    "Weak Areas:",
    weak.length > 0 ? `Focus next on: ${weak.join(", ")}.` : "Review incorrect items.",
    "",
    "Time Management:",
    "Use recorded attempt timing from your test analytics.",
    "",
    "7-Day Study Plan:",
    recs[0] ?? "Drill weak topics with a 10-question custom practice set",
    "",
    "Exam Strategy:",
    recs[1] ?? "Revisit explanations for every incorrect answer",
  ].join("\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "analyze-test-performance";

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = getAdminClient();

    const rateLimited = await enforceAiRateLimitAsync(db, FN, userId);
    if (rateLimited) return rateLimited;

    const capabilityGate = await requireCapabilityForFunction(
      auth.planId,
      FN,
      req,
    );
    if (capabilityGate) return capabilityGate;

    const body = await parseBody<Record<string, unknown>>(req);
    const test_id = body?.test_id;

    if (!test_id || typeof test_id !== "string") {
      return errorResponse("Missing test_id", "INVALID_REQUEST", 400);
    }

    const { data: analysis, error: aErr } = await db
      .from("test_analyses")
      .select("*")
      .eq("test_id", test_id)
      .eq("user_id", userId)
      .single();

    if (aErr || !analysis) {
      return errorResponse(
        "Test analysis not found. Ensure the test is submitted.",
        "NOT_FOUND",
        404,
      );
    }

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
      return errorResponse(
        "Test must be submitted before analysis.",
        "INVALID_STATE",
        400,
      );
    }

    const cachedAnalysis = String(analysis.ai_analysis_text ?? "").trim();
    if (cachedAnalysis) {
      return hybridSuccess({
        req,
        data: {
          success: true as const,
          cached: true,
          analysis: cachedAnalysis,
        },
        source: "database",
        operationId: crypto.randomUUID(),
        meta: { cached: true },
      });
    }

    const safe = (x: unknown, lim = 300) =>
      typeof x === "string" ? x.slice(0, lim) : JSON.stringify(x).slice(0, lim);

    const subjectBreakdown = JSON.stringify(
      analysis.subject_breakdown ?? {},
      null,
      2,
    ).slice(0, 2000);

    const weakTopics = asStringList(analysis.weak_topics, 20);
    const strongTopics = asStringList(analysis.strong_topics, 20);
    const timeTraps = Array.isArray(analysis.time_analysis?.time_traps)
      ? analysis.time_analysis.time_traps.length
      : 0;

    const maxScore = Number(analysis.max_score) || 0;
    const totalScore = Number(analysis.total_score) || 0;
    const accuracy = Number(analysis.accuracy) || 0;
    const scorePercent = maxScore > 0
      ? Math.round((totalScore / maxScore) * 100)
      : Math.round(accuracy);
    // Approximate correct count from score when item-level counts are absent.
    const correct = maxScore > 0 && totalScore <= maxScore
      ? Math.round(totalScore)
      : 0;
    const total = maxScore > 0 ? Math.round(maxScore) : 0;

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
Time Traps: ${timeTraps}

Write EXACTLY these 5 sections (no markdown headers):

Strengths:
Weak Areas:
Time Management:
7-Day Study Plan:
Exam Strategy:

Use topic and subject names exactly as provided.
`.trim();

    const analysisCost = creditCost("analyze_test_performance");
    const idempotencyKey =
      req.headers.get("x-idempotency-key") ||
      req.headers.get("Idempotency-Key") ||
      null;

    const hybrid = await executeHybridOperation<AnalyzeHybridData>({
      req,
      auth,
      operation: "analyze_test",
      idempotencyKey,
      creditCost: analysisCost,
      creditAction: "analyze_test_performance",
      body: {
        test_id,
        correct,
        total,
        score_percent: scorePercent,
        weak_topics: weakTopics,
      },
      runDatabase: async () => {
        if (!analysis.ai_analysis_text) return null;
        return {
          success: true as const,
          cached: true,
          analysis: String(analysis.ai_analysis_text),
        };
      },
      runDeterministic: async () => {
        const text = deterministicAnalysisText({
          testName: String(test.test_name ?? ""),
          totalScore: analysis.total_score,
          maxScore: analysis.max_score,
          accuracy: analysis.accuracy,
          attemptPercentage: analysis.attempt_percentage,
          predictedPercentile: analysis.predicted_percentile,
          weakTopics,
          strongTopics,
          avgSeconds: analysis.time_analysis?.avg_seconds ?? 0,
          timeTrapCount: timeTraps,
          correct,
          total,
          scorePercent,
        });
        await db
          .from("test_analyses")
          .update({ ai_analysis_text: text })
          .eq("test_id", test_id)
          .eq("user_id", userId);
        return { success: true as const, cached: false, analysis: text };
      },
      runPython: async (ctx) => {
        const py = await pythonExecuteOperation(
          {
            operation: "analyze_test",
            operation_id: ctx.operationId,
            correlation_id: ctx.correlationId,
            user_id: userId,
            payload: {
              correct,
              total,
              score_percent: scorePercent,
              weak_topics: weakTopics,
            },
          },
          { requestId: ctx.correlationId },
        );
        if (!py.ok) return null;
        const envelope = py.json as { data?: unknown } | unknown;
        const raw =
          envelope &&
            typeof envelope === "object" &&
            "data" in (envelope as Record<string, unknown>)
            ? (envelope as { data: unknown }).data
            : envelope;
        const text = analysisFromPython(raw);
        if (!text?.trim()) return null;
        await db
          .from("test_analyses")
          .update({ ai_analysis_text: text })
          .eq("test_id", test_id)
          .eq("user_id", userId);
        return { success: true as const, cached: false, analysis: text };
      },
      runAi: async () => {
        const policy = getAiFeaturePolicy("analyze_test");
        const decision = decideAi({
          feature: policy.feature,
          needed: true,
          permitted: policy.aiAllowed,
        });
        if (decision !== "AI_REQUIRED") {
          throw new Error("AI not required");
        }
        const aiResult = await generateWithFallback({
          prompt,
          systemPrompt: SYSTEM_PROMPT,
          maxTokens: policy.maxOutputTokens,
          temperature: 0.7,
          userId,
          action: "analyze_test",
          skipSecondaryOnQuota: policy.skipSecondaryOnQuota,
        });
        if (!aiResult?.text) {
          throw new Error("AI model failure");
        }
        const analysisText = aiResult.text;
        await db
          .from("test_analyses")
          .update({ ai_analysis_text: analysisText })
          .eq("test_id", test_id)
          .eq("user_id", userId);
        return {
          success: true as const,
          cached: false,
          analysis: analysisText,
        };
      },
    });

    if (!hybrid.ok) {
      if (
        hybrid.code === "INSUFFICIENT_CREDITS" ||
        hybrid.code === "CAPABILITY_REQUIRED"
      ) {
        return hybrid.response;
      }
      const status = httpStatusForDomainCode(
        String(hybrid.code || "AI_PROVIDER_UNAVAILABLE"),
      );
      const invalidAi = hybrid.code === "AI_INVALID_OUTPUT";
      return errorResponse(
        invalidAi
          ? "Test analysis AI output was invalid. Credits refunded."
          : "Test analysis failed. Credits refunded.",
        String(hybrid.code || "AI_PROVIDER_UNAVAILABLE"),
        status,
      );
    }

    log(FN, "info", "Test performance analysis generated", {
      userId,
      test_id,
      source: hybrid.source,
      cached: hybrid.data.cached,
    });

    return hybrid.response;
  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "analyze-test-performance error", err);
    return errorResponse("Internal error", "INTERNAL_ERROR", 500);
  }
});
