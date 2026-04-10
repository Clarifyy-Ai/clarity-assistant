// select-test-questions/index.ts — PROMPT 2: SMART SHUFFLE & AI GAP-FILL
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";

/* -------------------------------------------------------------------------- */
/* SANITIZATION                                  */
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

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* -------------------------------------------------------------------------- */
/* AI GAP-FILL GENERATOR (PROMPT 2)                   */
/* -------------------------------------------------------------------------- */

async function generateGapQuestions(
  db: ReturnType<typeof createServiceClient>,
  gapCount: number,
  subjects: string[],
  topics: string[],
  examType: string | null
): Promise<string[]> {
  try {
    const subj = subjects.length > 0 ? subjects[0] : "General Subject";
    const topicStr = topics.length > 0 ? topics.slice(0, 3).join(", ") : "Mixed Topics";
    const examStr = examType && examType !== "CUSTOM" ? examType : "General Exam";

    const prompt = `
Generate exactly ${gapCount} high-quality Multiple Choice Questions (MCQs).
Subject: ${subj}
Topics: ${topicStr}
Exam Level: ${examStr}

Requirements:
1. Provide exactly ${gapCount} questions to fill a missing gap in a mock test.
2. Maintain a mix of EASY, MEDIUM, and HARD difficulties.
3. 4 options per question.
4. Correct answer must be exactly "A", "B", "C", or "D".
5. Provide a clear, educational explanation.
6. Return ONLY valid JSON in this exact structure:
{
  "questions": [
    {
      "question_text": "...",
      "options": [
        { "label": "A", "text": "..." },
        { "label": "B", "text": "..." },
        { "label": "C", "text": "..." },
        { "label": "D", "text": "..." }
      ],
      "correct_answer": "A",
      "explanation": "...",
      "difficulty": "MEDIUM",
      "topic": "..."
    }
  ]
}
`.trim();

    // Fast generation using Gemini
    const raw = await geminiGenerate(prompt, undefined, 0.7, 4000);
    const data = parseJSON(raw, { questions: [] });
    const qs = Array.isArray(data.questions) ? data.questions : [];

    const cleaned = qs
      .filter((q) => typeof q?.question_text === "string" && q.question_text.length > 10)
      .map((q) => {
        const diff = ["EASY", "MEDIUM", "HARD"].includes(String(q.difficulty).toUpperCase()) 
          ? String(q.difficulty).toUpperCase() 
          : "MEDIUM";
        
        return {
          question_text: String(q.question_text).slice(0, 1000),
          question_type: "MCQ",
          options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
          correct_answer: ["A", "B", "C", "D"].includes(q.correct_answer) ? q.correct_answer : "A",
          explanation: q.explanation ? String(q.explanation).slice(0, 1000) : "",
          subject: subj,
          topic: q.topic ? String(q.topic).slice(0, 100) : "General",
          difficulty: diff,
          exam_type: examType === "CUSTOM" ? null : examType,
          source: "AI_GENERATED", // Marks with AI badge as requested
          is_verified: false,
          is_public: false, // Save to question bank for future use but keep private
          marks_positive: diff === "HARD" ? 4 : 4,
          marks_negative: 1,
          latex_present: /[=+\-*/^]/.test(String(q.question_text)),
        };
      });

    if (cleaned.length === 0) return [];

    // Save newly generated questions to question bank
    const { data: inserted, error } = await db.from("questions").insert(cleaned).select("id");
    
    if (error) {
      console.warn("[select-test-questions] AI Gap fill insert failed:", error);
      return [];
    }

    return (inserted || []).map((row) => row.id);
  } catch (err) {
    console.warn("[select-test-questions] AI Gap fill failed:", err);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* MAIN FLOW                                 */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ------------------------ AUTH ------------------------ */
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const db = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    /* ------------------------ PARSE INPUT ------------------------ */
    const body = await req.json().catch(() => null);
    const config = body?.config;

    if (!config) return new Response(JSON.stringify({ error: "Missing config" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const exam_type = mapExamType(sanitizeText(config.exam_type ?? ""));
    const subjects = sanitizeList(config.subjects ?? []);
    const topics = sanitizeList(config.topics ?? []);
    const source_types = sanitizeList(config.source_types ?? ["OFFICIAL_PYP"]);

    let question_count = Number(config.question_count ?? 30);
    if (!Number.isFinite(question_count) || question_count < 1) question_count = 30;
    if (question_count > 100) question_count = 100;

    /* ------------------------ LEVEL DISTRIBUTIONS ------------------------ */
    // Provided by Level Selection Screen
    const dd = config.difficulty_distribution ?? { EASY: 20, MEDIUM: 60, HARD: 20 };
    const easyPct = dd.EASY ?? 20;
    const hardPct = dd.HARD ?? 20;
    const medPct = 100 - easyPct - hardPct;

    /* ------------------------ FREE PLAN LIMIT CHECK ------------------------ */
    const FREE_TEST_LIMIT = 10;
    const { data: profile } = await db.from("profiles").select("plan_id, credits").eq("id", userId).single();
    if ((profile?.plan_id ?? "free") === "free") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await db.from("mock_tests").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", startOfMonth.toISOString());

      if ((count ?? 0) >= FREE_TEST_LIMIT) {
        return new Response(JSON.stringify({ error: `Free plan limit reached (${FREE_TEST_LIMIT} tests/month)` }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    /* ------------------------ SMART PERFORMANCE CHECK ------------------------ */
    // Identify topics where accuracy < 60%
    const { data: perfData } = await db.from("user_topic_performance").select("topic, accuracy").eq("user_id", userId);
    const topicAcc: Record<string, number> = {};
    for (const p of perfData ?? []) {
      topicAcc[p.topic] = p.accuracy ?? 0;
    }

    /* ------------------------ PREVIOUS TESTS CHECK ------------------------ */
    // Ensure no question appeared in last 3 tests
    const { data: lastTests } = await db.from("mock_tests").select("question_ids")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(3);

    const recentQ = new Set<string>();
    for (const t of lastTests ?? []) {
      for (const id of t.question_ids ?? []) recentQ.add(id as string);
    }

    /* ------------------------ FETCH QUESTION BANK ------------------------ */
    let query = db.from("questions").select("id, topic, subject, difficulty, source, is_public, uploaded_by").limit(2000);

    if (exam_type && exam_type !== "CUSTOM") query = query.eq("exam_type", exam_type);
    if (subjects.length > 0) query = query.in("subject", subjects);
    if (topics.length > 0) query = query.in("topic", topics);

    const includeUserUploads = source_types.includes("USER_UPLOAD");
    if (includeUserUploads) {
      query = query.or(`and(source.eq.USER_UPLOAD,uploaded_by.eq.${userId}),and(is_public.eq.true)`);
    } else {
      query = query.eq("is_public", true);
    }

    const { data: questionData, error: qErr } = await query;
    if (qErr) return new Response(JSON.stringify({ error: "Failed to fetch questions" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const questions = questionData ?? [];

    /* ------------------------ SMART BUCKETING ALGORITHM ------------------------ */
    const pools: Record<string, { priority: string[]; normal: string[] }> = {
      EASY: { priority: [], normal: [] },
      MEDIUM: { priority: [], normal: [] },
      HARD: { priority: [], normal: [] },
    };

    for (const q of questions) {
      // 1. Check last 3 tests
      if (recentQ.has(q.id)) continue;

      const rawDiff = String(q.difficulty ?? "").toUpperCase();
      const diff = ["EASY", "MEDIUM", "HARD"].includes(rawDiff) ? rawDiff : "MEDIUM";
      const acc = topicAcc[q.topic];

      // 2. Check performance history (prioritize < 60% or unattempted)
      if (acc === undefined || acc < 60) {
        pools[diff].priority.push(q.id);
      } else {
        pools[diff].normal.push(q.id);
      }
    }

    const countEasy = Math.round(question_count * easyPct / 100);
    const countHard = Math.round(question_count * hardPct / 100);
    const countMed  = question_count - countEasy - countHard;

    const pickQuestions = (pool: { priority: string[]; normal: string[] }, targetCount: number) => {
      if (targetCount <= 0) return [];
      // Pull from priority (weak topics) first, then fill with normal
      const combined = [...shuffle(pool.priority), ...shuffle(pool.normal)];
      return combined.slice(0, targetCount);
    };

    const selectedIds = [
      ...pickQuestions(pools.EASY, countEasy),
      ...pickQuestions(pools.MEDIUM, countMed),
      ...pickQuestions(pools.HARD, countHard),
    ];

    /* ------------------------ AI GAP-FILL ------------------------ */
    let finalIds = [...selectedIds];
    const gap = question_count - finalIds.length;
    let generatedCount = 0;

    if (gap > 0) {
      console.log(`[select-test-questions] Need ${question_count}, found ${finalIds.length}. Generating ${gap} more via AI.`);
      const aiIds = await generateGapQuestions(db, gap, subjects, topics, exam_type);
      finalIds.push(...aiIds);
      generatedCount = aiIds.length;
    }

    /* ------------------------ FINAL SHUFFLE ------------------------ */
    // Shuffle final question order randomly before returning
    finalIds = shuffle(finalIds).slice(0, question_count);

    if (finalIds.length === 0) {
      console.warn(`[select-test-questions] WARNING: 0 questions found for exam_type="${exam_type}", subjects=${JSON.stringify(subjects)}, topics=${JSON.stringify(topics)}`);
    }

    return new Response(
      JSON.stringify({
        question_ids: finalIds,
        count: finalIds.length,
        ai_generated_count: generatedCount,
        warning: finalIds.length < question_count ? "Not enough questions even after AI generation." : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[select-test-questions] error:", err);
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
