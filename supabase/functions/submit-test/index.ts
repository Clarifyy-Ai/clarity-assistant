// supabase/functions/submit-test/index.ts
// PRODUCTION-READY VERSION

import {
  handleCors,
  requireAuth,
  parseBody,
  successResponse,
  errorResponse,
  log,
} from "../_shared/utils.ts";
import { createServiceClient, getIdempotentResponse, storeIdempotentResponse } from "../_shared/supabase.ts";
import { withBrowserCors } from "../_shared/cors.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { recomputeTopicMasteryFromAttempt } from "../_shared/recomputeTopicMastery.ts";
import { isExamExpired } from "../_shared/examTimer.ts";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type NormalizedQuestionType =
  | "MCQ"
  | "NUMERICAL"
  | "MULTI_SELECT"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "CODING";

interface QuestionRow {
  id: string;
  question_type: string | null;
  correct_answer: unknown;
  marks_positive: number | null;
  marks_negative: number | null;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  exam_type: string | null;
}

interface ResponseRow {
  question_id: string;
  user_answer: unknown;
  is_attempted: boolean | null;
  time_spent_seconds: number | null;
}

interface SubjectBreakdown {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
  marks: number;
}

interface TopicBreakdown {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
  avg_time: number;
  subject: string;
}

interface TimeTrap {
  question_id: string;
  time_seconds: number;
}

/* -------------------------------------------------------------------------- */
/*                                   UTILS                                    */
/* -------------------------------------------------------------------------- */

const FN = "submit-test";

function normalizeQuestionType(raw: unknown): NormalizedQuestionType {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();

  if (value === "MCQ") return "MCQ";
  if (value === "NUMERIC" || value === "NUMERICAL") return "NUMERICAL";
  if (value === "MULTI_SELECT" || value === "MULTI-SELECT") return "MULTI_SELECT";
  if (value === "TRUE_FALSE" || value === "TRUE/FALSE" || value === "BOOLEAN") return "TRUE_FALSE";
  if (value === "CODE" || value === "CODING") return "CODING";
  return "SHORT_ANSWER";
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => safeString(v))
      .filter(Boolean)
      .map((v) => v.toLowerCase())
      .sort();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Try JSON array
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((v) => safeString(v))
            .filter(Boolean)
            .map((v) => v.toLowerCase())
            .sort();
        }
      } catch {
        // ignore parse failure
      }
    }

    // fallback comma-separated
    return trimmed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => v.toLowerCase())
      .sort();
  }

  return [];
}

function normalizeAnswer(answer: unknown): string | string[] | number | null {
  if (answer === null || answer === undefined) return null;

  if (Array.isArray(answer)) {
    return answer.map((v) => safeString(v)).filter(Boolean);
  }

  if (typeof answer === "number") return answer;

  if (typeof answer === "string") {
    const trimmed = answer.trim();
    if (!trimmed) return null;

    // Try JSON array
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => safeString(v)).filter(Boolean);
        }
      } catch {
        // ignore
      }
    }

    // Numeric string
    const num = Number(trimmed);
    if (!Number.isNaN(num) && trimmed !== "") {
      // preserve numbers only when it looks numeric
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) return num;
    }

    return trimmed;
  }

  return safeString(answer) || null;
}

function isEmptyAnswer(answer: unknown): boolean {
  if (answer === null || answer === undefined) return true;
  if (typeof answer === "string") return answer.trim() === "";
  if (Array.isArray(answer)) return answer.length === 0;
  return false;
}

function compareStrings(a: unknown, b: unknown): boolean {
  return safeString(a).toLowerCase() === safeString(b).toLowerCase();
}

function compareNumbers(a: unknown, b: unknown, tolerance = 1e-6): boolean {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function scoreQuestion(
  question: QuestionRow,
  response: ResponseRow
): { correct: boolean; score: number } {
  const positive = safeNumber(question.marks_positive, 4);
  const negative = safeNumber(question.marks_negative, 1);

  const attempted = Boolean(response.is_attempted) && !isEmptyAnswer(response.user_answer);
  if (!attempted) {
    return { correct: false, score: 0 };
  }

  const qType = normalizeQuestionType(question.question_type);
  const userAnswer = normalizeAnswer(response.user_answer);
  const correctAnswer = normalizeAnswer(question.correct_answer);

  if (qType === "MCQ" || qType === "TRUE_FALSE" || qType === "SHORT_ANSWER" || qType === "CODING") {
    const isCorrect = compareStrings(userAnswer, correctAnswer);
    return isCorrect
      ? { correct: true, score: positive }
      : { correct: false, score: -negative };
  }

  if (qType === "NUMERICAL") {
    const isCorrect = compareNumbers(userAnswer, correctAnswer);
    return isCorrect
      ? { correct: true, score: positive }
      : { correct: false, score: -negative };
  }

  if (qType === "MULTI_SELECT") {
    const ua = normalizeStringArray(userAnswer);
    const ca = normalizeStringArray(correctAnswer);
    const isCorrect =
      ua.length === ca.length && ua.every((value, index) => value === ca[index]);

    return isCorrect
      ? { correct: true, score: positive }
      : { correct: false, score: -negative };
  }

  return { correct: false, score: 0 };
}

async function completeTestFallback(
  db: ReturnType<typeof createServiceClient>,
  args: {
    test_id: string;
    user_id: string;
    total_score: number;
    max_score: number;
    accuracy: number;
    attempt_percentage: number;
    subject_breakdown: Record<string, SubjectBreakdown>;
    topic_breakdown: Record<string, TopicBreakdown>;
    weak_topics: string[];
    strong_topics: string[];
    time_analysis: { avg_seconds: number; time_traps: TimeTrap[] };
    predicted_percentile: number | null;
    rank_status?: string;
  }
) {
  const now = new Date().toISOString();

  const updateTest = await db
    .from("mock_tests")
    .update({
      status: "COMPLETED",
      submitted_at: now,
      attempt_phase: "RESULT_AVAILABLE",
      rank_status: "unavailable",
      evaluation_version: 1,
      overall_score: args.total_score,
    })
    .eq("id", args.test_id)
    .eq("user_id", args.user_id)
    .neq("status", "COMPLETED");

  if (updateTest.error) {
    throw updateTest.error;
  }

  const upsertAnalysis = await db
    .from("test_analyses")
    .upsert(
      {
        test_id: args.test_id,
        user_id: args.user_id,
        total_score: args.total_score,
        max_score: args.max_score,
        accuracy: args.accuracy,
        attempt_percentage: args.attempt_percentage,
        subject_breakdown: args.subject_breakdown,
        topic_breakdown: args.topic_breakdown,
        weak_topics: args.weak_topics,
        strong_topics: args.strong_topics,
        time_analysis: args.time_analysis,
        predicted_percentile: args.predicted_percentile,
      },
      { onConflict: "test_id" }
    )
    .select()
    .single();

  if (upsertAnalysis.error) {
    throw upsertAnalysis.error;
  }

  return upsertAnalysis.data;
}

async function updateTopicPerformanceBestEffort(
  db: ReturnType<typeof createServiceClient>,
  params: {
    userId: string;
    topic: string;
    subject: string;
    examType: string;
    attempted: number;
    correct: number;
    avgTimeSeconds: number | null;
  }
) {
  const payloads = [
    {
      p_user_id: params.userId,
      p_topic: params.topic,
      p_subject: params.subject,
      p_exam_type: params.examType,
      p_attempted_delta: params.attempted,
      p_correct_delta: params.correct,
      p_avg_time_seconds: params.avgTimeSeconds,
    },
    {
      p_topic: params.topic,
      p_subject: params.subject,
      p_exam_type: params.examType,
      p_attempted_delta: params.attempted,
      p_correct_delta: params.correct,
      p_avg_time_seconds: params.avgTimeSeconds,
    },
  ];

  for (const rpcArgs of payloads) {
    const { error } = await db.rpc("update_topic_performance", rpcArgs);
    if (!error) return;
  }

  // Best-effort fallback to direct upsert if table/unique key allows it.
  // Fail silently if schema differs.
  try {
    const { data: existing } = await db
      .from("user_topic_performance")
      .select("user_id, topic, subject, accuracy, total_attempted, total_correct")
      .eq("user_id", params.userId)
      .eq("topic", params.topic)
      .maybeSingle();

    const prevAttempted = safeNumber(existing?.total_attempted, 0);
    const prevCorrect = safeNumber(existing?.total_correct, 0);
    const totalAttempted = prevAttempted + params.attempted;
    const totalCorrect = prevCorrect + params.correct;
    const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    await db.from("user_topic_performance").upsert(
      {
        user_id: params.userId,
        topic: params.topic,
        subject: params.subject,
        accuracy,
        total_attempted: totalAttempted,
        total_correct: totalCorrect,
        last_practiced: new Date().toISOString(),
      },
      { onConflict: "user_id,topic" }
    );
  } catch {
    // ignore fallback failure
  }
}

/* -------------------------------------------------------------------------- */
/*                                   HANDLER                                  */
/* -------------------------------------------------------------------------- */

Deno.serve(withBrowserCors("submit-test", async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = createServiceClient();

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("submit-test", auth.userId),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await parseBody<{ test_id: string; idempotencyKey?: string }>(req);
    const testId = safeString(body?.test_id);
    const clientKey = safeString(body?.idempotencyKey);
    const submitKey =
      clientKey || (testId ? `submit:${testId}` : "");
    const durableKey =
      testId && userId
        ? `submit_test:${userId}:${testId}`.slice(0, 150)
        : "";

    if (!testId) {
      return errorResponse("Missing test_id", "VALIDATION_ERROR", 400, req);
    }

    log(FN, "info", "submit accepted", { testId, submitKey: submitKey || "none" });

    if (durableKey) {
      const prior = await getIdempotentResponse(db, durableKey, {
        userId,
        action: "submit_test",
      });
      if (prior?.success === true && prior.payload && typeof prior.payload === "object") {
        return successResponse(prior.payload as Record<string, unknown>, undefined, 200, req);
      }
    }

    /* -------------------------- FETCH TEST -------------------------- */
    const { data: testRaw, error: testErr } = await db
      .from("mock_tests")
      .select("id, config, question_ids, status, started_at, time_limit_minutes, expires_at")
      .eq("id", testId)
      .eq("user_id", userId)
      .single();

    if (testErr || !testRaw) {
      return errorResponse("Test not found or access denied", "NOT_FOUND", 404, req);
    }

    const timedOut = isExamExpired(
      testRaw.started_at as string | null,
      testRaw.time_limit_minutes as number | null,
      Date.now(),
      2_000,
      testRaw.expires_at as string | null,
    );

    if (testRaw.status === "COMPLETED") {
      const { data: existing } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", testId)
        .maybeSingle();

      const alreadyPayload = {
        success: true,
        already_completed: true,
        expired: timedOut,
        analysis: existing ?? null,
      };
      if (durableKey) {
        await storeIdempotentResponse(
          db,
          durableKey,
          { success: true, credits: 0, balance: 0, payload: alreadyPayload },
          { userId, action: "submit_test" },
        ).catch(() => {});
      }

      return successResponse(alreadyPayload, undefined, 200, req);
    }

    const questionIds = Array.isArray(testRaw.question_ids)
      ? [...new Set(testRaw.question_ids.map((id: unknown) => safeString(id)).filter(Boolean))]
      : [];

    if (questionIds.length === 0) {
      return errorResponse("Test has no questions", "VALIDATION_ERROR", 400, req);
    }

    /* -------------------- FETCH QUESTIONS & RESPONSES -------------------- */
    const [responseResult, questionResult] = await Promise.all([
      db
        .from("test_responses")
        .select("question_id, user_answer, is_attempted, time_spent_seconds")
        .eq("test_id", testId)
        .eq("user_id", userId),
      db
        .from("questions")
        .select(
          "id, question_type, correct_answer, marks_positive, marks_negative, subject, topic, difficulty, exam_type"
        )
        .in("id", questionIds),
    ]);

    if (responseResult.error) {
      return errorResponse("Failed to fetch test responses", "DB_ERROR", 500, req);
    }

    if (questionResult.error) {
      return errorResponse("Failed to fetch questions", "DB_ERROR", 500, req);
    }

    const questionMap: Record<string, QuestionRow> = {};
    for (const row of questionResult.data ?? []) {
      const question = row as QuestionRow;
      questionMap[question.id] = question;
    }

    const responseMap: Record<string, ResponseRow> = {};
    for (const row of responseResult.data ?? []) {
      const response = row as ResponseRow;
      responseMap[response.question_id] = {
        ...response,
        user_answer: normalizeAnswer(response.user_answer),
      };
    }

    /* ----------------------------- SCORING ----------------------------- */
    let totalScore = 0;
    let maxScore = 0;
    let attempted = 0;
    let correct = 0;

    const subjectBreakdown: Record<string, SubjectBreakdown> = {};
    const topicBreakdownRaw: Record<
      string,
      TopicBreakdown & { _time_total: number; _time_count: number }
    > = {};

    const wrongQuestionIds: string[] = [];
    const responseUpserts: Record<string, unknown>[] = [];
    const timeEntries: TimeTrap[] = [];

    for (const questionId of questionIds) {
      const question = questionMap[questionId];
      if (!question) continue;

      const response: ResponseRow = responseMap[questionId] ?? {
        question_id: questionId,
        user_answer: null,
        is_attempted: false,
        time_spent_seconds: 0,
      };

      const subject = safeString(question.subject, "General");
      const topic = safeString(question.topic, "General");
      const marksPositive = safeNumber(question.marks_positive, 4);
      const marksNegative = safeNumber(question.marks_negative, 1);
      const timeSpent = Math.max(0, safeNumber(response.time_spent_seconds, 0));

      maxScore += marksPositive;

      if (!subjectBreakdown[subject]) {
        subjectBreakdown[subject] = {
          correct: 0,
          wrong: 0,
          attempted: 0,
          total: 0,
          accuracy: 0,
          marks: 0,
        };
      }
      subjectBreakdown[subject].total += 1;

      if (!topicBreakdownRaw[topic]) {
        topicBreakdownRaw[topic] = {
          correct: 0,
          wrong: 0,
          attempted: 0,
          total: 0,
          accuracy: 0,
          avg_time: 0,
          subject,
          _time_total: 0,
          _time_count: 0,
        };
      }
      topicBreakdownRaw[topic].total += 1;

      const { correct: isCorrect, score } = scoreQuestion(question, response);
      const isAttempted = Boolean(response.is_attempted) && !isEmptyAnswer(response.user_answer);

      if (isAttempted) {
        attempted += 1;
        subjectBreakdown[subject].attempted += 1;
        topicBreakdownRaw[topic].attempted += 1;
      }

      if (isCorrect) {
        correct += 1;
        subjectBreakdown[subject].correct += 1;
        topicBreakdownRaw[topic].correct += 1;
        subjectBreakdown[subject].marks += marksPositive;
      } else if (isAttempted) {
        wrongQuestionIds.push(questionId);
        subjectBreakdown[subject].wrong += 1;
        topicBreakdownRaw[topic].wrong += 1;
        subjectBreakdown[subject].marks -= marksNegative;
      }

      totalScore += score;

      if (timeSpent > 0) {
        timeEntries.push({
          question_id: questionId,
          time_seconds: timeSpent,
        });

        topicBreakdownRaw[topic]._time_total += timeSpent;
        topicBreakdownRaw[topic]._time_count += 1;
      }

      responseUpserts.push({
        test_id: testId,
        question_id: questionId,
        user_id: userId,
        user_answer: normalizeAnswer(response.user_answer),
        is_attempted: isAttempted,
        is_correct: isCorrect,
        time_spent_seconds: timeSpent,
      });
    }

    /* ----------------------------- METRICS ----------------------------- */
    for (const subject of Object.keys(subjectBreakdown)) {
      const row = subjectBreakdown[subject];
      row.accuracy = row.attempted > 0 ? Math.round((row.correct / row.attempted) * 100) : 0;
    }

    const topicBreakdown: Record<string, TopicBreakdown> = {};
    for (const topic of Object.keys(topicBreakdownRaw)) {
      const row = topicBreakdownRaw[topic];
      topicBreakdown[topic] = {
        correct: row.correct,
        wrong: row.wrong,
        attempted: row.attempted,
        total: row.total,
        accuracy: row.attempted > 0 ? Math.round((row.correct / row.attempted) * 100) : 0,
        avg_time:
          row._time_count > 0 ? Math.round(row._time_total / row._time_count) : 0,
        subject: row.subject,
      };
    }

    const avgTime =
      timeEntries.length > 0
        ? Math.round(
            timeEntries.reduce((sum, item) => sum + item.time_seconds, 0) / timeEntries.length
          )
        : 0;

    const timeTrapThreshold = Math.max(avgTime * 3, 120);
    const timeTraps = timeEntries.filter((entry) => entry.time_seconds > timeTrapThreshold);

    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const attemptPercentage =
      questionIds.length > 0 ? Math.round((attempted / questionIds.length) * 100) : 0;

    // Negative marking is part of the exam contract. Do not clamp a poor
    // attempt to zero or the result no longer reflects the configured score.
    const boundedTotalScore = totalScore;
    const pctScore =
      maxScore > 0 ? (boundedTotalScore / maxScore) * 100 : 0;
    // Do not fabricate a cohort percentile from a single-attempt score.
    const predictedPercentile = null;
    const rankStatus = "unavailable";

    const weakTopics = Object.entries(topicBreakdown)
      .filter(([, value]) => value.attempted > 0 && value.correct / value.attempted < 0.5)
      .map(([topic]) => topic);

    const strongTopics = Object.entries(topicBreakdown)
      .filter(([, value]) => value.attempted > 0 && value.correct / value.attempted >= 0.8)
      .map(([topic]) => topic);

    const rankTier = "Ranking data is not yet available.";

    const analysisPayload = {
      test_id: testId,
      user_id: userId,
      total_score: boundedTotalScore,
      max_score: maxScore,
      accuracy,
      attempt_percentage: attemptPercentage,
      subject_breakdown: subjectBreakdown,
      topic_breakdown: topicBreakdown,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      time_analysis: {
        avg_seconds: avgTime,
        time_traps: timeTraps,
      },
      predicted_percentile: predictedPercentile,
      rank_status: rankStatus,
    };

    /* ----------------- COMPLETE TEST (RPC -> FALLBACK) ----------------- */
    let finalAnalysis: unknown = null;

    const claimResult = await db.rpc("claim_and_complete_test", {
      p_test_id: analysisPayload.test_id,
      p_user_id: analysisPayload.user_id,
      p_total_score: analysisPayload.total_score,
      p_max_score: analysisPayload.max_score,
      p_accuracy: analysisPayload.accuracy,
      p_attempt_percentage: analysisPayload.attempt_percentage,
      p_subject_breakdown: analysisPayload.subject_breakdown,
      p_topic_breakdown: analysisPayload.topic_breakdown,
      p_weak_topics: analysisPayload.weak_topics,
      p_strong_topics: analysisPayload.strong_topics,
      p_time_analysis: analysisPayload.time_analysis,
      p_predicted_percentile: analysisPayload.predicted_percentile ?? 0,
    });

    if (claimResult.error) {
      log(FN, "warn", "claim_and_complete_test failed, using fallback", claimResult.error);

      finalAnalysis = await completeTestFallback(db, analysisPayload);
    } else if ((claimResult.data as { already_completed?: boolean } | null)?.already_completed) {
      const { data: existing } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", testId)
        .maybeSingle();

      const alreadyPayload = {
        success: true,
        already_completed: true,
        expired: timedOut,
        analysis: existing ?? null,
      };
      if (durableKey) {
        await storeIdempotentResponse(
          db,
          durableKey,
          { success: true, credits: 0, balance: 0, payload: alreadyPayload },
          { userId, action: "submit_test" },
        ).catch(() => {});
      }

      return successResponse(alreadyPayload, undefined, 200, req);
    } else {
      const { data: analysisRow } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", testId)
        .maybeSingle();

      finalAnalysis = analysisRow ?? null;
    }

    /* ------------------------ SAVE RESPONSES ------------------------ */
    if (responseUpserts.length > 0) {
      const { error: responseUpsertError } = await db
        .from("test_responses")
        .upsert(responseUpserts, { onConflict: "test_id,question_id" });

      if (responseUpsertError) {
        log(FN, "warn", "Failed to upsert response correctness", responseUpsertError);
      }
    }

    /* ------------------- ADD WRONG ANSWERS TO REVISION ------------------- */
    if (wrongQuestionIds.length > 0) {
      try {
        const { data: existingRevision } = await db
          .from("revision_list")
          .select("question_id")
          .eq("user_id", userId)
          .in("question_id", wrongQuestionIds)
          .eq("is_mastered", false);

        const existingSet = new Set(
          (existingRevision ?? []).map((row: { question_id: string }) => row.question_id)
        );

        const toInsert = wrongQuestionIds.filter((id) => !existingSet.has(id));

        if (toInsert.length > 0) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const nextReviewDate = tomorrow.toISOString().split("T")[0];

          await db.from("revision_list").insert(
            toInsert.map((questionId) => ({
              user_id: userId,
              question_id: questionId,
              added_from_test_id: testId,
              next_review_date: nextReviewDate,
              interval_days: 1,
              review_count: 0,
              is_mastered: false,
            }))
          );
        }
      } catch (revisionError) {
        log(FN, "warn", "Failed to update revision_list", revisionError);
      }
    }

    /* -------------------- UPDATE TOPIC PERFORMANCE -------------------- */
    const testConfig = (testRaw.config as Record<string, unknown> | null) ?? {};
    try {
      const examType = safeString(testConfig.exam_type, "GENERAL");

      for (const [topic, row] of Object.entries(topicBreakdown)) {
        if (row.attempted === 0) continue;

        await updateTopicPerformanceBestEffort(db, {
          userId,
          topic,
          subject: row.subject,
          examType,
          attempted: row.attempted,
          correct: row.correct,
          avgTimeSeconds: row.avg_time > 0 ? row.avg_time : null,
        });
      }
    } catch (topicPerfError) {
      log(FN, "warn", "Topic performance update failed", topicPerfError);
    }

    /* --------------- GOV EXAM TOPIC MASTERY (best-effort) --------------- */
    try {
      const govExamId = safeString(testConfig.gov_exam_id);
      if (govExamId) {
        const avgTimeForQuality =
          timeEntries.length > 0
            ? timeEntries.reduce((s, t) => s + t.time_seconds, 0) / timeEntries.length
            : 0;
        const topicAttemptsMap = new Map<
          string,
          AttemptSignal[]
        >();

        for (const questionId of questionIds) {
          const question = questionMap[questionId];
          if (!question) continue;
          const topic = safeString(question.topic, "General");
          const response = responseMap[questionId];
          const isAttempted =
            Boolean(response?.is_attempted) && !isEmptyAnswer(response?.user_answer);
          const { correct: isCorrect } = scoreQuestion(
            question,
            response ?? {
              question_id: questionId,
              user_answer: null,
              is_attempted: false,
              time_spent_seconds: 0,
            },
          );
          const timeSpent = Math.max(0, safeNumber(response?.time_spent_seconds, 0));
          let quality = 1;
          if (isAttempted && avgTimeForQuality > 0 && timeSpent > 0) {
            if (timeSpent < Math.max(8, avgTimeForQuality * 0.25)) quality = 0.55;
            else if (timeSpent > Math.max(avgTimeForQuality * 3, 120)) quality = 0.75;
          }
          const list = topicAttemptsMap.get(topic) ?? [];
          list.push({
            correct: isCorrect,
            attempted: isAttempted,
            difficulty: question.difficulty,
            daysAgo: 0,
            quality,
          });
          topicAttemptsMap.set(topic, list);
        }

        const topicAttempts = [...topicAttemptsMap.entries()].map(([topic, attempts]) => ({
          topic,
          attempts,
        }));

        await recomputeTopicMasteryFromAttempt(db, {
          userId,
          examId: govExamId,
          stageId: safeString(testConfig.gov_stage_id) || null,
          topicAttempts,
        });
      }
    } catch (masteryError) {
      log(FN, "warn", "Topic mastery update failed", masteryError);
    }

    /* -------------------------- FINAL RESPONSE -------------------------- */
    const finalPayload = {
      success: true,
      expired: timedOut,
      total_score: boundedTotalScore,
      max_score: maxScore,
      accuracy,
      attempt_percentage: attemptPercentage,
      total_correct: correct,
      total_attempted: attempted,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      predicted_percentile: predictedPercentile,
      rank_tier: rankTier,
      rank_status: rankStatus,
      analysis: finalAnalysis,
    };

    if (durableKey) {
      await storeIdempotentResponse(
        db,
        durableKey,
        { success: true, credits: 0, balance: 0, payload: finalPayload },
        { userId, action: "submit_test" },
      ).catch(() => {});
    }

    return successResponse(finalPayload, undefined, 200, req);
  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err instanceof Error ? err.message : "unknown");
    return errorResponse("Something went wrong. Please try again.", "INTERNAL_ERROR", 500, req);
  }
}));
