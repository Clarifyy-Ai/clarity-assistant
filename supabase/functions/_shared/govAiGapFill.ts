/**
 * Bank-shortfall MCQ generation for gov mocks.
 * Inserts original Gemini MCQs (not claimed as official papers) until the
 * requested count is reached, with fingerprint + quality dedup.
 */

import { createServiceClient } from "./supabase.ts";
import { generateWithFallback } from "./aiProvider.ts";
import { getAiFeaturePolicy, mcqOutputTokenBudget } from "./aiFeaturePolicy.ts";
import { parseJSON } from "./gemini.ts";
import { buildGapFillPrompt, type WeakTopicStat } from "./examAIPrompts.ts";
import {
  conflictsWithSelected,
  normalizeMcqOptions,
  optionsForStorage,
  questionFingerprint,
  resolveCorrectIndex,
  validateSingleCorrectMcq,
} from "./govMcqValidator.ts";
import {
  MIN_BANK_QUESTION_QUALITY,
  QUALITY_ALGORITHM_VERSION,
  scoreQuestionQuality,
} from "./govQualityScore.ts";
import { DEDUP_ALGORITHM_VERSION } from "./algorithmCatalog.ts";

export const GAP_FILL_BATCH = 8;
export const GAP_FILL_MAX_BATCHES = 6;

export type GapFillRow = {
  id: string;
  question_text: string;
  options: unknown;
  correct_answer: string;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  source: string | null;
  source_type?: string | null;
  source_year: number | null;
  is_public: boolean | null;
  is_verified: boolean | null;
};

type ServiceDb = ReturnType<typeof createServiceClient>;

function getSystemUserId(): string | null {
  const id = Deno.env.get("SYSTEM_USER_ID");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return id;
}

function letterForIndex(idx: number): string {
  return ["A", "B", "C", "D"][idx] ?? "A";
}

export type FillUntilOpts = {
  db: ServiceDb;
  targetCount: number;
  existing: GapFillRow[];
  examType: string;
  subjects: string[];
  topics: string[];
  difficultyMix?: { EASY: number; MEDIUM: number; HARD: number };
  weakTopics?: WeakTopicStat[];
  strongTopics?: string[];
  marksPositive?: number;
  marksNegative?: number;
  userId?: string;
  onBatch?: () => Promise<void>;
};

/**
 * Generate and insert unique MCQs until `existing.length + added >= targetCount`.
 * Returns only the newly inserted rows.
 */
export async function fillUntilCount(
  opts: FillUntilOpts,
): Promise<{ added: GapFillRow[]; error?: string }> {
  if (
    !Deno.env.get("GEMINI_API_KEY")?.trim() &&
    !Deno.env.get("OPENAI_API_KEY")?.trim() &&
    !Deno.env.get("ANTHROPIC_API_KEY")?.trim()
  ) {
    return { added: [], error: "No AI provider key configured on Supabase" };
  }

  const added: GapFillRow[] = [];
  const selectedTexts = [
    ...opts.existing.map((r) => String(r.question_text ?? "")),
  ];
  const seenFp = new Set<string>(
    [...opts.existing, ...added].map((r) =>
      questionFingerprint(String(r.question_text ?? ""), normalizeMcqOptions(r.options)),
    ),
  );

  let lastError: string | undefined;
  let emptyBatches = 0;
  const initialNeed = Math.max(0, opts.targetCount - opts.existing.length);
  const maxBatches = Math.min(
    GAP_FILL_MAX_BATCHES,
    Math.ceil(initialNeed / Math.max(1, GAP_FILL_BATCH)) + 1,
  );

  for (let batch = 0; batch < maxBatches; batch++) {
    const have = opts.existing.length + added.length;
    if (have >= opts.targetCount) break;

    if (opts.onBatch) {
      await opts.onBatch();
    }

    const need = Math.min(GAP_FILL_BATCH, opts.targetCount - have);
    const result = await generateAndInsertBatch({
      db: opts.db,
      gapCount: need,
      examType: opts.examType,
      subjects: opts.subjects,
      topics: opts.topics,
      difficultyMix: opts.difficultyMix ?? { EASY: 20, MEDIUM: 60, HARD: 20 },
      weakTopics: opts.weakTopics ?? [],
      strongTopics: opts.strongTopics ?? [],
      avoidStems: selectedTexts.slice(-14),
      batchIndex: batch,
      seenFp,
      selectedTexts,
      marksPositive: opts.marksPositive ?? 1,
      marksNegative: opts.marksNegative ?? 0,
      userId: opts.userId,
    });

    if (result.error) lastError = result.error;
    const quotaHit = /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(result.error ?? "");
    if (result.rows.length === 0) {
      // generateWithFallback already exhausted Gemini + OpenAI/Anthropic.
      if (quotaHit) break;
      emptyBatches += 1;
      if (emptyBatches >= 3) break;
      continue;
    }
    emptyBatches = 0;
    for (const row of result.rows) {
      added.push(row);
      selectedTexts.push(String(row.question_text ?? ""));
    }
  }

  if (opts.existing.length + added.length < opts.targetCount && lastError) {
    return { added, error: lastError };
  }
  return { added };
}

async function generateAndInsertBatch(args: {
  db: ServiceDb;
  gapCount: number;
  examType: string;
  subjects: string[];
  topics: string[];
  difficultyMix: { EASY: number; MEDIUM: number; HARD: number };
  weakTopics: WeakTopicStat[];
  strongTopics: string[];
  avoidStems: string[];
  batchIndex: number;
  seenFp: Set<string>;
  selectedTexts: string[];
  marksPositive: number;
  marksNegative: number;
  userId?: string;
}): Promise<{ rows: GapFillRow[]; error?: string }> {
  const subj = args.subjects[0] ?? "General";
  const examStr = args.examType || "General Competitive Exam";
  const prompt = buildGapFillPrompt({
    examType: examStr,
    subjects: args.subjects.length ? args.subjects : [subj],
    topics: args.topics,
    weakTopics: args.weakTopics,
    strongTopics: args.strongTopics,
    difficultyMix: args.difficultyMix,
    gapCount: args.gapCount,
    avoidStems: args.avoidStems,
    batchIndex: args.batchIndex,
  });

  let raw: string;
  try {
    const policy = getAiFeaturePolicy("gov_ai_gap_fill");
    const generated = await generateWithFallback({
      prompt,
      temperature: 0.85,
      maxTokens: Math.min(mcqOutputTokenBudget(args.gapCount), policy.maxOutputTokens),
      jsonMode: true,
      userId: args.userId ?? getSystemUserId() ?? "gap-fill",
      action: "gov_ai_gap_fill",
      skipSecondaryOnQuota: policy.skipSecondaryOnQuota,
    });
    raw = generated.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI gap-fill failed";
    console.warn("[govAiGapFill] generate error:", message);
    return { rows: [], error: message };
  }

  const data = parseJSON(raw, { questions: [] as unknown[] });
  const qs = Array.isArray(data.questions) ? data.questions : [];
  const systemUserId = getSystemUserId();
  const inserts: Record<string, unknown>[] = [];

  for (const q of qs) {
    if (typeof q !== "object" || q === null) continue;
    const rec = q as Record<string, unknown>;
    const text = String(rec.question_text ?? "").trim().slice(0, 1000)
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/^\s*(reference\s+image|\[figure\])\s*$/gim, "")
      .trim();
    if (text.length < 10) continue;

    const optionTexts = normalizeMcqOptions(rec.options);
    if (optionTexts.length < 4) continue;

    const correctIndex = resolveCorrectIndex(rec.correct_answer, optionTexts.length);
    if (correctIndex == null) continue;

    const mcq = validateSingleCorrectMcq({
      question_text: text,
      options: optionTexts,
      correct_index: correctIndex,
    });
    if (!mcq.ok) continue;

    const fp = questionFingerprint(text, optionTexts);
    if (args.seenFp.has(fp)) continue;
    if (conflictsWithSelected(text, args.selectedTexts)) continue;

    const quality = scoreQuestionQuality({
      question_text: text,
      options: optionTexts,
      correct_index: correctIndex,
      peers: args.selectedTexts,
      sourceConfidence: 0.55,
    });
    if (quality.hardFail || quality.score < MIN_BANK_QUESTION_QUALITY) continue;

    const diffRaw = String(rec.difficulty ?? "").toUpperCase();
    const difficulty = ["EASY", "MEDIUM", "HARD"].includes(diffRaw) ? diffRaw : "MEDIUM";
    const topic =
      String(rec.topic ?? args.topics[0] ?? "General").slice(0, 100) || "General";
    const subject =
      String(rec.subject ?? subj).slice(0, 100) || subj;

    args.seenFp.add(fp);
    args.selectedTexts.push(text);
    inserts.push({
      question_text: text,
      question_type: "MCQ",
      options: optionsForStorage(optionTexts),
      correct_answer: letterForIndex(correctIndex),
      explanation: rec.explanation ? String(rec.explanation).slice(0, 1000) : "",
      subject,
      topic,
      difficulty,
      exam_type: args.examType || null,
      source: "AI_GENERATED",
      source_type: "ai_generated_practice",
      is_verified: false,
      is_public: false,
      uploaded_by: systemUserId,
      marks_positive: args.marksPositive,
      marks_negative: args.marksNegative,
      latex_present: /[=+\-*/^]/.test(text),
      quality_score: quality.score,
      quality_algorithm_version: QUALITY_ALGORITHM_VERSION,
      duplicate_algorithm_version: DEDUP_ALGORITHM_VERSION,
      validation_status: "valid",
      generator_version: "gov_ai_gap_fill_v2",
      generation_method: "ai_gap_fill",
    });
  }

  if (inserts.length === 0) {
    return { rows: [], error: "Gemini returned no unique valid MCQs in this batch" };
  }

  const { data: inserted, error } = await args.db
    .from("questions")
    .insert(inserts)
    .select(
      "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_type, source_year, is_public, is_verified",
    );

  if (error) {
    console.warn("[govAiGapFill] insert failed:", error.message);
    return { rows: [], error: `Database insert failed: ${error.message}` };
  }

  return { rows: (inserted ?? []) as GapFillRow[] };
}
