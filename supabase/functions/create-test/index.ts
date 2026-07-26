// supabase/functions/create-test/index.ts
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient, deductCredits, refundCredits } from "../_shared/supabase.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

const CREATE_TEST_CREDIT_COST = creditCost("create_mock_test");

function jsonResponse(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function sanitizeString(value: unknown, maxLength = 200, fallback = ""): string {
  const result = String(value ?? fallback).trim();
  return result.slice(0, maxLength);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function normalizeQuestionIds(input: unknown, limit = 200): string[] {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, limit);

  return [...new Set(ids)];
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("create-test", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(req, { error: "Invalid JSON body" }, 400);
    }

    const config = typeof body.config === "object" && body.config ? body.config : {};

    const testName = sanitizeString(
      body.test_name ?? config.test_name ?? "Mock Test",
      200,
      "Mock Test"
    );

    const questionIds = normalizeQuestionIds(
      body.question_ids ?? config.question_ids ?? [],
      200
    );

    if (questionIds.length === 0) {
      return jsonResponse(req, { error: "No question IDs provided" }, 400);
    }

    const examType = sanitizeString(config.exam_type ?? body.exam_type ?? "CUSTOM", 50, "CUSTOM");
    const subjects = Array.isArray(config.subjects)
      ? config.subjects.map((s: unknown) => sanitizeString(s, 100)).filter(Boolean)
      : [];

    const difficultyDistribution =
      typeof config.difficulty_distribution === "object" && config.difficulty_distribution
        ? config.difficulty_distribution
        : { EASY: 20, MEDIUM: 60, HARD: 20 };

    const timeLimitMinutes = clampNumber(
      config.duration_minutes ?? body.time_limit_minutes ?? 60,
      0,
      360,
      60
    );

    const shuffleQuestions =
      typeof config.randomize_order === "boolean"
        ? config.randomize_order
        : typeof body.shuffle_questions === "boolean"
        ? body.shuffle_questions
        : true;

    const shuffleOptions =
      typeof config.shuffle_options === "boolean"
        ? config.shuffle_options
        : typeof body.shuffle_options === "boolean"
        ? body.shuffle_options
        : true;

    const marksPositive = clampNumber(config.marks_positive ?? 4, 0, 100, 4);
    const marksNegative = clampNumber(config.marks_negative ?? 1, 0, 100, 1);

    const creditResult = await deductCredits(
      user.id,
      "create_mock_test",
      CREATE_TEST_CREDIT_COST
    );

    if (!creditResult?.success) {
      return jsonResponse(
        req,
        { error: "Insufficient credits to create test" },
        402
      );
    }

    const finalConfig = {
      ...(typeof config === "object" ? config : {}),
      exam_type: examType,
      subjects,
      difficulty_distribution: difficultyDistribution,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      marks_positive: marksPositive,
      marks_negative: marksNegative,
      duration_minutes: timeLimitMinutes,
    };

    const { data: test, error: insertErr } = await db
      .from("mock_tests")
      .insert({
        user_id: user.id,
        test_name: testName,
        question_ids: questionIds,
        time_limit_minutes: timeLimitMinutes || null,
        config: finalConfig,
        status: "DRAFT",
      })
      .select()
      .single();

    if (insertErr || !test) {
      console.error("[create-test] Insert error:", insertErr);
      // Refund credits — test was never created
      await refundCredits({
        userId: user.id,
        cost: CREATE_TEST_CREDIT_COST,
        reason: "refund_create_mock_test",
      }).catch((e) => console.error("[create-test] Refund failed:", e));
      return jsonResponse(req, { error: "Failed to create test" }, 500);
    }

    return jsonResponse(req, {
      test_id: test.id,
      test,
      question_count: questionIds.length,
    });
  } catch (err) {
    console.error("[create-test] Error:", err);
    return jsonResponse(
      req,
      { error: "Internal server error" },
      500
    );
  }
});
