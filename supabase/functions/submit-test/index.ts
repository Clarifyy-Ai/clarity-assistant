import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// Typed interfaces
// ─────────────────────────────────────────────────────────────────

interface QuestionRow {
  id: string;
  correct_answer: string;
  marks_positive: number;
  marks_negative: number;
  subject: string;
  topic: string;
  difficulty: string;
  exam_type: string | null;
}

interface ResponseRow {
  question_id: string;
  user_answer: string | null;
  is_correct: boolean | null;
  is_attempted: boolean;
  time_spent_seconds: number | null;
  is_marked_review: boolean | null;
}

interface SubjectStat {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  marks: number;
}

interface TopicStat {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  time_total: number;
  count_with_time: number;
  subject: string;
}

interface SubjectBreakdownEntry {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  marks: number;
  accuracy: number;
}

interface TopicBreakdownEntry {
  correct: number;
  wrong: number;
  attempted: number;
  total: number;
  accuracy: number;
  avg_time: number;
}

interface MockTestConfig {
  exam_type?: string;
}

// ─────────────────────────────────────────────────────────────────
// submit-test
//
// Truly idempotent and concurrency-safe:
//
//   1. Verify JWT (server-side only)
//   2. Score responses + build analysis objects (cheap, read-only scoring)
//   3. Call claim_and_complete_test RPC — single atomic DB transaction:
//        a) SELECT ownership check
//        b) UPDATE status='COMPLETED' WHERE status!='COMPLETED'  ← the GATE
//        c) INSERT/UPDATE test_analyses
//        → Returns already_completed if the UPDATE affected 0 rows
//        → Returns claimed=true if this call owns completion
//   4. If already_completed → return cached analysis (idempotent)
//   5. If claimed → run once-only side effects:
//        - Batch upsert scored responses
//        - Revision list inserts (wrong answers)
//        - Topic performance increments (update_topic_performance RPC)
//
// The WHERE status!='COMPLETED' UPDATE in step 3 is serialized by Postgres
// under READ COMMITTED isolation — only one concurrent transaction can
// transition from any non-COMPLETED status to COMPLETED, guaranteeing
// that scoring side effects run exactly once.
// ─────────────────────────────────────────────────────────────────

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

    // ── Fetch test data for scoring (read-only, no lock needed yet) ──
    const { data: testRaw, error: testErr } = await db
      .from("mock_tests")
      .select("id, config, question_ids, status")
      .eq("id", test_id)
      .eq("user_id", userId)
      .single();

    if (testErr || !testRaw) {
      return new Response(JSON.stringify({ error: "Test not found or access denied" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const test = testRaw as unknown as {
      id: string;
      config: MockTestConfig;
      question_ids: string[];
      status: string;
    };

    // If already completed, return cached analysis (fast path for retries/double-submits)
    if (test.status === "COMPLETED") {
      const { data: existing } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", test_id)
        .single();
      return new Response(
        JSON.stringify({ success: true, already_completed: true, analysis: existing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const questionIds = test.question_ids;

    // ── Fetch responses and questions for scoring ─────────────────
    const [responsesRes, questionsRes] = await Promise.all([
      db.from("test_responses")
        .select("question_id, user_answer, is_correct, is_attempted, time_spent_seconds, is_marked_review")
        .eq("test_id", test_id)
        .eq("user_id", userId),
      db.from("questions")
        .select("id, correct_answer, marks_positive, marks_negative, subject, topic, difficulty, exam_type")
        .in("id", questionIds),
    ]);

    const questionMap: Record<string, QuestionRow> = {};
    for (const q of (questionsRes.data ?? [])) {
      const row = q as unknown as QuestionRow;
      questionMap[row.id] = row;
    }

    const responseMap: Record<string, ResponseRow> = {};
    for (const r of (responsesRes.data ?? [])) {
      const row = r as unknown as ResponseRow;
      responseMap[row.question_id] = row;
    }

    // ── Score each question ───────────────────────────────────────
    let totalScore = 0;
    let maxScore = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;

    const subjectBreakdown: Record<string, SubjectStat> = {};
    const topicBreakdown: Record<string, TopicStat> = {};
    const timePerQuestion: number[] = [];
    const wrongQuestionIds: string[] = [];
    const responseUpserts: Array<Record<string, unknown>> = [];

    for (const qid of questionIds) {
      const q = questionMap[qid];
      if (!q) continue;

      const marksPos = parseFloat(String(q.marks_positive ?? 4));
      const marksNeg = parseFloat(String(q.marks_negative ?? 1));
      maxScore += marksPos;

      const resp = responseMap[qid];
      const isAttempted = resp?.is_attempted ?? Boolean(resp?.user_answer);
      const userAnswer = resp?.user_answer ?? null;
      const timeSpent = resp?.time_spent_seconds ?? 0;

      if (!subjectBreakdown[q.subject]) {
        subjectBreakdown[q.subject] = { correct: 0, wrong: 0, attempted: 0, total: 0, marks: 0 };
      }
      subjectBreakdown[q.subject].total++;

      if (!topicBreakdown[q.topic]) {
        topicBreakdown[q.topic] = {
          correct: 0, wrong: 0, attempted: 0, total: 0,
          time_total: 0, count_with_time: 0, subject: q.subject,
        };
      }
      topicBreakdown[q.topic].total++;

      let isCorrect = false;
      if (isAttempted && userAnswer !== null && userAnswer !== "") {
        totalAttempted++;
        subjectBreakdown[q.subject].attempted++;
        topicBreakdown[q.topic].attempted++;

        isCorrect = String(userAnswer).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase();

        if (isCorrect) {
          totalScore += marksPos;
          subjectBreakdown[q.subject].correct++;
          subjectBreakdown[q.subject].marks += marksPos;
          topicBreakdown[q.topic].correct++;
          totalCorrect++;
        } else {
          totalScore -= marksNeg;
          subjectBreakdown[q.subject].wrong++;
          subjectBreakdown[q.subject].marks -= marksNeg;
          topicBreakdown[q.topic].wrong++;
          wrongQuestionIds.push(qid);
        }
      }

      if (timeSpent > 0) {
        timePerQuestion.push(timeSpent);
        topicBreakdown[q.topic].time_total += timeSpent;
        topicBreakdown[q.topic].count_with_time++;
      }

      responseUpserts.push({
        test_id,
        question_id: qid,
        user_id: userId,
        is_correct: isCorrect,
        is_attempted: isAttempted,
        user_answer: userAnswer,
        time_spent_seconds: timeSpent,
      });
    }

    // ── Build breakdown objects ────────────────────────────────────
    const subjectBD: Record<string, SubjectBreakdownEntry> = {};
    for (const [subj, data] of Object.entries(subjectBreakdown)) {
      subjectBD[subj] = {
        ...data,
        accuracy: data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : 0,
      };
    }

    const topicBD: Record<string, TopicBreakdownEntry> = {};
    for (const [topic, data] of Object.entries(topicBreakdown)) {
      topicBD[topic] = {
        correct: data.correct,
        wrong: data.wrong,
        attempted: data.attempted,
        total: data.total,
        accuracy: data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : 0,
        avg_time: data.count_with_time > 0 ? Math.round(data.time_total / data.count_with_time) : 0,
      };
    }

    const avgTime = timePerQuestion.length > 0
      ? Math.round(timePerQuestion.reduce((a, b) => a + b, 0) / timePerQuestion.length)
      : 0;

    const timeTrapThreshold = avgTime * 3;
    const timeTraps = questionIds
      .filter((qid) => (responseMap[qid]?.time_spent_seconds ?? 0) > timeTrapThreshold && timeTrapThreshold > 0)
      .map((qid) => ({
        question_id: qid,
        time_seconds: responseMap[qid]?.time_spent_seconds ?? 0,
      }));

    const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const attemptPct = questionIds.length > 0 ? Math.round((totalAttempted / questionIds.length) * 100) : 0;

    const weakTopics = Object.entries(topicBD)
      .filter(([, v]) => v.attempted > 0 && v.accuracy < 50)
      .map(([k]) => k);
    const strongTopics = Object.entries(topicBD)
      .filter(([, v]) => v.attempted > 0 && v.accuracy >= 80)
      .map(([k]) => k);

    const pctScore = maxScore > 0 ? (Math.max(0, totalScore) / maxScore) * 100 : 0;
    const predictedPercentile = Math.min(99, Math.max(1, Math.round(pctScore)));

    const rankTier =
      predictedPercentile >= 99 ? "Top 1%" :
      predictedPercentile >= 95 ? "Top 5%" :
      predictedPercentile >= 90 ? "Top 10%" :
      predictedPercentile >= 75 ? "Top 25%" :
      predictedPercentile >= 50 ? "Top 50%" :
      "Bottom 50%";

    // ── ATOMIC GATE: claim completion + write analysis in one transaction ──
    // claim_and_complete_test does:
    //   UPDATE mock_tests SET status='COMPLETED' WHERE status != 'COMPLETED' ... RETURNING ...
    //   INSERT/UPDATE test_analyses
    // If 0 rows returned from UPDATE → already_completed by a concurrent call.
    const { data: claimResult, error: claimErr } = await db.rpc("claim_and_complete_test", {
      p_test_id:              test_id,
      p_user_id:              userId,
      p_total_score:          Math.max(0, totalScore),
      p_max_score:            maxScore,
      p_accuracy:             accuracy,
      p_attempt_percentage:   attemptPct,
      p_subject_breakdown:    subjectBD,
      p_topic_breakdown:      topicBD,
      p_weak_topics:          weakTopics,
      p_strong_topics:        strongTopics,
      p_time_analysis:        { avg_seconds: avgTime, time_traps: timeTraps },
      p_predicted_percentile: predictedPercentile,
    });

    if (claimErr) {
      console.error("[submit-test] claim_and_complete_test error:", claimErr);
      return new Response(
        JSON.stringify({ error: "Failed to complete test submission", detail: claimErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    type ClaimResult = { error?: string; already_completed?: boolean; claimed?: boolean };
    const claim = claimResult as ClaimResult;

    if (claim?.error) {
      return new Response(
        JSON.stringify({ error: claim.error }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (claim?.already_completed) {
      // Another concurrent call won the race — return success; analysis was committed by it
      const { data: existing } = await db
        .from("test_analyses")
        .select("*")
        .eq("test_id", test_id)
        .single();
      return new Response(
        JSON.stringify({ success: true, already_completed: true, analysis: existing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Only if WE claimed completion: run once-only side effects ────
    // By this point, the DB guarantees no other concurrent call can
    // also claim (the UPDATE WHERE status!='COMPLETED' is already committed).

    // Batch-upsert all scored responses
    if (responseUpserts.length > 0) {
      await db.from("test_responses").upsert(responseUpserts, { onConflict: "test_id,question_id" });
    }

    // Revision list: add wrong questions (select-then-insert, non-blocking)
    if (wrongQuestionIds.length > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      const { data: existing } = await db
        .from("revision_list")
        .select("question_id")
        .eq("user_id", userId)
        .in("question_id", wrongQuestionIds)
        .eq("is_mastered", false);

      const existingIds = new Set(
        (existing ?? []).map((r: { question_id: string }) => r.question_id)
      );
      const newRevisionIds = wrongQuestionIds.filter((qid) => !existingIds.has(qid));

      if (newRevisionIds.length > 0) {
        const { error: revErr } = await db.from("revision_list").insert(
          newRevisionIds.map((qid) => ({
            user_id: userId,
            question_id: qid,
            added_from_test_id: test_id,
            next_review_date: tomorrowStr,
            interval_days: 1,
            is_mastered: false,
          }))
        );
        if (revErr) console.error("[submit-test] revision_list error:", revErr.message);
      }
    }

    // Topic performance increments (best-effort, non-blocking)
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const examType = test.config?.exam_type ?? "GENERAL";

      for (const [topic, data] of Object.entries(topicBreakdown)) {
        if (data.attempted === 0) continue;
        const avgTopicTime = data.count_with_time > 0
          ? Math.round(data.time_total / data.count_with_time)
          : null;
        await userClient.rpc("update_topic_performance", {
          p_topic: topic,
          p_subject: data.subject,
          p_exam_type: examType,
          p_attempted_delta: data.attempted,
          p_correct_delta: data.correct,
          p_avg_time_seconds: avgTopicTime,
        });
      }
    } catch (topicErr) {
      console.warn("[submit-test] topic performance error (non-blocking):", topicErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_score: Math.max(0, totalScore),
        max_score: maxScore,
        accuracy,
        attempt_percentage: attemptPct,
        total_correct: totalCorrect,
        total_attempted: totalAttempted,
        weak_topics: weakTopics,
        predicted_percentile: predictedPercentile,
        rank_tier: rankTier,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[submit-test] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
