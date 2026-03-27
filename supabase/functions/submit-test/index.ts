// submit-test/index.ts — FIXED & PRODUCTION READY

import { corsHeaders } from "../_shared/cors.ts";
import {
  handleCors, requireAuth, parseBody,
  successResponse, errorResponse, log
} from "../_shared/utils.ts";
import { createServiceClient } from "../_shared/supabase.ts";

/* -------------------------------------------------------------------------- */
/*                               TYPES & UTILS                                */
/* -------------------------------------------------------------------------- */

type QuestionType = "MCQ" | "NUMERIC" | "MULTI_SELECT" | "CODE";

interface QuestionRow {
  id: string;
  question_type: QuestionType;
  correct_answer: string | string[] | number | null;
  marks_positive: number;
  marks_negative: number;
  subject: string;
  topic: string;
  difficulty: string;
  exam_type: string | null;
}

interface ResponseRow {
  question_id: string;
  user_answer: string | string[] | number | null;
  is_attempted: boolean;
  time_spent_seconds: number | null;
}

function sanitizeAnswer(ans: any): string | string[] | number | null {
  if (Array.isArray(ans)) return ans.map((v) => String(v).trim());
  if (ans === null || ans === undefined) return null;
  if (!isNaN(ans)) return Number(ans);
  return String(ans).trim();
}

function scoreQuestion(q: QuestionRow, user: ResponseRow) {
  const pos = q.marks_positive ?? 4;
  const neg = q.marks_negative ?? 1;

  if (!user.is_attempted || user.user_answer === null || user.user_answer === "")
    return { correct: false, score: 0 };

  // MCQ
  if (q.question_type === "MCQ") {
    const ua = String(user.user_answer).trim().toLowerCase();
    const ca = String(q.correct_answer).trim().toLowerCase();
    return ua === ca
      ? { correct: true, score: pos }
      : { correct: false, score: -neg };
  }

  // NUMERIC
  if (q.question_type === "NUMERIC") {
    const ua = Number(user.user_answer);
    const ca = Number(q.correct_answer);
    if (Number.isFinite(ua) && Math.abs(ua - ca) < 1e-9)
      return { correct: true, score: pos };
    return { correct: false, score: -neg };
  }

  // MULTI-SELECT
  if (q.question_type === "MULTI_SELECT") {
    const ua = Array.isArray(user.user_answer) ? user.user_answer.map((v) => String(v).trim()) : [];
    const ca = Array.isArray(q.correct_answer) ? q.correct_answer.map((v) => String(v).trim()) : [];
    const correct = ua.length === ca.length && ua.every((v) => ca.includes(v));
    return correct ? { correct: true, score: pos } : { correct: false, score: -neg };
  }

  // CODE: basic evaluation (string compare — actual judge can replace later)
  if (q.question_type === "CODE") {
    const ua = String(user.user_answer).trim();
    const ca = String(q.correct_answer).trim();
    return ua === ca ? { correct: true, score: pos } : { correct: false, score: -neg };
  }

  return { correct: false, score: 0 };
}

/* -------------------------------------------------------------------------- */
/*                                 HANDLER                                    */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "submit-test";

  try {
    /* -------------------------- AUTH -------------------------- */
    const auth = await requireAuth(req);
    const db = createServiceClient();

    /* -------------------------- BODY -------------------------- */
    const body = await parseBody<{ test_id: string }>(req);
    if (!body?.test_id) {
      return errorResponse("Missing test_id", "VALIDATION_ERROR", 400);
    }
    const test_id = String(body.test_id).trim();
    const userId = auth.userId;

    /* -------------------- FETCH TEST METADATA ------------------- */
    const { data: testRaw, error: testErr } = await db
      .from("mock_tests")
      .select("id, config, question_ids, status")
      .eq("id", test_id)
      .eq("user_id", userId)
      .single();

    if (testErr || !testRaw) {
      return errorResponse("Test not found or access denied", "NOT_FOUND", 404);
    }

    if (testRaw.status === "COMPLETED") {
      const { data: existing } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", test_id)
        .single();

      return successResponse({
        success: true,
        already_completed: true,
        analysis: existing,
      });
    }

    const questionIds: string[] = testRaw.question_ids ?? [];

    /* ---------------------- FETCH RESPONSES ---------------------- */
    const [respRes, qRes] = await Promise.all([
      db.from("test_responses")
        .select("question_id, user_answer, is_attempted, time_spent_seconds")
        .eq("test_id", test_id)
        .eq("user_id", userId),
      db.from("questions")
        .select("id, question_type, correct_answer, marks_positive, marks_negative, subject, topic, difficulty, exam_type")
        .in("id", questionIds),
    ]);

    const qMap: Record<string, QuestionRow> = {};
    for (const q of qRes.data ?? []) qMap[q.id] = q as QuestionRow;

    const rMap: Record<string, ResponseRow> = {};
    for (const r of respRes.data ?? []) {
      rMap[r.question_id] = {
        ...r,
        user_answer: sanitizeAnswer(r.user_answer),
      };
    }

    /* ------------------------ SCORING ------------------------ */
    let totalScore = 0;
    let maxScore = 0;
    let attempted = 0;
    let correct = 0;

    const subjectBD: Record<string, any> = {};
    const topicBD: Record<string, any> = {};

    const wrongList: string[] = [];
    const upserts: any[] = [];

    const times: number[] = [];

    for (const qid of questionIds) {
      const q = qMap[qid];
      if (!q) continue;

      const resp = rMap[qid] ?? {
        is_attempted: false,
        user_answer: null,
        time_spent_seconds: 0,
      };

      maxScore += q.marks_positive ?? 4;

      if (!subjectBD[q.subject])
        subjectBD[q.subject] = { correct: 0, wrong: 0, attempted: 0, total: 0, marks: 0 };
      subjectBD[q.subject].total++;

      if (!topicBD[q.topic])
        topicBD[q.topic] = { correct: 0, wrong: 0, attempted: 0, total: 0, time: 0, time_count: 0, subject: q.subject };
      topicBD[q.topic].total++;

      const { correct: isCorrect, score } = scoreQuestion(q, resp);

      if (resp.is_attempted) {
        attempted++;
        subjectBD[q.subject].attempted++;
        topicBD[q.topic].attempted++;
      }

      if (isCorrect) {
        correct++;
        subjectBD[q.subject].correct++;
        topicBD[q.topic].correct++;
        subjectBD[q.subject].marks += q.marks_positive ?? 4;
      } else if (resp.is_attempted) {
        wrongList.push(qid);
        subjectBD[q.subject].wrong++;
        subjectBD[q.subject].marks -= q.marks_negative ?? 1;
      }

      totalScore += score;

      const ts = resp.time_spent_seconds ?? 0;
      if (ts > 0) {
        times.push(ts);
        topicBD[q.topic].time += ts;
        topicBD[q.topic].time_count++;
      }

      upserts.push({
        test_id,
        question_id: qid,
        user_id: userId,
        is_correct: isCorrect,
        is_attempted: resp.is_attempted,
        user_answer: resp.user_answer,
        time_spent_seconds: ts,
      });
    }

    /* ------------------------ METRICS ------------------------ */
    const avgTime =
      times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const attemptPct =
      questionIds.length > 0
        ? Math.round((attempted / questionIds.length) * 100)
        : 0;

    const timeTrapThreshold = avgTime * 3;
    const timeTraps = times
      .map((t, i) => (t > timeTrapThreshold ? { question_id: questionIds[i], time_seconds: t } : null))
      .filter(Boolean);

    const pctScore = maxScore > 0 ? (Math.max(0, totalScore) / maxScore) * 100 : 0;
    const predictedPercentile = Math.min(99, Math.max(1, Math.round(pctScore)));

    const weakTopics = Object.entries(topicBD)
      .filter(([, v]) => v.attempted > 0 && v.correct / v.attempted < 0.5)
      .map(([k]) => k);

    const strongTopics = Object.entries(topicBD)
      .filter(([, v]) => v.attempted > 0 && v.correct / v.attempted > 0.8)
      .map(([k]) => k);

    const rankTier =
      predictedPercentile >= 99
        ? "Top 1%"
        : predictedPercentile >= 95
        ? "Top 5%"
        : predictedPercentile >= 90
        ? "Top 10%"
        : predictedPercentile >= 75
        ? "Top 25%"
        : predictedPercentile >= 50
        ? "Top 50%"
        : "Bottom 50%";

    /* -------------------- CLAIM & COMPLETE (ATOMIC) -------------------- */
    const { data: claim, error: claimErr } = await db.rpc("claim_and_complete_test", {
      p_test_id: test_id,
      p_user_id: userId,
      p_total_score: Math.max(0, totalScore),
      p_max_score: maxScore,
      p_accuracy: accuracy,
      p_attempt_percentage: attemptPct,
      p_subject_breakdown: subjectBD,
      p_topic_breakdown: topicBD,
      p_weak_topics: weakTopics,
      p_strong_topics: strongTopics,
      p_time_analysis: { avg_seconds: avgTime, time_traps: timeTraps },
      p_predicted_percentile: predictedPercentile,
    });

    if (claimErr) {
      return errorResponse("Failed to complete test submission", "DB_ERROR", 500);
    }

    if (claim?.already_completed) {
      const { data: existing } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", test_id)
        .single();

      return successResponse({
        success: true,
        already_completed: true,
        analysis: existing,
      });
    }

    /* ------------------ POST-COMPLETION SIDE EFFECTS ------------------ */

    if (upserts.length > 0) {
      await db.from("test_responses").upsert(upserts, {
        onConflict: "test_id,question_id",
      });
    }

    if (wrongList.length > 0) {
      const { data: existing } = await db
        .from("revision_list")
        .select("question_id")
        .eq("user_id", userId)
        .in("question_id", wrongList)
        .eq("is_mastered", false);

      const existingSet = new Set((existing ?? []).map((r: any) => r.question_id));
      const toInsert = wrongList.filter((id) => !existingSet.has(id));

      if (toInsert.length > 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split("T")[0];

        await db.from("revision_list").insert(
          toInsert.map((qid) => ({
            user_id: userId,
            question_id: qid,
            added_from_test_id: test_id,
            next_review_date: dateStr,
            interval_days: 1,
            is_mastered: false,
          }))
        );
      }
    }

    try {
      const examType = testRaw.config?.exam_type ?? "GENERAL";

      for (const [topic, data] of Object.entries(topicBD)) {
        if (data.attempted === 0) continue;

        const avgTopicTime =
          data.time_count > 0
            ? Math.round(data.time / data.time_count)
            : null;

        await db.rpc("update_topic_performance", {
          p_topic: topic,
          p_subject: data.subject,
          p_exam_type: examType,
          p_attempted_delta: data.attempted,
          p_correct_delta: data.correct,
          p_avg_time_seconds: avgTopicTime,
        });
      }
    } catch (err) {
      log(FN, "warn", "Topic performance failed", err);
    }

    /* ------------------------ FINAL RESPONSE ------------------------ */
    return successResponse({
      success: true,
      total_score: Math.max(0, totalScore),
      max_score: maxScore,
      accuracy,
      attempt_percentage: attemptPct,
      total_correct: correct,
      total_attempted: attempted,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      predicted_percentile: predictedPercentile,
      rank_tier: rankTier,
    });

  } catch (err) {
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Internal error", "INTERNAL", 500);
  }
});
