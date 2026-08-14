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
import { createServiceClient, deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";
import { fillUntilCount, type GapFillRow } from "../_shared/govAiGapFill.ts";
import { type WeakTopicStat } from "../_shared/examAIPrompts.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
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

const PYP_SOURCES = ["OFFICIAL_PYP", "Previous Year Paper", "PYP", "previous_year"];

type QuestionRow = {
  id: string;
  topic: string | null;
  subject: string | null;
  difficulty: string | null;
  source: string | null;
  is_public: boolean | null;
  uploaded_by: string | null;
  source_year: number | null;
};

async function fetchBankQuestions(
  db: ReturnType<typeof createServiceClient>,
  opts: {
    exam_type: string | null;
    subjects: string[];
    topics: string[];
    year_range: { min: number; max: number } | null;
    wantsPYP: boolean;
    wantsAI: boolean;
    includeUserUploads: boolean;
    userId: string;
  },
): Promise<QuestionRow[]> {
  const baseSelect =
    "id, topic, subject, difficulty, source, is_public, uploaded_by, source_year";

  function applyFilters<T extends ReturnType<typeof db.from>>(q: T): T {
    let query = q;
    if (opts.exam_type && opts.exam_type !== "CUSTOM") {
      query = query.eq("exam_type", opts.exam_type) as T;
    }
    if (opts.subjects.length > 0) {
      query = query.in("subject", opts.subjects) as T;
    }
    if (opts.topics.length > 0) {
      query = query.in("topic", opts.topics) as T;
    }
    if (opts.year_range) {
      query = query
        .gte("source_year", opts.year_range.min)
        .lte("source_year", opts.year_range.max) as T;
    }
    return query;
  }

  const merged = new Map<string, QuestionRow>();

  async function addFromQuery(
    builder: ReturnType<typeof db.from>,
  ): Promise<void> {
    const { data, error } = await applyFilters(builder).limit(2000);
    if (error) {
      console.warn("[select-test-questions] bank fetch partial error:", error.message);
      return;
    }
    for (const row of (data ?? []) as QuestionRow[]) {
      merged.set(row.id, row);
    }
  }

  if (opts.wantsPYP) {
    await addFromQuery(
      db.from("questions").select(baseSelect).eq("is_public", true).in("source", PYP_SOURCES),
    );
  }
  if (opts.wantsAI) {
    await addFromQuery(
      db.from("questions").select(baseSelect).eq("source", "AI_GENERATED"),
    );
  }
  if (opts.includeUserUploads) {
    await addFromQuery(
      db
        .from("questions")
        .select(baseSelect)
        .eq("source", "USER_UPLOAD")
        .eq("uploaded_by", opts.userId),
    );
  }

  // Default: public bank when no source flags (should not happen after validation)
  if (!opts.wantsPYP && !opts.wantsAI && !opts.includeUserUploads) {
    await addFromQuery(
      db.from("questions").select(baseSelect).eq("is_public", true),
    );
  }

  let questions = [...merged.values()];

  // Broader fallback when filters are too tight
  if (
    questions.length < 30 &&
    opts.exam_type &&
    opts.exam_type !== "CUSTOM"
  ) {
    const { data: fallbackData } = await db
      .from("questions")
      .select(baseSelect)
      .eq("exam_type", opts.exam_type)
      .eq("is_public", true)
      .limit(2000);
    for (const row of (fallbackData ?? []) as QuestionRow[]) {
      merged.set(row.id, row);
    }
    questions = [...merged.values()];
  }

  return questions;
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

    const rateLimited = await enforceAiRateLimitAsync(
      db,
      "select-test-questions",
      userId,
    );
    if (rateLimited) return rateLimited;

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

    const question_count = sanitizeInt(config.question_count, 30, 1, 200);
    const allow_shortfall =
      config.allow_shortfall === true || config.practice_mode === true;

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
    const FREE_TEST_LIMIT = 3;

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", userId)
      .single();

    const planId = profile?.plan_id ?? "free";

    const includeUserUploads = source_types.includes("USER_UPLOAD");
    const wantsPYP = source_types.includes("OFFICIAL_PYP");
    const wantsAI = source_types.includes("AI_GENERATED");

    if ((planId) === "free") {
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
    let perfQuery = db
      .from("user_topic_performance")
      .select("topic, subject, accuracy")
      .eq("user_id", userId);

    if (exam_type && exam_type !== "CUSTOM") {
      perfQuery = perfQuery.eq("exam_type", exam_type);
    }

    const { data: perfData } = await perfQuery;

    const topicAcc: Record<string, number> = {};
    const weakTopics: WeakTopicStat[] = [];
    const strongTopics: string[] = [];

    for (const p of perfData ?? []) {
      const topic = p.topic as string;
      const acc = (p.accuracy as number) ?? 0;
      topicAcc[topic] = acc;
      if (acc < 60) {
        weakTopics.push({
          topic,
          subject: (p.subject as string) ?? undefined,
          accuracy: Math.round(acc),
        });
      } else if (acc >= 80) {
        strongTopics.push(topic);
      }
    }

    weakTopics.sort((a, b) => a.accuracy - b.accuracy);

    // Recent test analysis weak topics (exam-specific coaching signal)
    const { data: recentAnalyses } = await db
      .from("test_analyses")
      .select("weak_topics")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const row of recentAnalyses ?? []) {
      const wt = row.weak_topics as string[] | null;
      if (!Array.isArray(wt)) continue;
      for (const topic of wt.slice(0, 5)) {
        if (!weakTopics.some((w) => w.topic === topic)) {
          weakTopics.push({ topic, accuracy: 0 });
        }
      }
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

    /* ── FETCH QUESTION BANK (mixed manual + AI sources) ───────────────── */
    const questions = await fetchBankQuestions(db, {
      exam_type,
      subjects,
      topics,
      year_range,
      wantsPYP,
      wantsAI,
      includeUserUploads,
      userId,
    });
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

    /* ── AI GAP-FILL when the exam-specific bank is short ─────────────── */
    let finalIds         = [...selectedIds];
    const gap            = question_count - finalIds.length;
    let generatedCount   = 0;
    let gapFillError: string | undefined;

    if (gap > 0) {
      const aiCreditCost = creditCost("mock_test_ai_gap_fill");
      const creditResult = await deductCreditsAtomic({
        userId,
        action: "mock_test_ai_gap_fill",
        cost: aiCreditCost,
        idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
      });
      if (!creditResult.success) {
        gapFillError =
          `Need ${aiCreditCost} credits to generate remaining questions (have ${profile?.credits ?? 0}). ` +
          `Bank provided ${finalIds.length} of ${question_count}.`;
      } else {
        const priorityTopics =
          topics.length > 0
            ? topics
            : weakTopics.slice(0, 5).map((w) => w.topic);

        let existingRows: GapFillRow[] = [];
        if (finalIds.length > 0) {
          const { data: stemRows } = await db
            .from("questions")
            .select(
              "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_year, is_public, is_verified",
            )
            .in("id", finalIds);
          existingRows = (stemRows ?? []) as GapFillRow[];
        }

        const fill = await fillUntilCount({
          db,
          targetCount: question_count,
          existing: existingRows,
          examType: exam_type && exam_type !== "CUSTOM" ? exam_type : "General Competitive Exam",
          subjects: subjects.length > 0 ? subjects : ["General Subject"],
          topics: priorityTopics,
          difficultyMix: { EASY: easyPct, MEDIUM: medPct, HARD: hardPct },
          weakTopics,
          strongTopics,
        });

        if (fill.added.length > 0) {
          finalIds.push(...fill.added.map((r) => r.id));
          generatedCount = fill.added.length;
        }
        if (fill.error && fill.added.length === 0) {
          gapFillError = fill.error;
          try {
            await refundCredits({
              userId,
              cost: aiCreditCost,
              reason: "select-test-questions AI gap-fill failure",
            });
          } catch {
            /* best-effort refund */
          }
        } else if (fill.error) {
          gapFillError = fill.error;
        }
      }
    }
    /* ── FINAL DEDUP, SHUFFLE & TRIM ─────────────────────────────────── */
    finalIds = shuffle([...new Set(finalIds)]).slice(0, question_count);

    if (finalIds.length === 0) {
      console.warn(
        `[select-test-questions] 0 questions returned for exam_type="${exam_type}", ` +
        `year_range=${JSON.stringify(year_range)}, subjects=${JSON.stringify(subjects)}`,
      );
    }

    if (!allow_shortfall && finalIds.length !== question_count && generatedCount === 0) {
      return new Response(
        JSON.stringify({
          question_ids: finalIds,
          count: finalIds.length,
          required: question_count,
          code: "INSUFFICIENT_APPROVED_QUESTIONS",
          error:
            gapFillError ??
            `Only ${finalIds.length} of ${question_count} questions are available after bank + AI fill.`,
        }),
        { status: 422, headers },
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
