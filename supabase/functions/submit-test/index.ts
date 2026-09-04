// supabase/functions/submit-test/index.ts
// PRODUCTION-READY VERSION

import { requireOnboardingComplete } from "../_shared/auth.ts";
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
import type { AttemptSignal } from "../_shared/masteryEngine.ts";
import { isExamExpired } from "../_shared/examTimer.ts";
import {
  MOCK_TEST_SCORE_ALGORITHM_VERSION,
  scoreMockTest,
} from "../_shared/mockTestScoring.ts";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

interface QuestionRow {
  id: string;
  question_text?: string | null;
  question_type: string | null;
  options?: unknown;
  correct_answer: unknown;
  explanation?: string | null;
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

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
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

  let claimedDb: ReturnType<typeof createServiceClient> | null = null;
  let claimedTestId = "";
  let claimedUserId = "";
  const releaseClaim = async () => {
    if (!claimedDb || !claimedTestId || !claimedUserId) return;
    await claimedDb.rpc("release_test_submission", {
      p_test_id: claimedTestId,
      p_user_id: claimedUserId,
    }).catch(() => {});
    claimedDb = null;
  };

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = createServiceClient();

    const onboardingBlock = await requireOnboardingComplete(userId, req);
    if (onboardingBlock) return onboardingBlock;

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

    if (testRaw.status === "DRAFT" || !testRaw.started_at) {
      return errorResponse(
        "Start the exam before submitting.",
        "ATTEMPT_NOT_STARTED",
        409,
        req,
      );
    }

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

    const submissionClaim = await db.rpc("begin_test_submission", {
      p_test_id: testId,
      p_user_id: userId,
    });
    if (submissionClaim.error) {
      log(FN, "error", "begin_test_submission failed", submissionClaim.error);
      return errorResponse("Could not lock this test for submission.", "TEST_FINALIZE_FAILED", 503, req);
    }
    const claim = (submissionClaim.data ?? {}) as {
      success?: boolean;
      already_completed?: boolean;
      code?: string;
    };
    if (claim.already_completed) {
      const { data: existing } = await db.from("test_analyses").select("*").eq("test_id", testId).maybeSingle();
      return successResponse({ success: true, already_completed: true, analysis: existing ?? null }, undefined, 200, req);
    }
    if (claim.success === false) {
      const code = String(claim.code ?? "SUBMISSION_CONFLICT");
      return errorResponse(
        code === "SUBMISSION_IN_PROGRESS" ? "Submission is already in progress." : "Attempt cannot be submitted.",
        code,
        409,
        req,
      );
    }
    claimedDb = db;
    claimedTestId = testId;
    claimedUserId = userId;

    /* -------------------- FETCH QUESTIONS & RESPONSES -------------------- */
    const config = (testRaw.config && typeof testRaw.config === "object")
      ? testRaw.config as Record<string, unknown>
      : {};
    const paperId = typeof config.gov_paper_id === "string" ? config.gov_paper_id : null;
    const defaultPositive = safeNumber(config.marks_positive ?? config.marks_per_question, 0);
    const defaultNegative = safeNumber(config.marks_negative ?? config.negative_mark, 0);
    const scoringDefaults = {
      positive: defaultPositive > 0 ? defaultPositive : 0,
      negative: defaultNegative >= 0 ? defaultNegative : 0,
    };

    const [responseResult, questionResult, snapshotResult] = await Promise.all([
      db
        .from("test_responses")
        .select("question_id, user_answer, is_attempted, time_spent_seconds")
        .eq("test_id", testId)
        .eq("user_id", userId),
      db
        .from("questions")
        .select(
          "id, question_text, question_type, options, correct_answer, explanation, marks_positive, marks_negative, subject, topic, difficulty, exam_type"
        )
        .in("id", questionIds),
      paperId
        ? db
          .from("gov_generated_paper_questions")
          .select("question_id, section_code, snapshot_json")
          .eq("paper_id", paperId)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ]);

    if (responseResult.error) {
      await releaseClaim();
      return errorResponse("Failed to fetch test responses", "DB_ERROR", 500, req);
    }

    if (questionResult.error) {
      await releaseClaim();
      return errorResponse("Failed to fetch questions", "DB_ERROR", 500, req);
    }

    const questionMap: Record<string, QuestionRow> = {};
    for (const row of questionResult.data ?? []) {
      const question = row as QuestionRow;
      questionMap[question.id] = question;
    }

    const frozenSnapshotByQuestion: Record<string, Record<string, unknown>> = {};
    for (const link of snapshotResult.data ?? []) {
      const rec = link as { question_id?: string; section_code?: string; snapshot_json?: Record<string, unknown> };
      const qid = safeString(rec.question_id);
      const snap = rec.snapshot_json && typeof rec.snapshot_json === "object" ? rec.snapshot_json : null;
      if (!qid || !snap) continue;
      frozenSnapshotByQuestion[qid] = snap;
      const existing = questionMap[qid];
      questionMap[qid] = {
        id: qid,
        question_type: safeString(snap.question_type, existing?.question_type ?? "MCQ"),
        correct_answer: snap.correct_answer ?? existing?.correct_answer ?? null,
        marks_positive: snap.marks_positive != null ? Number(snap.marks_positive) : existing?.marks_positive ?? null,
        marks_negative: snap.marks_negative != null ? Number(snap.marks_negative) : existing?.marks_negative ?? null,
        subject: safeString(snap.subject, existing?.subject ?? rec.section_code ?? "General"),
        topic: safeString(snap.topic, existing?.topic ?? "General"),
        difficulty: safeString(snap.difficulty, existing?.difficulty ?? "MEDIUM"),
        exam_type: existing?.exam_type ?? null,
      };
    }

    const responseMap: Record<string, ResponseRow> = {};
    for (const row of responseResult.data ?? []) {
      const response = row as ResponseRow;
      responseMap[response.question_id] = {
        ...response,
        user_answer: normalizeAnswer(response.user_answer),
      };
    }

    /* ---------------- AUTHORITATIVE PER-QUESTION + AGGREGATE SCORING ---------------- */
    const score = scoreMockTest(
      questionIds.flatMap((questionId) => {
        const question = questionMap[questionId];
        return question ? [{
          id: questionId,
          questionType: question.question_type,
          correctAnswer: question.correct_answer,
          marksPositive: safeNumber(question.marks_positive, scoringDefaults.positive),
          marksNegative: safeNumber(question.marks_negative, scoringDefaults.negative),
          subject: question.subject,
          topic: question.topic,
          difficulty: question.difficulty,
        }] : [];
      }),
      Object.values(responseMap).map((response) => ({
        questionId: response.question_id,
        userAnswer: response.user_answer,
        isAttempted: response.is_attempted,
        timeSpentSeconds: response.time_spent_seconds,
      })),
    );
    const {
      rawTotalScore: totalScore,
      maxScore,
      attempted,
      correct,
      incorrect,
      unanswered,
      positiveMarks,
      negativeMarks,
      accuracy,
      attemptPercentage,
    } = score;
    const subjectBreakdown = score.subjectBreakdown as Record<string, SubjectBreakdown>;
    const topicBreakdown = score.topicBreakdown as Record<string, TopicBreakdown>;
    const wrongQuestionIds = score.perQuestion
      .filter((row) => row.outcome === "wrong")
      .map((row) => row.questionId);
    const responseUpserts: Record<string, unknown>[] = score.perQuestion.map((row) => ({
      question_id: row.questionId,
      is_attempted: row.isAttempted,
      is_correct: row.isCorrect,
      time_spent_seconds: row.timeSpentSeconds,
    }));
    const timeEntries: TimeTrap[] = score.perQuestion
      .filter((row) => row.timeSpentSeconds > 0)
      .map((row) => ({ question_id: row.questionId, time_seconds: row.timeSpentSeconds }));

    const avgTime =
      timeEntries.length > 0
        ? Math.round(
            timeEntries.reduce((sum, item) => sum + item.time_seconds, 0) / timeEntries.length
          )
        : 0;

    const timeTrapThreshold = Math.max(avgTime * 3, 120);
    const timeTraps = timeEntries.filter((entry) => entry.time_seconds > timeTrapThreshold);

    // Negative marking is part of the exam contract. Store raw total_score;
    // TestResults clamps display via clampMockTestDisplayScore().
    const boundedTotalScore = totalScore;
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

    const paperScoringPolicy = safeString(config.scoring_version, "gov_exam_snapshot_v1");
    const paperSnapshotId = safeString(
      config.availability_snapshot_id ?? config.paper_snapshot_id ?? config.snapshot_id,
      "",
    );
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
        score_summary: {
          correct,
          incorrect,
          unanswered,
          positive_marks: positiveMarks,
          negative_marks: negativeMarks,
          score_percentage: score.percentage,
          scoring_version: paperScoringPolicy,
          scoring_policy_version: paperScoringPolicy,
          paper_snapshot_id: paperSnapshotId || null,
          algorithm_version: MOCK_TEST_SCORE_ALGORITHM_VERSION,
        },
      },
      // Marks algorithm (not paper policy / AI narrative version).
      algorithm_version: MOCK_TEST_SCORE_ALGORITHM_VERSION,
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
      p_responses: responseUpserts,
      p_algorithm_version: MOCK_TEST_SCORE_ALGORITHM_VERSION,
    });

    const completion = (claimResult.data ?? {}) as {
      already_completed?: boolean;
      error?: string;
      code?: string;
    };
    if (claimResult.error || completion.error) {
      log(FN, "error", "claim_and_complete_test failed; refusing partial write", claimResult.error);
      await releaseClaim();
      return errorResponse(
        "Could not finalize this test. Please retry — no partial result was saved.",
        completion.code ?? "TEST_FINALIZE_FAILED",
        503,
        req,
      );
    } else if (completion.already_completed) {
      claimedDb = null;
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
      claimedDb = null;
      const { data: analysisRow } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", testId)
        .maybeSingle();

      finalAnalysis = analysisRow ?? null;
    }

    /* Responses persist inside claim_and_complete_test — no separate write. */

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
              question_snapshot: frozenSnapshotByQuestion[questionId] ?? questionMap[questionId] ?? null,
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
      const govExamId =
        safeString(testConfig.gov_exam_id) || safeString(testConfig.exam_id);
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
          const scored = score.perQuestion.find((row) => row.questionId === questionId);
          const isAttempted = Boolean(scored?.isAttempted);
          const isCorrect = Boolean(scored?.isCorrect);
          const timeSpent = Math.max(0, safeNumber(scored?.timeSpentSeconds, 0));
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
          stageId:
            safeString(testConfig.gov_stage_id) ||
            safeString(testConfig.stage_id) ||
            null,
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
    await releaseClaim();
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err instanceof Error ? err.message : "unknown");
    return errorResponse("Something went wrong. Please try again.", "INTERNAL_ERROR", 500, req);
  }
}));
