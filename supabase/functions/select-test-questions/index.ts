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
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import {
  buildGapFillPrompt,
  type WeakTopicStat,
} from "../_shared/examAIPrompts.ts";
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
    questions.length === 0 &&
    opts.exam_type &&
    opts.exam_type !== "CUSTOM"
  ) {
    const { data: fallbackData } = await db
      .from("questions")
      .select(baseSelect)
      .eq("exam_type", opts.exam_type)
      .eq("is_public", true)
      .limit(2000);
    questions = (fallbackData ?? []) as QuestionRow[];
  }

  return questions;
}

async function generateGapQuestions(
  db:       ReturnType<typeof createServiceClient>,
  gapCount: number,
  subjects: string[],
  topics:   string[],
  examType: string | null,
  difficultyMix: { EASY: number; MEDIUM: number; HARD: number },
  weakTopics: WeakTopicStat[],
  strongTopics: string[],
): Promise<{ ids: string[]; error?: string }> {  try {
    const systemUserId = getSystemUserId();
    if (!Deno.env.get("GEMINI_API_KEY")?.trim()) {
      return {
        ids: [],
        error: "GEMINI_API_KEY not configured on Supabase",
      };
    }
    const subj         = subjects[0] ?? "General Subject";
    const examStr      = examType && examType !== "CUSTOM"
      ? examType
      : "General Competitive Exam";

    const prompt = buildGapFillPrompt({
      examType: examStr,
      subjects,
      topics,
      weakTopics,
      strongTopics,
      difficultyMix,
      gapCount,
    });
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

    if (wantsAI) {
      const planGate = requirePlan(planId, "pro", req);
      if (planGate) return planGate;
    }

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

    /* ── AI GAP-FILL (Pro+ only, when AI_GENERATED source selected) ─────── */
    let finalIds         = [...selectedIds];
    const gap            = question_count - finalIds.length;
    let generatedCount   = 0;
    let gapFillError: string | undefined;

    if (gap > 0 && wantsAI) {
      const aiCreditCost = creditCost("mock_test_ai_gap_fill");
      const creditResult = await deductCreditsAtomic({
        userId,
        action: "mock_test_ai_gap_fill",
        cost: aiCreditCost,
        idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
      });
      if (!creditResult.success) {
        gapFillError =
          `Need ${aiCreditCost} credits to generate ${gap} AI questions (have ${profile?.credits ?? 0}). ` +
          `Bank provided ${finalIds.length} of ${question_count}.`;
      } else {
        const priorityTopics =
          topics.length > 0
            ? topics
            : weakTopics.slice(0, 5).map((w) => w.topic);

        const gapResult = await generateGapQuestions(
          db,
          gap,
          subjects.length > 0 ? subjects : ["General Subject"],
          priorityTopics,
          exam_type,
          { EASY: easyPct, MEDIUM: medPct, HARD: hardPct },
          weakTopics,
          strongTopics,
        );

        if (gapResult.ids.length > 0) {
          finalIds.push(...gapResult.ids);
          generatedCount = gapResult.ids.length;
        } else if (gapResult.error) {
          gapFillError = gapResult.error;
          try {
            await refundCredits({
              userId,
              cost: aiCreditCost,
              reason: "select-test-questions AI gap-fill failure",
            });
          } catch {
            /* best-effort refund */
          }
        }
      }
    } else if (gap > 0 && !wantsAI) {
      console.warn(
        `[select-test-questions] Bank short by ${gap} for exam_type="${exam_type ?? "any"}". ` +
        `Enable AI-Generated source (Pro plan) for adaptive gap-fill.`,
      );
      gapFillError =
        `Question bank is short by ${gap}. Select "AI-Generated" (Pro) for mixed papers, ` +
        `or import more official papers via Admin → Seed Questions.`;
    }
    /* ── FINAL DEDUP, SHUFFLE & TRIM ─────────────────────────────────── */
    finalIds = shuffle([...new Set(finalIds)]).slice(0, question_count);

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
