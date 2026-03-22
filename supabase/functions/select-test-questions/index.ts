import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// select-test-questions
// Adaptive question selection algorithm:
//   40% from weak topics (accuracy < 50%)
//   30% from medium topics (50–80% accuracy)
//   30% from strong topics (>80% accuracy or never attempted)
// Avoids repeating questions from the last 3 tests.
// Prefers never-attempted questions.
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { config, user_id } = await req.json();
    if (!config || !user_id) {
      return new Response(JSON.stringify({ error: "Missing config or user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createServiceClient();

    const {
      exam_type,
      subjects = [],
      difficulty_distribution = { EASY: 30, MEDIUM: 40, HARD: 30 },
      question_count = 30,
      source_types = ["OFFICIAL_PYP", "AI_GENERATED", "USER_UPLOAD"],
      year_range = null,
    } = config;

    // Fetch user topic performance
    const { data: topicPerf } = await db
      .from("user_topic_performance")
      .select("topic, accuracy, total_attempted")
      .eq("user_id", user_id);

    const topicAccuracyMap: Record<string, number> = {};
    for (const tp of (topicPerf ?? [])) {
      topicAccuracyMap[tp.topic] = tp.accuracy ?? 0;
    }

    // Fetch questions recently used in last 3 tests
    const { data: recentTests } = await db
      .from("mock_tests")
      .select("question_ids")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(3);

    const recentQuestionIds = new Set<string>();
    for (const t of (recentTests ?? [])) {
      for (const qid of (t.question_ids ?? [])) {
        recentQuestionIds.add(qid);
      }
    }

    // Build base query
    let query = db.from("questions").select("id, topic, subject, difficulty, source");

    if (exam_type && exam_type !== "CUSTOM") {
      query = query.eq("exam_type", exam_type);
    }

    if (subjects.length > 0) {
      query = query.in("subject", subjects);
    }

    if (source_types.length > 0) {
      query = query.in("source", source_types);
    }

    if (year_range?.min) {
      query = query.gte("source_year", year_range.min);
    }

    if (year_range?.max) {
      query = query.lte("source_year", year_range.max);
    }

    query = query.eq("is_public", true).limit(1000);

    const { data: allQuestions, error: qErr } = await query;

    if (qErr) {
      console.error("[select-test-questions] query error:", qErr);
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const questions = allQuestions ?? [];

    // Classify questions by topic performance
    const weak: string[]   = [];
    const medium: string[] = [];
    const strong: string[] = [];

    for (const q of questions) {
      // Skip recently used questions
      if (recentQuestionIds.has(q.id)) continue;

      const accuracy = topicAccuracyMap[q.topic];
      if (accuracy === undefined) {
        // Never attempted — treat as strong (prefer new questions)
        strong.push(q.id);
      } else if (accuracy < 50) {
        weak.push(q.id);
      } else if (accuracy <= 80) {
        medium.push(q.id);
      } else {
        strong.push(q.id);
      }
    }

    // Shuffle each bucket
    const shuffle = (arr: string[]) => arr.sort(() => Math.random() - 0.5);
    shuffle(weak);
    shuffle(medium);
    shuffle(strong);

    // Calculate target counts
    const weakTarget   = Math.round(question_count * 0.4);
    const mediumTarget = Math.round(question_count * 0.3);
    const strongTarget = question_count - weakTarget - mediumTarget;

    // Select with overflow redistribution
    const selected: string[] = [];
    const pick = (bucket: string[], target: number) => {
      const taken = bucket.slice(0, target);
      selected.push(...taken);
      return target - taken.length; // leftover
    };

    const leftoverWeak   = pick(weak, weakTarget);
    const leftoverMedium = pick(medium, mediumTarget + leftoverWeak);
    pick(strong, strongTarget + leftoverMedium);

    // If still not enough, add from recent questions as fallback
    if (selected.length < question_count) {
      const remaining = questions
        .map((q) => q.id)
        .filter((id) => !selected.includes(id));
      shuffle(remaining);
      selected.push(...remaining.slice(0, question_count - selected.length));
    }

    // Trim to exact count and shuffle final result
    const finalIds = shuffle(selected.slice(0, question_count));

    return new Response(
      JSON.stringify({ question_ids: finalIds, count: finalIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[select-test-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
