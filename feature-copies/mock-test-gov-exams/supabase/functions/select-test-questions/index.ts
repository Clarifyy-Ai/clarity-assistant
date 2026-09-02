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
import { hasCapability, requireCapabilityAsync } from "../_shared/requireCapability.ts";
import {
  attemptLimitPayload,
  checkGovExamAttemptLimit,
} from "../_shared/govAttemptLimits.ts";
import {
  conflictsWithSelected,
  normalizeMcqOptions,
  resolveCorrectIndex,
} from "../_shared/govMcqValidator.ts";
import { DEDUP_POLICY } from "../_shared/algorithmCatalog.ts";
import {
  isPythonGovExamConfigured,
  pythonGovValidateQuestions,
} from "../_shared/pythonGovExamClient.ts";
import {
  decideSelectTestOutcome,
  isQuickDrillConfig,
  mergeUniqueQuestionIds,
  selectAdaptiveQuestionIds,
  shouldInvokeAiFill,
} from "../_shared/selectTestQuestionAssembly.ts";
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
  question_text?: string | null;
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
    /** Quick Drill uses the full approved bank, not PYP-only. */
    quickDrill: boolean;
  },
): Promise<QuestionRow[]> {
  const baseSelect =
    "id, question_text, topic, subject, difficulty, source, is_public, uploaded_by, source_year";

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

  const approvedPublic = () =>
    db
      .from("questions")
      .select(baseSelect)
      .eq("is_public", true)
      .eq("publish_status", "published")
      .eq("review_status", "approved");

  if (opts.quickDrill) {
    // Adaptive drill: all approved bank items. Do not relabel AI / uploads as official.
    await addFromQuery(approvedPublic());
  } else if (opts.wantsPYP) {
    await addFromQuery(approvedPublic().in("source", PYP_SOURCES));
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
  if (!opts.quickDrill && !opts.wantsPYP && !opts.wantsAI && !opts.includeUserUploads) {
    await addFromQuery(approvedPublic());
  }

  let questions = [...merged.values()];

  // Broader fallback when filters are too tight
  if (
    questions.length < 30 &&
    opts.exam_type &&
    opts.exam_type !== "CUSTOM"
  ) {
    // Broaden only the non-taxonomy filters. Do not accidentally mix in
    // unrelated sources (or another user's uploads) when the requested paper
    // is PYP-only, AI-only, or user-upload-only.
    const addFallback = async (
      builder: ReturnType<typeof db.from>,
    ): Promise<void> => {
      const { data: fallbackData } = await builder
        .eq("exam_type", opts.exam_type)
        .limit(2000);
      for (const row of (fallbackData ?? []) as QuestionRow[]) {
        merged.set(row.id, row);
      }
    };
    if (opts.quickDrill) {
      await addFallback(
        db.from("questions")
          .select(baseSelect)
          .eq("is_public", true)
          .eq("publish_status", "published")
          .eq("review_status", "approved"),
      );
    } else if (opts.wantsPYP) {
      await addFallback(
        db.from("questions")
          .select(baseSelect)
          .eq("is_public", true)
          .eq("publish_status", "published")
          .eq("review_status", "approved")
          .in("source", PYP_SOURCES),
      );
    }
    if (opts.wantsAI) {
      await addFallback(
        db.from("questions").select(baseSelect).eq("source", "AI_GENERATED"),
      );
    }
    if (opts.includeUserUploads) {
      await addFallback(
        db
          .from("questions")
          .select(baseSelect)
          .eq("source", "USER_UPLOAD")
          .eq("uploaded_by", opts.userId),
      );
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

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", userId)
      .single();

    const planId = profile?.plan_id ?? "free";

    const includeUserUploads = source_types.includes("USER_UPLOAD");
    const wantsPYP = source_types.includes("OFFICIAL_PYP");
    const wantsAIExplicit = source_types.includes("AI_GENERATED");
    const quickDrill = isQuickDrillConfig(config);
    const allowAiFillFlag = config.allow_ai_fill === true;
    const hasAiFillCapability = hasCapability(planId, "gov_exam_ai_fill");
    const invokeAiFill = shouldInvokeAiFill({
      sourceTypes: source_types,
      quickDrill,
      allowAiFill: allowAiFillFlag,
      hasAiFillCapability,
    });

    // Explicit AI source is a paid opt-in. Quick Drill may fill without that flag
    // when the plan already has gov_exam_ai_fill — do not 403 the whole drill.
    if (wantsAIExplicit) {
      const capabilityGate = await requireCapabilityAsync(planId, "gov_exam_ai_fill", req);
      if (capabilityGate) return capabilityGate;
    }

    const attemptLimit = await checkGovExamAttemptLimit(db, userId, planId);
    if (!attemptLimit.allowed) {
      return new Response(
        JSON.stringify(attemptLimitPayload(attemptLimit)),
        { status: 429, headers },
      );
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
      wantsAI: wantsAIExplicit || invokeAiFill,
      includeUserUploads,
      userId,
      quickDrill,
    });

    const picked = selectAdaptiveQuestionIds({
      questions,
      questionCount: question_count,
      recentIds: recentQ,
      easyPct,
      hardPct,
      topicAcc,
      conflictsWithSelected: (stem, selected) =>
        conflictsWithSelected(stem, selected, DEDUP_POLICY.stem_only_conflict),
      shuffle,
    });

    let finalIds = [...picked.ids];
    const aiInsertedIds = new Set<string>();
    let gapFillError: string | undefined;
    let aiCreditsDeducted = false;
    let aiCreditCost = 0;
    let aiFillAttempted = false;

    const gapFillSelect =
      "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_year, is_public, is_verified";

    async function loadGapFillRows(ids: string[]): Promise<GapFillRow[]> {
      if (ids.length === 0) return [];
      const { data: stemRows } = await db
        .from("questions")
        .select(gapFillSelect)
        .in("id", ids);
      return (stemRows ?? []) as GapFillRow[];
    }

    async function attemptAiFill(existingIds: string[]): Promise<void> {
      if (!invokeAiFill || existingIds.length >= question_count) return;
      aiFillAttempted = true;

      if (!aiCreditsDeducted) {
        aiCreditCost = creditCost("mock_test_ai_gap_fill");
        const creditResult = await deductCreditsAtomic({
          userId,
          action: "mock_test_ai_gap_fill",
          cost: aiCreditCost,
          idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
        });
        if (!creditResult.success) {
          gapFillError =
            creditResult.code === "INSUFFICIENT_CREDITS"
              ? `Need ${aiCreditCost} credits to generate remaining questions (have ${creditResult.balance ?? profile?.credits ?? 0}). Bank provided ${existingIds.length} of ${question_count}.`
              : (creditResult.error ?? "Credit deduction failed.");
          return;
        }
        aiCreditsDeducted = true;
      }

      const priorityTopics =
        topics.length > 0
          ? topics
          : weakTopics.slice(0, 5).map((w) => w.topic);

      const fill = await fillUntilCount({
        db,
        targetCount: question_count,
        existing: await loadGapFillRows(existingIds),
        examType: exam_type && exam_type !== "CUSTOM" ? exam_type : "General Competitive Exam",
        subjects: subjects.length > 0 ? subjects : ["General Subject"],
        topics: priorityTopics,
        difficultyMix: { EASY: easyPct, MEDIUM: medPct, HARD: hardPct },
        weakTopics,
        strongTopics,
        userId,
      });

      for (const row of fill.added) {
        aiInsertedIds.add(row.id);
        existingIds.push(row.id);
      }
      if (fill.error && fill.added.length === 0) {
        gapFillError = fill.error;
        if (aiCreditsDeducted && aiInsertedIds.size === 0) {
          try {
            await refundCredits({
              userId,
              cost: aiCreditCost,
              reason: "select-test-questions AI gap-fill failure",
            });
            aiCreditsDeducted = false;
          } catch {
            /* best-effort refund */
          }
        }
      } else if (fill.error) {
        gapFillError = fill.error;
      }
    }

    await attemptAiFill(finalIds);

    /* ── FINAL DEDUP, SHUFFLE & TRIM ─────────────────────────────────── */
    finalIds = mergeUniqueQuestionIds(finalIds, [], question_count, shuffle);

    /* ── Python validation (drop rejected; never invent placeholder items) ───── */
    async function dropRejectedByPython(ids: string[]): Promise<string[]> {
      if (!isPythonGovExamConfigured() || ids.length === 0) return ids;
      const { data: validateRows, error: validateErr } = await db
        .from("questions")
        .select(
          "id, question_text, options, correct_answer, subject, topic, difficulty, source",
        )
        .in("id", ids);

      if (validateErr) {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] select_test_python_validate_fetch_failed",
          message: validateErr.message,
        }));
        return ids;
      }

      const byId = new Map(
        ((validateRows ?? []) as Array<{
          id: string;
          question_text?: string | null;
          options?: unknown;
          correct_answer?: unknown;
          subject?: string | null;
          topic?: string | null;
          difficulty?: string | null;
          source?: string | null;
        }>).map((row) => [row.id, row]),
      );
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (ordered.length === 0) return [];

      const payloads = ordered.map((row) => {
        const options = normalizeMcqOptions(row.options);
        const correctIndex = resolveCorrectIndex(row.correct_answer, options.length);
        return {
          id: String(row.id ?? ""),
          question_text: String(row.question_text ?? ""),
          options,
          correct_index: correctIndex,
          correct_answer: correctIndex != null ? String.fromCharCode(65 + correctIndex) : null,
          subject: row.subject != null ? String(row.subject) : null,
          topic: row.topic != null ? String(row.topic) : null,
          difficulty: row.difficulty != null ? String(row.difficulty) : null,
          language: "en",
          source: row.source != null ? String(row.source) : null,
        };
      });
      const pyVal = await pythonGovValidateQuestions({
        questions: payloads,
        correlation_id: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
        language: "en",
        reject_near_duplicates: true,
      });
      if (pyVal.ok && pyVal.data.rejected_indices.length > 0) {
        const drop = new Set(pyVal.data.rejected_indices);
        return ordered.filter((_, idx) => !drop.has(idx)).map((row) => row.id);
      }
      if (pyVal.ok) return ordered.map((row) => row.id);
      console.warn(JSON.stringify({
        tag: "[GOV_EXAM] select_test_python_validate_failed",
        code: pyVal.error.code,
      }));
      return ids;
    }

    finalIds = await dropRejectedByPython(finalIds);

    // Validation may drop a full bank set. If AI fill is allowed, fill the gap
    // instead of treating a valid fallback as unprocessable (422).
    if (invokeAiFill && finalIds.length < question_count) {
      await attemptAiFill(finalIds);
      finalIds = mergeUniqueQuestionIds(finalIds, [], question_count, shuffle);
      finalIds = await dropRejectedByPython(finalIds);
    }

    finalIds = mergeUniqueQuestionIds(finalIds, [], question_count, shuffle);
    const generatedCount = finalIds.filter((id) => aiInsertedIds.has(id)).length;

    if (finalIds.length === 0) {
      console.warn(
        `[select-test-questions] 0 questions returned for exam_type="${exam_type}", ` +
        `year_range=${JSON.stringify(year_range)}, subjects=${JSON.stringify(subjects)}`,
      );
    }

    const outcome = decideSelectTestOutcome({
      selectedIds: finalIds,
      questionCount: question_count,
      allowShortfall: allow_shortfall,
      aiFillEnabled: invokeAiFill,
      aiFillAttempted,
      aiGeneratedCount: generatedCount,
      aiFillError: gapFillError,
      pypOnly: wantsPYP && !wantsAIExplicit && !invokeAiFill,
    });

    if (outcome.status === "unprocessable" || outcome.status === "shortage") {
      const creditShortage =
        outcome.status === "shortage" &&
        typeof gapFillError === "string" &&
        /credits/i.test(gapFillError);
      return new Response(
        JSON.stringify({
          question_ids: outcome.questionIds,
          count: outcome.available,
          required: outcome.requested,
          available: outcome.available,
          requested: outcome.requested,
          code: creditShortage
            ? "INSUFFICIENT_CREDITS"
            : (outcome.code ?? "QUESTION_INVENTORY_INSUFFICIENT"),
          error: outcome.error,
          ai_generated_count: outcome.aiGeneratedCount,
          gap_fill_failed: !!gapFillError,
        }),
        { status: creditShortage ? 402 : outcome.httpStatus, headers },
      );
    }

    return new Response(
      JSON.stringify({
        question_ids:       outcome.questionIds,
        count:              outcome.questionIds.length,
        ai_generated_count: outcome.aiGeneratedCount,
        gap_fill_failed:    !!gapFillError,
        error:              gapFillError ?? (outcome.questionIds.length === 0
          ? "No questions in bank for this paper. Run Admin → Collect from public sources or upload PDFs."
          : undefined),
        warning:            outcome.warning,
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
