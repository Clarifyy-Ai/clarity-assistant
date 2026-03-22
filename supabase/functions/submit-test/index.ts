import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// submit-test
// Atomically scores all responses, calculates breakdowns,
// calls update_topic_performance RPC, and marks the test COMPLETED.
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { test_id, user_id } = await req.json();
    if (!test_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing test_id or user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createServiceClient();

    // Fetch the test
    const { data: test, error: testErr } = await db
      .from("mock_tests")
      .select("id, config, question_ids, status")
      .eq("id", test_id)
      .eq("user_id", user_id)
      .single();

    if (testErr || !test) {
      return new Response(JSON.stringify({ error: "Test not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (test.status === "COMPLETED") {
      // Already submitted — return existing analysis
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

    // Fetch all test responses
    const { data: responses } = await db
      .from("test_responses")
      .select("question_id, user_answer, is_correct, is_attempted, time_spent_seconds")
      .eq("test_id", test_id)
      .eq("user_id", user_id);

    // Fetch question details for scoring
    const questionIds = test.question_ids as string[];
    const { data: questions } = await db
      .from("questions")
      .select("id, correct_answer, marks_positive, marks_negative, subject, topic, difficulty, exam_type")
      .in("id", questionIds);

    const questionMap: Record<string, any> = {};
    for (const q of (questions ?? [])) {
      questionMap[q.id] = q;
    }

    const responseMap: Record<string, any> = {};
    for (const r of (responses ?? [])) {
      responseMap[r.question_id] = r;
    }

    // Score each question
    let totalScore = 0;
    let maxScore = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;

    const subjectBreakdown: Record<string, { correct: number; wrong: number; attempted: number; total: number; marks: number }> = {};
    const topicBreakdown: Record<string, { correct: number; wrong: number; attempted: number; total: number; time_total: number; count_with_time: number }> = {};
    const timePerQuestion: number[] = [];
    const wrongQuestionIds: string[] = [];

    const responsesToUpdate: any[] = [];

    for (const qid of questionIds) {
      const q = questionMap[qid];
      if (!q) continue;

      const marksPos = parseFloat(q.marks_positive ?? 4);
      const marksNeg = parseFloat(q.marks_negative ?? 1);
      maxScore += marksPos;

      const resp = responseMap[qid];
      const isAttempted = resp?.is_attempted ?? false;
      const userAnswer = resp?.user_answer ?? null;
      const timeSpent = resp?.time_spent_seconds ?? 0;

      // Subject bucket
      if (!subjectBreakdown[q.subject]) {
        subjectBreakdown[q.subject] = { correct: 0, wrong: 0, attempted: 0, total: 0, marks: 0 };
      }
      subjectBreakdown[q.subject].total++;

      // Topic bucket
      if (!topicBreakdown[q.topic]) {
        topicBreakdown[q.topic] = { correct: 0, wrong: 0, attempted: 0, total: 0, time_total: 0, count_with_time: 0 };
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

      // Update response with is_correct
      responsesToUpdate.push({
        test_id,
        question_id: qid,
        user_id,
        is_correct: isCorrect,
        is_attempted: isAttempted,
        user_answer: userAnswer,
        time_spent_seconds: timeSpent,
      });
    }

    // Build final breakdowns
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

    // Time traps: questions that took > 3x avg time
    const timeTrapThreshold = avgTime * 3;
    const timeTraps = questionIds
      .filter((qid) => (responseMap[qid]?.time_spent_seconds ?? 0) > timeTrapThreshold && timeTrapThreshold > 0)
      .map((qid) => ({ question_id: qid, time_seconds: responseMap[qid].time_spent_seconds }));

    const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const attemptPct = questionIds.length > 0 ? Math.round((totalAttempted / questionIds.length) * 100) : 0;

    // Weak/strong topic classification
    const weakTopics = Object.entries(topicBD)
      .filter(([, v]) => (v as any).attempted > 0 && (v as any).accuracy < 50)
      .map(([k]) => k);
    const strongTopics = Object.entries(topicBD)
      .filter(([, v]) => (v as any).attempted > 0 && (v as any).accuracy >= 80)
      .map(([k]) => k);

    // Predicted percentile (rough heuristic)
    const pctScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const predictedPercentile = Math.min(99, Math.max(1, Math.round(pctScore)));

    // Upsert test_analyses
    const { error: analysisErr } = await db.from("test_analyses").upsert({
      test_id,
      user_id,
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
    }

    // Mark test as COMPLETED
    await db
      .from("mock_tests")
      .update({ status: "COMPLETED", submitted_at: new Date().toISOString() })
      .eq("id", test_id);

    // Add wrong questions to revision list
    if (wrongQuestionIds.length > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      await db.from("revision_list").upsert(
        wrongQuestionIds.map((qid) => ({
          user_id,
          question_id: qid,
          added_from_test_id: test_id,
          next_review_date: tomorrowStr,
          interval_days: 1,
          is_mastered: false,
        })),
        { onConflict: "user_id,question_id", ignoreDuplicates: true }
      );
    }

    // Call update_topic_performance RPC for each topic
    const config = test.config as any;
    const examType = config?.exam_type ?? "GENERAL";

    // Build a user auth client to call RPC as the user
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userToken = authHeader.replace("Bearer ", "");

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get subject for each topic
    const topicToSubject: Record<string, string> = {};
    for (const q of (questions ?? [])) {
      topicToSubject[q.topic] = q.subject;
    }

    for (const [topic, data] of Object.entries(topicBreakdown)) {
      if (data.attempted === 0) continue;
      const avgTopicTime = data.count_with_time > 0
        ? Math.round(data.time_total / data.count_with_time)
        : null;
      await userClient.rpc("update_topic_performance", {
        p_topic: topic,
        p_subject: topicToSubject[topic] ?? "General",
        p_exam_type: examType,
        p_attempted_delta: data.attempted,
        p_correct_delta: data.correct,
        p_avg_time_seconds: avgTopicTime,
      });
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
