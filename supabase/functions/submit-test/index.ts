import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// submit-test
// Verifies JWT, scores all responses, calculates breakdowns,
// calls update_topic_performance RPC, marks test COMPLETED.
// Best-effort atomic: all writes happen before COMPLETED status.
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

    // ── Fetch the test — ownership enforced by user_id = verified JWT ──
    const { data: test, error: testErr } = await db
      .from("mock_tests")
      .select("id, config, question_ids, status")
      .eq("id", test_id)
      .eq("user_id", userId)      // ownership check
      .single();

    if (testErr || !test) {
      return new Response(JSON.stringify({ error: "Test not found or access denied" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── If already completed, return existing analysis ─────────────
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

    // ── Fetch responses and questions ─────────────────────────────
    const questionIds = test.question_ids as string[];

    const [responsesRes, questionsRes] = await Promise.all([
      db.from("test_responses")
        .select("question_id, user_answer, is_correct, is_attempted, time_spent_seconds, is_marked_review")
        .eq("test_id", test_id)
        .eq("user_id", userId),   // ownership enforced
      db.from("questions")
        .select("id, correct_answer, marks_positive, marks_negative, subject, topic, difficulty, exam_type")
        .in("id", questionIds),
    ]);

    const questionMap: Record<string, any> = {};
    for (const q of (questionsRes.data ?? [])) questionMap[q.id] = q;

    const responseMap: Record<string, any> = {};
    for (const r of (responsesRes.data ?? [])) responseMap[r.question_id] = r;

    // ── Score each question ───────────────────────────────────────
    let totalScore = 0;
    let maxScore = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;

    const subjectBreakdown: Record<string, {
      correct: number; wrong: number; attempted: number; total: number; marks: number;
    }> = {};
    const topicBreakdown: Record<string, {
      correct: number; wrong: number; attempted: number; total: number;
      time_total: number; count_with_time: number; subject: string;
    }> = {};
    const timePerQuestion: number[] = [];
    const wrongQuestionIds: string[] = [];

    for (const qid of questionIds) {
      const q = questionMap[qid];
      if (!q) continue;

      const marksPos = parseFloat(q.marks_positive ?? 4);
      const marksNeg = parseFloat(q.marks_negative ?? 1);
      maxScore += marksPos;

      const resp = responseMap[qid];
      const isAttempted = resp?.is_attempted ?? (resp?.user_answer ? true : false);
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

      // Upsert is_correct for this response
      await db.from("test_responses").upsert({
        test_id,
        question_id: qid,
        user_id: userId,
        is_correct: isCorrect,
        is_attempted: isAttempted,
        user_answer: userAnswer,
        time_spent_seconds: timeSpent,
      }, { onConflict: "test_id,question_id" });
    }

    // ── Build breakdown objects ────────────────────────────────────
    const subjectBD: Record<string, any> = {};
    for (const [subj, data] of Object.entries(subjectBreakdown)) {
      subjectBD[subj] = {
        ...data,
        accuracy: data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : 0,
      };
    }

    const topicBD: Record<string, any> = {};
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
      .map((qid) => ({ question_id: qid, time_seconds: responseMap[qid].time_spent_seconds }));

    const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const attemptPct = questionIds.length > 0 ? Math.round((totalAttempted / questionIds.length) * 100) : 0;

    const weakTopics = Object.entries(topicBD)
      .filter(([, v]) => (v as any).attempted > 0 && (v as any).accuracy < 50)
      .map(([k]) => k);
    const strongTopics = Object.entries(topicBD)
      .filter(([, v]) => (v as any).attempted > 0 && (v as any).accuracy >= 80)
      .map(([k]) => k);

    // Rough percentile heuristic
    const pctScore = maxScore > 0 ? (Math.max(0, totalScore) / maxScore) * 100 : 0;
    const predictedPercentile = Math.min(99, Math.max(1, Math.round(pctScore)));

    // Estimate rank tier
    const rankTier =
      predictedPercentile >= 99 ? "Top 1%" :
      predictedPercentile >= 95 ? "Top 5%" :
      predictedPercentile >= 90 ? "Top 10%" :
      predictedPercentile >= 75 ? "Top 25%" :
      predictedPercentile >= 50 ? "Top 50%" :
      "Bottom 50%";

    // ── Write analysis (before COMPLETED status update) ───────────
    const { error: analysisErr } = await db.from("test_analyses").upsert({
      test_id,
      user_id: userId,
      total_score: Math.max(0, totalScore),
      max_score: maxScore,
      accuracy,
      attempt_percentage: attemptPct,
      subject_breakdown: subjectBD,
      topic_breakdown: topicBD,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      time_analysis: { avg_seconds: avgTime, time_traps: timeTraps },
      predicted_percentile: predictedPercentile,
    }, { onConflict: "test_id" });

    if (analysisErr) {
      console.error("[submit-test] analysis upsert error:", analysisErr);
      return new Response(JSON.stringify({ error: "Failed to save analysis" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Add wrong questions to revision list ──────────────────────
    // Insert one-by-one so individual constraint violations (duplicate question)
    // don't abort the whole batch. Errors are logged but non-blocking.
    if (wrongQuestionIds.length > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      // Fetch which question_ids are already in revision list (not mastered)
      const { data: existing } = await db
        .from("revision_list")
        .select("question_id")
        .eq("user_id", userId)
        .in("question_id", wrongQuestionIds)
        .eq("is_mastered", false);

      const existingIds = new Set((existing ?? []).map((r: { question_id: string }) => r.question_id));
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
        if (revErr) {
          console.error("[submit-test] revision_list insert error:", revErr.message);
          // Non-blocking — test submission proceeds regardless
        }
      }
    }

    // ── Call update_topic_performance RPC using user JWT ──────────
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const config = test.config as any;
    const examType = config?.exam_type ?? "GENERAL";

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

    // ── Mark test COMPLETED (last write — everything else succeeded) ──
    await db
      .from("mock_tests")
      .update({ status: "COMPLETED", submitted_at: new Date().toISOString() })
      .eq("id", test_id)
      .eq("user_id", userId);

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
