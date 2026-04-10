// select-test-questions/index.ts
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";

/* ─── SANITIZATION ──────────────────────────────────────────────────────────
 * IMPORTANT: Use the RegExp constructor (not regex literals) so that
 * \w and \s are treated as character-class shorthands, not literal chars.
 * A regex literal /[^\\w]/ matches literal \ or w — which is WRONG here.
 * ─────────────────────────────────────────────────────────────────────────── */

function sanitizeText(text: unknown, max = 100): string {
  return String(text ?? "")
    .replace(new RegExp("[`$]", "g"), "")
    // Allow: word chars, whitespace, hyphen, period, comma, parens, slash, brackets
    .replace(new RegExp("[^\\w\\s\\-.,()[\\]/ ]", "g"), "")
    .slice(0, max)
    .trim();
}

function sanitizeList(list: unknown, max = 20): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((v) => sanitizeText(v))
    .filter((v) => v.length > 0)
    .slice(0, max);
}

function sanitizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ─── AI GAP-FILL ───────────────────────────────────────────────────────────
 * Uses service-role client so RLS is bypassed for the INSERT.
 * Sets uploaded_by = null and is_public = false so gap-fill questions
 * don't pollute the public PYQ bank.
 * ─────────────────────────────────────────────────────────────────────────── */

async function generateGapQuestions(
  db: ReturnType<typeof createServiceClient>,
  gapCount: number,
  subjects: string[],
  topics: string[],
  examType: string | null,
): Promise<string[]> {
  try {
    const subj     = subjects[0] ?? "General Subject";
    const topicStr = topics.slice(0, 3).join(", ") || "Mixed Topics";
    const examStr  = examType && examType !== "CUSTOM" ? examType : "General Competitive Exam";

    const prompt = `
Generate exactly ${gapCount} high-quality Multiple Choice Questions (MCQs).
Subject: ${subj}
Topics: ${topicStr}
Exam Level: ${examStr}

Requirements:
1. Exactly ${gapCount} questions.
2. Mix EASY, MEDIUM, HARD difficulties (roughly 30/40/30).
3. 4 options per question labelled A, B, C, D.
4. correct_answer must be exactly "A", "B", "C", or "D".
5. Provide a clear explanation.
6. Return ONLY valid JSON in this exact structure — no markdown, no code fences:
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
}`.trim();

    const raw  = await geminiGenerate(prompt, undefined, 0.7, 4000);
    const data = parseJSON(raw, { questions: [] });
    const qs   = Array.isArray(data.questions) ? data.questions : [];

    const cleaned = qs
      .filter((q: unknown) => {
        if (typeof q !== "object" || q === null) return false;
        const question = q as Record<string, unknown>;
        return typeof question.question_text === "string" && question.question_text.length > 10;
      })
      .map((q: Record<string, unknown>) => {
        const diffRaw = String(q.difficulty ?? "").toUpperCase();
        const diff    = ["EASY", "MEDIUM", "HARD"].includes(diffRaw) ? diffRaw : "MEDIUM";
        return {
          question_text:   String(q.question_text).slice(0, 1000),
          question_type:   "MCQ",
          options:         Array.isArray(q.options) ? q.options.slice(0, 4) : [],
          correct_answer:  ["A", "B", "C", "D"].includes(String(q.correct_answer))
                             ? String(q.correct_answer)
                             : "A",
          explanation:     q.explanation ? String(q.explanation).slice(0, 1000) : "",
          subject:         subj,
          topic:           q.topic ? String(q.topic).slice(0, 100) : "General",
          difficulty:      diff,
          exam_type:       examType === "CUSTOM" ? null : examType,
          source:          "AI_GENERATED",
          is_verified:     false,
          is_public:       false,         // keep out of public PYQ bank
          uploaded_by:     null,          // service-role insert; not tied to a user
          marks_positive:  4,
          marks_negative:  1,
          latex_present:   /[=+\-*/^]/.test(String(q.question_text)),
        };
      });

    if (cleaned.length === 0) return [];

    const { data: inserted, error } = await db
      .from("questions")
      .insert(cleaned)
      .select("id");

    if (error) {
      console.warn("[select-test-questions] AI gap-fill insert failed:", error.message);
      return [];
    }

    return (inserted ?? []).map((row: { id: string }) => row.id);
  } catch (err) {
    console.warn("[select-test-questions] AI gap-fill error:", err);
    return [];
  }
}

/* ─── MAIN HANDLER ──────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ── AUTH ─────────────────────────────────────────────────────────── */
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    // Use RegExp constructor so \s is treated as whitespace, not literal \s
    if (!new RegExp("^bearer\\s+", "i").test(authHeader)) {
      return new Response(
        JSON.stringify({ error: "Missing or malformed Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract token safely (same RegExp constructor approach)
    const token = authHeader.replace(new RegExp("^bearer\\s+", "i"), "");
    const db    = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = user.id;

    /* ── PARSE & VALIDATE INPUT ──────────────────────────────────────── */
    const body   = await req.json().catch(() => null);
    const config = body?.config;

    if (!config) {
      return new Response(
        JSON.stringify({ error: "Missing config object in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // map exam_papers value / frontend ID  →  questions.exam_type
    const raw_exam_type = sanitizeText(config.exam_type ?? "");
    const exam_type     = raw_exam_type ? mapExamType(raw_exam_type) : null;

    const subjects     = sanitizeList(config.subjects ?? []);
    const topics       = sanitizeList(config.topics ?? []);
    const source_types = sanitizeList(config.source_types ?? ["OFFICIAL_PYP"]);

    const question_count = sanitizeInt(config.question_count, 30, 1, 100);

    // Year range — used to filter by questions.source_year
    const year_range: { min: number; max: number } | null =
      config.year_range &&
      Number.isFinite(Number(config.year_range.min)) &&
      Number.isFinite(Number(config.year_range.max))
        ? { min: Number(config.year_range.min), max: Number(config.year_range.max) }
        : null;

    /* ── DIFFICULTY DISTRIBUTION ─────────────────────────────────────── */
    const dd      = config.difficulty_distribution ?? { EASY: 20, MEDIUM: 60, HARD: 20 };
    const easyPct = sanitizeInt(dd.EASY,   20, 0, 100);
    const hardPct = sanitizeInt(dd.HARD,   20, 0, 100);
    const medPct  = 100 - easyPct - hardPct;

    /* ── FREE PLAN MONTHLY LIMIT ─────────────────────────────────────── */
    const FREE_TEST_LIMIT = 10;
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

      if ((count ?? 0) >= FREE_TEST_LIMIT) {
        return new Response(
          JSON.stringify({ error: `Free plan limit reached (${FREE_TEST_LIMIT} tests/month). Please upgrade.` }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    /* ── PERFORMANCE DATA (smart topic prioritisation) ───────────────── */
    const { data: perfData } = await db
      .from("user_topic_performance")
      .select("topic, accuracy")
      .eq("user_id", userId);

    const topicAcc: Record<string, number> = {};
    for (const p of perfData ?? []) {
      topicAcc[p.topic] = p.accuracy ?? 0;
    }

    /* ── DEDUP: avoid questions from last 3 tests ────────────────────── */
    const { data: lastTests } = await db
      .from("mock_tests")
      .select("question_ids")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    const recentQ = new Set<string>();
    for (const t of lastTests ?? []) {
      for (const id of (t.question_ids ?? []) as string[]) recentQ.add(id);
    }

    /* ── FETCH QUESTION BANK ─────────────────────────────────────────── */
    let query = db
      .from("questions")
      .select("id, topic, subject, difficulty, source, is_public, uploaded_by, source_year")
      .limit(2000);

    // 1. Filter by mapped exam type (questions table value)
    if (exam_type && exam_type !== "CUSTOM") {
      query = query.eq("exam_type", exam_type);
    }

    // 2. Filter by subject when specified
    if (subjects.length > 0) query = query.in("subject", subjects);

    // 3. Filter by topic when specified
    if (topics.length > 0) query = query.in("topic", topics);

    // 4. Filter by source_year range when launching a specific year's paper
    //    This ensures "JEE Main 2020" only pulls questions from that exam year.
    if (year_range) {
      query = query
        .gte("source_year", year_range.min)
        .lte("source_year", year_range.max);
    }

    // 5. Visibility / source filter
    const includeUserUploads = source_types.includes("USER_UPLOAD");
    const includeOnlyPYP     = source_types.includes("OFFICIAL_PYP") && !includeUserUploads;

    if (includeUserUploads) {
      // User's private uploads  OR  any public question
      query = query.or(
        `and(source.eq.USER_UPLOAD,uploaded_by.eq.${userId}),and(is_public.eq.true)`,
      );
    } else if (includeOnlyPYP) {
      // Official PYP questions only
      query = query
        .eq("is_public", true)
        .eq("source", "OFFICIAL_PYP");
    } else {
      // Default: all public questions (custom tests, etc.)
      query = query.eq("is_public", true);
    }

    const { data: questionData, error: qErr } = await query;

    if (qErr) {
      console.error("[select-test-questions] DB fetch error:", qErr.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch questions from database" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const questions = questionData ?? [];

    /* ── SMART BUCKETING ─────────────────────────────────────────────── */
    type Pool = { priority: string[]; normal: string[] };
    const pools: Record<string, Pool> = {
      EASY:   { priority: [], normal: [] },
      MEDIUM: { priority: [], normal: [] },
      HARD:   { priority: [], normal: [] },
    };

    for (const q of questions) {
      if (recentQ.has(q.id)) continue;  // skip recently used

      const rawDiff = String(q.difficulty ?? "").toUpperCase();
      const diff    = ["EASY", "MEDIUM", "HARD"].includes(rawDiff) ? rawDiff : "MEDIUM";
      const acc     = topicAcc[q.topic as string];

      // Prioritise topics where accuracy < 60 % or never attempted
      if (acc === undefined || acc < 60) {
        pools[diff].priority.push(q.id as string);
      } else {
        pools[diff].normal.push(q.id as string);
      }
    }

    const countEasy = Math.round(question_count * easyPct / 100);
    const countHard = Math.round(question_count * hardPct / 100);
    const countMed  = question_count - countEasy - countHard;

    function pickQuestions(pool: Pool, target: number): string[] {
      if (target <= 0) return [];
      const combined = [...shuffle(pool.priority), ...shuffle(pool.normal)];
      return combined.slice(0, target);
    }

    const selectedIds = [
      ...pickQuestions(pools.EASY,   countEasy),
      ...pickQuestions(pools.MEDIUM, countMed),
      ...pickQuestions(pools.HARD,   countHard),
    ];

    /* ── AI GAP-FILL ─────────────────────────────────────────────────── */
    let finalIds = [...selectedIds];
    const gap    = question_count - finalIds.length;
    let generatedCount = 0;

    if (gap > 0) {
      console.log(
        `[select-test-questions] Target=${question_count}, found=${finalIds.length}. ` +
        `Gap-filling ${gap} via AI. exam_type="${exam_type ?? "any"}"`,
      );
      const aiIds = await generateGapQuestions(db, gap, subjects, topics, exam_type);
      finalIds.push(...aiIds);
      generatedCount = aiIds.length;
    }

    /* ── FINAL SHUFFLE & TRIM ────────────────────────────────────────── */
    finalIds = shuffle(finalIds).slice(0, question_count);

    if (finalIds.length === 0) {
      console.warn(
        `[select-test-questions] 0 questions for exam_type="${exam_type}", ` +
        `year_range=${JSON.stringify(year_range)}, subjects=${JSON.stringify(subjects)}`,
      );
    }

    return new Response(
      JSON.stringify({
        question_ids:        finalIds,
        count:               finalIds.length,
        ai_generated_count:  generatedCount,
        warning:
          finalIds.length < question_count
            ? `Only ${finalIds.length} of ${question_count} questions available. More questions will be added soon.`
            : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[select-test-questions] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
