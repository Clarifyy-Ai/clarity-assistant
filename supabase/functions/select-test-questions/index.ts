import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// select-test-questions
// Verifies JWT, deducts 2 credits (test creation cost), then runs
// adaptive question selection:
//   40% from weak topics (accuracy < 50%)
//   30% from medium topics (50–80% accuracy)
//   30% from strong/never-attempted topics
// Avoids repeating questions from the last 3 tests.
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ── Verify JWT and extract authenticated user id ──────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const db = createServiceClient();

    // Verify the token server-side — only trust the user id from the verified JWT
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { config } = await req.json();
    if (!config) {
      return new Response(JSON.stringify({ error: "Missing config" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check free-plan monthly test quota (2 tests/month) ────────
    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", userId)
      .single();

    const planId = profile?.plan_id ?? "free";

    if (planId === "free") {
      // Count tests taken this calendar month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count: monthlyCount } = await db
        .from("mock_tests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString());

      if ((monthlyCount ?? 0) >= 2) {
        return new Response(
          JSON.stringify({
            error: "Free plan limit reached. You can take 2 tests per month. Upgrade for unlimited access.",
            code: "FREE_PLAN_LIMIT",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Deduct 2 credits ──────────────────────────────────────────
    const credited = await deductCredits(db, userId, 2, "Mock test creation");
    if (!credited) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits. Mock tests cost 2 credits.", code: "INSUFFICIENT_CREDITS" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      exam_type,
      subjects = [],
      topics = [],
      source_types = ["OFFICIAL_PYP", "AI_GENERATED", "USER_UPLOAD"],
      year_range = null,
      question_count = 30,
      difficulty_distribution = { EASY: 30, MEDIUM: 40, HARD: 30 },
    } = config;

    // ── Fetch user topic performance ──────────────────────────────
    const { data: topicPerf } = await db
      .from("user_topic_performance")
      .select("topic, accuracy, total_attempted")
      .eq("user_id", userId);

    const topicAccuracyMap: Record<string, number> = {};
    for (const tp of (topicPerf ?? [])) {
      topicAccuracyMap[tp.topic] = tp.accuracy ?? 0;
    }

    // ── Fetch recently used question IDs (last 3 tests) ───────────
    const { data: recentTests } = await db
      .from("mock_tests")
      .select("question_ids")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    const recentQuestionIds = new Set<string>();
    for (const t of (recentTests ?? [])) {
      for (const qid of (t.question_ids ?? [])) {
        recentQuestionIds.add(qid);
      }
    }

    // ── Build question query ──────────────────────────────────────
    let query = db.from("questions").select("id, topic, subject, difficulty, source");

    if (exam_type && exam_type !== "CUSTOM") {
      query = query.eq("exam_type", exam_type);
    }
    if (subjects.length > 0) {
      query = query.in("subject", subjects);
    }
    if (topics.length > 0) {
      query = query.in("topic", topics);
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
    query = query.eq("is_public", true).limit(2000);

    const { data: allQuestions, error: qErr } = await query;

    if (qErr) {
      // Refund credits on query error
      await db.from("profiles").update({ credits: (profile?.credits ?? 0) }).eq("id", userId);
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const questions = allQuestions ?? [];

    // ── Separate questions by difficulty for difficulty-distribution ──
    const easyQ:   string[] = [];
    const mediumQ: string[] = [];
    const hardQ:   string[] = [];

    for (const q of questions) {
      if (recentQuestionIds.has(q.id)) continue;
      const bucket = q.difficulty === "EASY" ? easyQ : q.difficulty === "HARD" ? hardQ : mediumQ;
      bucket.push(q.id);
    }

    // ── Classify by topic performance for adaptive weighting ──────
    const classify = (ids: string[], qLookup: Record<string, any>) => {
      const weak: string[] = [], medium: string[] = [], strong: string[] = [];
      for (const id of ids) {
        const topic = qLookup[id]?.topic;
        const accuracy = topic ? topicAccuracyMap[topic] : undefined;
        if (accuracy === undefined) strong.push(id);
        else if (accuracy < 50) weak.push(id);
        else if (accuracy <= 80) medium.push(id);
        else strong.push(id);
      }
      return { weak, medium, strong };
    };

    const qLookup: Record<string, any> = {};
    for (const q of questions) qLookup[q.id] = q;

    const shuffle = (arr: string[]) => arr.sort(() => Math.random() - 0.5);

    // For each difficulty bucket, apply adaptive weighting
    const pickFromBucket = (bucket: string[], target: number): string[] => {
      if (target <= 0) return [];
      const { weak, medium, strong } = classify(bucket, qLookup);
      shuffle(weak); shuffle(medium); shuffle(strong);
      const wantWeak   = Math.round(target * 0.4);
      const wantMedium = Math.round(target * 0.3);
      const wantStrong = target - wantWeak - wantMedium;
      const selected: string[] = [];
      const pick = (arr: string[], n: number) => {
        const taken = arr.slice(0, n);
        selected.push(...taken);
        return n - taken.length;
      };
      const leftW = pick(weak, wantWeak);
      const leftM = pick(medium, wantMedium + leftW);
      pick(strong, wantStrong + leftM);
      // Fill with anything remaining
      if (selected.length < target) {
        const rest = bucket.filter((id) => !selected.includes(id));
        shuffle(rest);
        selected.push(...rest.slice(0, target - selected.length));
      }
      return selected.slice(0, target);
    };

    // Calculate targets from difficulty_distribution
    const easyTarget   = Math.round(question_count * (difficulty_distribution.EASY ?? 30) / 100);
    const hardTarget   = Math.round(question_count * (difficulty_distribution.HARD ?? 30) / 100);
    const mediumTarget = question_count - easyTarget - hardTarget;

    const easySelected   = pickFromBucket(easyQ, easyTarget);
    const mediumSelected = pickFromBucket(mediumQ, mediumTarget);
    const hardSelected   = pickFromBucket(hardQ, hardTarget);

    let finalIds = [...easySelected, ...mediumSelected, ...hardSelected];

    // Fill any shortfall from any remaining questions
    if (finalIds.length < question_count) {
      const usedSet = new Set(finalIds);
      const extras = questions
        .map((q) => q.id)
        .filter((id) => !usedSet.has(id) && !recentQuestionIds.has(id));
      shuffle(extras);
      finalIds.push(...extras.slice(0, question_count - finalIds.length));
    }

    // Final shuffle and trim
    shuffle(finalIds);
    finalIds = finalIds.slice(0, question_count);

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
