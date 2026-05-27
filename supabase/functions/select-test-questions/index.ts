// select-test-questions/index.ts
//
// Selects a personalised question set for a mock test from the question bank.
// Gap-fills with AI-generated questions (via Gemini) when the bank has
// insufficient questions for the requested exam type / subject / topic.
//
// Requires the following secrets in Supabase Dashboard → Settings → Edge Functions:
//   SYSTEM_USER_ID   — UUID of the system bot account that "owns" AI-generated
//                      questions. Create a non-auth user row in profiles with
//                      role="system" and paste its UUID here. Questions inserted
//                      with this uploaded_by are traceable and filterable.
//   ALLOWED_ORIGINS  — From Fix 27 (cors.ts)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";

/* ─── SANITIZATION ───────────────────────────────────────────────────────── */
//
// REGEX ESCAPING RULE for RegExp constructor strings:
//   "\\w"  → string contains \w  → RegExp sees \w  → word character shorthand ✓
//   "\\\\w" → string contains \\w → RegExp sees \\w → literal backslash + w   ✗
//
// The original code used 4-backslash sequences throughout, causing every
// character class shorthand (\w, \s) to match literal backslash + letter.
// Fixed below with correct 2-backslash sequences.

function sanitizeText(text: unknown, max = 100): string {
  return String(text ?? "")
    // Strip prompt-injection characters
    .replace(new RegExp("[`$]", "g"), "")
    // FIX: was "[^\\\\w\\\\s\\\\-.,()[\\\\]/ ]" (4 backslashes = literal \w)
    //      now "[^\\w\\s\\-.,()[\\]/ ]"         (2 backslashes = word chars)
    // Allows: word chars, whitespace, hyphen, period, comma, parens, slash, brackets
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

/* ─── SYSTEM USER ID ─────────────────────────────────────────────────────── */
//
// AI-generated questions are inserted with uploaded_by = SYSTEM_USER_ID
// so they are:
//   1. Traceable — query WHERE uploaded_by = '<system_uuid>' to find all AI Qs
//   2. Filterable — exclude them from "official PYP only" test configs
//   3. Auditable — system questions can be reviewed and promoted to is_public=true
//
// To set up:
//   1. Create a row in auth.users (or profiles directly) for a bot account
//   2. Copy its UUID
//   3. Add secret: SYSTEM_USER_ID = <that uuid>

function getSystemUserId(): string | null {
  const id = Deno.env.get("SYSTEM_USER_ID");
  if (!id) {
    console.warn(
      "[select-test-questions] SYSTEM_USER_ID secret not set. " +
      "AI-generated questions will be inserted with uploaded_by=null. " +
      "Add SYSTEM_USER_ID in Supabase Dashboard → Settings → Edge Functions → Secrets.",
    );
    return null;
  }
  // Basic UUID format validation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    console.error("[select-test-questions] SYSTEM_USER_ID is not a valid UUID:", id);
    return null;
  }
  return id;
}

/* ─── AI GAP-FILL ────────────────────────────────────────────────────────── */
//
// Uses the service-role client (bypasses RLS) for the INSERT — correct behaviour
// since questions are shared resources not scoped to a single user.
// uploaded_by is set to SYSTEM_USER_ID (not null) for traceability.
// is_public = false keeps AI questions out of the official PYQ bank until reviewed.

async function generateGapQuestions(
  db:       ReturnType<typeof createServiceClient>,
  gapCount: number,
  subjects: string[],
  topics:   string[],
  examType: string | null,
): Promise<{ ids: string[]; error?: string }> {
  try {
    const systemUserId = getSystemUserId();
    if (!Deno.env.get("GEMINI_API_KEY")?.trim()) {
      return {
        ids: [],
        error: "GEMINI_API_KEY not configured on Supabase",
      };
    }
    const subj         = subjects[0] ?? "General Subject";
    const topicStr     = topics.slice(0, 3).join(", ") || "Mixed Topics";
    const examStr      = examType && examType !== "CUSTOM"
      ? examType
      : "General Competitive Exam";

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
        return (
          typeof question.question_text === "string" &&
          question.question_text.length > 10
        );
      })
      .map((q: Record<string, unknown>) => {
        const diffRaw = String(q.difficulty ?? "").toUpperCase();
        const diff    = ["EASY", "MEDIUM", "HARD"].includes(diffRaw)
          ? diffRaw
          : "MEDIUM";
        return {
          question_text:  String(q.question_text).slice(0, 1000),
          question_type:  "MCQ",
          options:        Array.isArray(q.options) ? q.options.slice(0, 4) : [],
          correct_answer: ["A", "B", "C", "D"].includes(String(q.correct_answer))
            ? String(q.correct_answer)
            : "A",
          explanation:    q.explanation ? String(q.explanation).slice(0, 1000) : "",
          subject:        subj,
          topic:          q.topic ? String(q.topic).slice(0, 100) : "General",
          difficulty:     diff,
          exam_type:      examType === "CUSTOM" ? null : examType,
          source:         "AI_GENERATED",
          is_verified:    false,
          is_public:      false,           // kept out of public PYQ bank until reviewed
          // FIX: was `null` — now uses SYSTEM_USER_ID for traceability.
          // Filter AI questions: WHERE uploaded_by = '<system_uuid>' AND source = 'AI_GENERATED'
          uploaded_by:    systemUserId,
          marks_positive: 4,
          marks_negative: 1,
          // FIX: was /[=+\\-*/^]/ — regex literal with \\- matches literal backslash
          // Corrected to check for LaTeX/math indicator characters
          latex_present:  /[=+\-*/^]/.test(String(q.question_text)),
        };
      });

    if (cleaned.length === 0) {
      return { ids: [], error: "Gemini returned no valid MCQ questions" };
    }

    const { data: inserted, error } = await db
      .from("questions")
      .insert(cleaned)
      .select("id");

    if (error) {
      console.warn(
        "[select-test-questions] AI gap-fill insert failed:",
        error.message,
      );
      return { ids: [], error: `Database insert failed: ${error.message}` };
    }

    return { ids: (inserted ?? []).map((row: { id: string }) => row.id) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini gap-fill failed";
    console.warn("[select-test-questions] AI gap-fill error:", err);
    return { ids: [], error: message };
  }
}

/* ─── MAIN HANDLER ───────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Capture req early so getCorsHeaders(req) is available in all return paths
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    /* ── AUTH ──────────────────────────────────────────────────────────── */
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const userId = auth.context.user.id;
    const db = createServiceClient();

    /* ── PARSE & VALIDATE INPUT ────────────────────────────────────────── */
    const body   = await req.json().catch(() => null) as Record<string, unknown> | null;
    const config = body?.config as Record<string, unknown> | undefined;

    if (!config) {
      return new Response(
        JSON.stringify({ error: "Missing config object in request body" }),
        { status: 400, headers },
      );
    }

    const raw_exam_type = sanitizeText(config.exam_type ?? "");
    const exam_type     = raw_exam_type ? mapExamType(raw_exam_type) : null;

    const subjects     = sanitizeList(config.subjects     ?? []);
    const topics       = sanitizeList(config.topics       ?? []);
    const source_types = sanitizeList(config.source_types ?? ["OFFICIAL_PYP"]);

    const question_count = sanitizeInt(config.question_count, 30, 1, 100);

    const year_range_raw = config.year_range as
      | { min?: unknown; max?: unknown }
      | null
      | undefined;

    const year_range: { min: number; max: number } | null =
      year_range_raw &&
      Number.isFinite(Number(year_range_raw.min)) &&
      Number.isFinite(Number(year_range_raw.max))
        ? { min: Number(year_range_raw.min), max: Number(year_range_raw.max) }
        : null;

    /* ── DIFFICULTY DISTRIBUTION ───────────────────────────────────────── */
    const dd = (config.difficulty_distribution ?? {
      EASY: 20, MEDIUM: 60, HARD: 20,
    }) as Record<string, unknown>;

    const easyPct = sanitizeInt(dd.EASY, 20, 0, 100);
    const hardPct = sanitizeInt(dd.HARD, 20, 0, 100);
    const medPct  = 100 - easyPct - hardPct;

    /* ── FREE PLAN MONTHLY LIMIT ───────────────────────────────────────── */
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
          JSON.stringify({
            error: `Free plan limit reached (${FREE_TEST_LIMIT} tests/month). Please upgrade.`,
          }),
          { status: 402, headers },
        );
      }
    }

    /* ── PERFORMANCE DATA (smart topic prioritisation) ─────────────────── */
    const { data: perfData } = await db
      .from("user_topic_performance")
      .select("topic, accuracy")
      .eq("user_id", userId);

    const topicAcc: Record<string, number> = {};
    for (const p of perfData ?? []) {
      topicAcc[p.topic as string] = p.accuracy as number ?? 0;
    }

    /* ── DEDUP: avoid questions from last 3 tests ──────────────────────── */
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

    /* ── FETCH QUESTION BANK ───────────────────────────────────────────── */
    let query = db
      .from("questions")
      .select("id, topic, subject, difficulty, source, is_public, uploaded_by, source_year")
      .limit(2000);

    if (exam_type && exam_type !== "CUSTOM") {
      query = query.eq("exam_type", exam_type);
    }

    if (subjects.length > 0) query = query.in("subject", subjects);
    if (topics.length > 0)   query = query.in("topic", topics);

    if (year_range) {
      query = query
        .gte("source_year", year_range.min)
        .lte("source_year", year_range.max);
    }

    const includeUserUploads = source_types.includes("USER_UPLOAD");
    const wantsPYP = source_types.includes("OFFICIAL_PYP");
    const wantsAI = source_types.includes("AI_GENERATED");
    const includeOnlyPYP = wantsPYP && !wantsAI && !includeUserUploads;

    // Source values used in the questions table vary: "OFFICIAL_PYP",
    // "Previous Year Paper", "PYP", etc. Accept all common variants.
    const PYP_SOURCES = ["OFFICIAL_PYP", "Previous Year Paper", "PYP", "previous_year"];

    if (includeUserUploads) {
      query = query.or(
        `and(source.eq.USER_UPLOAD,uploaded_by.eq.${userId}),and(is_public.eq.true)`,
      );
    } else if (includeOnlyPYP) {
      query = query
        .eq("is_public", true)
        .in("source", PYP_SOURCES);
    } else {
      query = query.eq("is_public", true);
    }

    const { data: questionData, error: qErr } = await query;

    if (qErr) {
      console.error("[select-test-questions] DB fetch error:", qErr.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch questions from database" }),
        { status: 500, headers },
      );
    }

    const questions = questionData ?? [];

    /* ── SMART BUCKETING ───────────────────────────────────────────────── */
    type Pool = { priority: string[]; normal: string[] };
    const pools: Record<string, Pool> = {
      EASY:   { priority: [], normal: [] },
      MEDIUM: { priority: [], normal: [] },
      HARD:   { priority: [], normal: [] },
    };

    for (const q of questions) {
      if (recentQ.has(q.id as string)) continue;

      const rawDiff = String(q.difficulty ?? "").toUpperCase();
      const diff    = ["EASY", "MEDIUM", "HARD"].includes(rawDiff)
        ? rawDiff
        : "MEDIUM";
      const acc     = topicAcc[q.topic as string];

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

    /* ── AI GAP-FILL ───────────────────────────────────────────────────── */
    let finalIds       = [...selectedIds];
    const gap          = question_count - finalIds.length;
    let generatedCount = 0;
    let gapFillError: string | undefined;

    if (gap > 0) {
      console.log(
        `[select-test-questions] Target=${question_count}, found=${finalIds.length}. ` +
        `Gap-filling ${gap} via Gemini. exam_type="${exam_type ?? "any"}"`,
      );
      const gapResult = await generateGapQuestions(db, gap, subjects, topics, exam_type);
      finalIds.push(...gapResult.ids);
      generatedCount = gapResult.ids.length;
      if (gapResult.error && gapResult.ids.length === 0) {
        gapFillError = gapResult.error;
      }
    }

    /* ── FINAL SHUFFLE & TRIM ──────────────────────────────────────────── */
    finalIds = shuffle(finalIds).slice(0, question_count);

    if (finalIds.length === 0) {
      console.warn(
        `[select-test-questions] 0 questions returned for exam_type="${exam_type}", ` +
        `year_range=${JSON.stringify(year_range)}, subjects=${JSON.stringify(subjects)}`,
      );
    }

    return new Response(
      JSON.stringify({
        question_ids:       finalIds,
        count:              finalIds.length,
        ai_generated_count: generatedCount,
        gap_fill_failed:    !!gapFillError,
        error:              gapFillError ?? (finalIds.length === 0
          ? "No questions in bank for this paper. Run Admin → Collect from public sources or upload PDFs."
          : undefined),
        warning:
          finalIds.length < question_count
            ? `Only ${finalIds.length} of ${question_count} questions available.`
            : undefined,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    // FIX: was `detail: String(err)` which leaks stack traces to the client.
    // Log full error server-side; return generic message to client.
    console.error("[select-test-questions] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers },
    );
  }
});
