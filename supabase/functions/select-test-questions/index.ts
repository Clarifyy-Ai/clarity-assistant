// select-test-questions/index.ts — FIXED, SECURE, PRODUCTION VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

/* -------------------------------------------------------------------------- */
/*                              SANITIZATION                                  */
/* -------------------------------------------------------------------------- */

function sanitizeText(text: any, max = 100): string {
  return String(text ?? "")
    .replace(/[`$]/g, "")
    .replace(/[^\w\s\-.,()]/g, "")
    .slice(0, max)
    .trim();
}

function sanitizeList(list: any[], max = 20): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((v) => sanitizeText(v))
    .filter((v) => v.length > 0)
    .slice(0, max);
}

/* -------------------------------------------------------------------------- */
/*                         SAFE AI THIN TOPIC GENERATOR                       */
/* -------------------------------------------------------------------------- */

async function generateThinTopicQuestionsSafe(
  db: ReturnType<typeof createServiceClient>,
  topic: string,
  subject: string,
  examType: string | null
): Promise<void> {
  try {
    const topicSan = sanitizeText(topic);
    const subjectSan = sanitizeText(subject);
    const examSan = examType ? sanitizeText(examType) : null;

    const prompt = `
Generate exactly 10 valid MCQ questions.

Topic: ${topicSan}
Subject: ${subjectSan}
${examSan ? `Exam: ${examSan}` : ""}

Return ONLY JSON: { "questions": [...] }
`.trim();

    const raw = await geminiGenerate(prompt, undefined, 0.6, 3000);
    const data = parseJSON(raw, { questions: [] });

    const qs = Array.isArray(data.questions) ? data.questions : [];

    const cleaned = qs
      .filter((q) => typeof q?.question_text === "string")
      .map((q) => ({
        question_text: String(q.question_text).slice(0, 400),
        question_type: "MCQ",
        options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
        correct_answer: ["A", "B", "C", "D"].includes(q.correct_answer)
          ? q.correct_answer
          : null,
        explanation: q.explanation ? String(q.explanation).slice(0, 400) : "",
        subject: subjectSan,
        topic: topicSan,
        difficulty: ["EASY", "MEDIUM", "HARD"].includes(q.difficulty)
          ? q.difficulty
          : "MEDIUM",
        exam_type: examSan,
        source: "AI_GENERATED",
        is_verified: false,
        is_public: false, // Important: do NOT auto-public
        marks_positive: 4,
        marks_negative: 1,
        latex_present: /[=+\-*/]/.test(q.question_text),
      }));

    if (cleaned.length > 0) {
      await db.from("questions").insert(cleaned);
    }
  } catch (err) {
    console.warn("[select-test-questions] safe thin-topic gen failed:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  MAIN                                      */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ------------------------ AUTH ------------------------ */
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const db = createServiceClient();

    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = user.id;

    /* ------------------------ PARSE INPUT ------------------------ */
    const body = await req.json().catch(() => null);
    const config = body?.config;

    if (!config)
      return new Response(JSON.stringify({ error: "Missing config" }), {
        status: 400,
        headers: corsHeaders,
      });

    const exam_type = sanitizeText(config.exam_type ?? "");
    const subjects = sanitizeList(config.subjects ?? []);
    const topics = sanitizeList(config.topics ?? []);
    const source_types = sanitizeList(config.source_types ?? ["OFFICIAL_PYP"]);

    let question_count = Number(config.question_count ?? 30);
    if (!Number.isFinite(question_count) || question_count < 1)
      question_count = 30;
    if (question_count > 50) question_count = 50;

    /* ------------------------ VALIDATE DIFFICULTY ------------------------ */
    const dd = config.difficulty_distribution ?? {
      EASY: 30,
      MEDIUM: 40,
      HARD: 30,
    };

    const easyPct = dd.EASY ?? 30;
    const hardPct = dd.HARD ?? 30;
    const medPct = 100 - easyPct - hardPct;

    if (easyPct < 0 || hardPct < 0 || medPct < 0)
      return new Response(
        JSON.stringify({ error: "Invalid difficulty distribution" }),
        { status: 400, headers: corsHeaders }
      );

    /* ------------------------ FREE PLAN LIMIT ------------------------ */
    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", userId)
      .single();

    if ((profile?.plan_id ?? "free") === "free") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await db
        .from("mock_tests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString());

      if ((count ?? 0) >= 2)
        return new Response(
          JSON.stringify({
            error: "Free plan limit reached (2 tests/month)",
            code: "FREE_PLAN_LIMIT",
          }),
          { status: 402, headers: corsHeaders }
        );
    }

    if ((profile?.credits ?? 0) < 2) {
      return new Response(
        JSON.stringify({
          error: "Insufficient credits",
          code: "INSUFFICIENT_CREDITS",
        }),
        { status: 402, headers: corsHeaders }
      );
    }

    /* ------------------------ FETCH TOPIC PERFORMANCE ------------------------ */
    const { data: perfData } = await db
      .from("user_topic_performance")
      .select("topic, accuracy, total_attempted")
      .eq("user_id", userId);

    const topicAcc: Record<string, number> = {};
    const attempted = new Set<string>();

    for (const p of perfData ?? []) {
      topicAcc[p.topic] = p.accuracy ?? 0;
      if ((p.total_attempted ?? 0) > 0) attempted.add(p.topic);
    }

    /* ------------------------ RECENT TEST QUESTIONS ------------------------ */
    const { data: lastTests } = await db
      .from("mock_tests")
      .select("question_ids")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    const recentQ = new Set<string>();
    for (const t of lastTests ?? []) {
      for (const id of t.question_ids ?? []) recentQ.add(id as string);
    }

    /* ------------------------ BUILD SAFE DB QUERY ------------------------ */

    let query = db.from("questions")
      .select("id, topic, subject, difficulty, source, is_public, uploaded_by")
      .limit(2000);

    if (exam_type && exam_type !== "CUSTOM")
      query = query.eq("exam_type", exam_type);

    if (subjects.length > 0)
      query = query.in("subject", subjects);

    if (topics.length > 0)
      query = query.in("topic", topics);

    // USER_UPLOAD safe filter
    const includeUserUploads = source_types.includes("USER_UPLOAD");

    if (includeUserUploads) {
      query = query.or(
        `and(source.eq.USER_UPLOAD,uploaded_by.eq.${userId}),and(is_public.eq.true)`
      );
    } else {
      query = query.eq("is_public", true);
    }

    const { data: questionData, error: qErr } = await query;

    if (qErr) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch questions" }),
        { status: 500, headers: corsHeaders }
      );
    }

    let questions = questionData ?? [];

    /* ------------------------ THIN TOPIC GENERATION ------------------------ */
    const topicCounts: Record<string, number> = {};
    for (const q of questions)
      topicCounts[q.topic] = (topicCounts[q.topic] ?? 0) + 1;

    const topicsInScope =
      topics.length > 0
        ? topics
        : [...new Set(questions.map((q) => q.topic))];

    const thinTopics = topicsInScope.filter(
      (t) => (topicCounts[t] ?? 0) < 20
    );

    // generate new questions (safe)
    for (const thin of thinTopics.slice(0, 5)) {
      const subj = questions.find((q) => q.topic === thin)?.subject ??
        subjects[0] ??
        "General";

      await generateThinTopicQuestionsSafe(
        db,
        thin,
        subj,
        exam_type || null
      );
    }

    // refresh query to include newly generated questions
    const { data: refreshed } = await query;
    questions = refreshed ?? questions;

    /* ------------------------ GROUP BY DIFFICULTY ------------------------ */

    const neverAttempted: string[] = [];

    const buckets = {
      EASY: { weak: [], med: [], strong: [] },
      MEDIUM: { weak: [], med: [], strong: [] },
      HARD: { weak: [], med: [], strong: [] },
    };

    for (const q of questions) {
      if (recentQ.has(q.id)) continue;

      const acc = topicAcc[q.topic] ?? null;

      if (acc === null) {
        neverAttempted.push(q.id);
        continue;
      }

      const category =
        acc < 50 ? "weak" :
        acc <= 80 ? "med" :
        "strong";

      const diff = ["EASY", "MEDIUM", "HARD"].includes(q.difficulty)
        ? q.difficulty
        : "MEDIUM";

      buckets[diff][category].push(q.id);
    }

    const shuffle = (arr) =>
      [...arr].sort(() => Math.random() - 0.5);

    /* ------------------------ SELECTION ------------------------ */

    const countEasy = Math.round(question_count * easyPct / 100);
    const countHard = Math.round(question_count * hardPct / 100);
    const countMed = question_count - countEasy - countHard;

    function pick(b, target) {
      if (target <= 0) return [];

      const pool = [
        ...shuffle(neverAttempted.slice(0, 3)),
        ...shuffle(b.weak),
        ...shuffle(b.med),
        ...shuffle(b.strong),
      ];

      return pool.slice(0, target);
    }

    let final = [
      ...pick(buckets.EASY, countEasy),
      ...pick(buckets.MEDIUM, countMed),
      ...pick(buckets.HARD, countHard),
    ];

    // backfill if needed
    if (final.length < question_count) {
      const used = new Set(final);
      const remaining = shuffle(
        questions
          .map((q) => q.id)
          .filter((id) => !used.has(id) && !recentQ.has(id))
      );
      final.push(...remaining.slice(0, question_count - final.length));
    }

    final = shuffle(final).slice(0, question_count);

    return new Response(
      JSON.stringify({
        question_ids: final,
        count: final.length,
        warning:
          final.length < question_count
            ? "Not enough questions available; returned fewer than requested"
            : undefined,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[select-test-questions] error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        detail: String(err),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});


import { handleCors, corsHeaders } from "../_shared/cors.ts";
