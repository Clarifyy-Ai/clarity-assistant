// bulk-import-questions
//
// WORKER / INGEST ONLY — not a product UI endpoint.
// The browser app never calls this. The FastAPI scraper (or an operator with
// INGEST_API_KEY) posts papers + MCQs. The current scraper also writes via
// service role; this function remains the keyed HTTP ingest alternative.
//
// Auth: header `x-ingest-key` MUST match the `INGEST_API_KEY` secret.
// JWT is disabled (config.toml verify_jwt=false) because the caller is a
// server, not a browser user. Fail-closed: missing INGEST_API_KEY → 503.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { getClientIp } from "../_shared/auth.ts";
import { takeUniqueStemRows } from "../_shared/questionStemDedupe.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";
import {
  normalizeMcqOptions,
  resolveCorrectIndex,
  validateSingleCorrectMcq,
  conflictsWithSelected,
} from "../_shared/govMcqValidator.ts";
import { MIN_BANK_QUESTION_QUALITY, scoreQuestionQuality } from "../_shared/govQualityScore.ts";
import {
  evaluateAutoApproval,
  parseRuleRow,
  buildIdempotencyKey,
  DEFAULT_QUESTION_RULE,
  type QuestionValidationInput,
} from "../_shared/govAutoApproval.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

const FUNCTION_NAME = "bulk-import-questions";
/** Soft cap for a 500-question paper payload (text + options + explanations). */
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUESTIONS = 500;

const VALID_DIFFICULTY = ["EASY", "MEDIUM", "HARD"] as const;
const VALID_ANSWER = ["A", "B", "C", "D"] as const;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const optionSchema = z.object({
  label: z.string().max(8).optional(),
  text: z.string().max(2000).optional(),
}).passthrough();

const questionSchema = z.object({
  question_text: z.string().min(1).max(4000),
  options: z.array(optionSchema).max(8).optional(),
  correct_answer: z.string().max(8).optional(),
  explanation: z.string().max(4000).optional(),
  subject: z.string().max(120).optional(),
  topic: z.string().max(120).optional(),
  difficulty: z.string().max(16).optional(),
  image_url: z.string().max(1000).nullable().optional(),
  latex_present: z.boolean().optional(),
  marks_positive: z.number().finite().optional(),
  marks_negative: z.number().finite().optional(),
}).passthrough();

const paperSchema = z.object({
  exam_name: z.string().min(1).max(200),
  session: z.string().max(60).optional().nullable(),
  shift: z.string().max(20).optional().nullable(),
  total_questions: z.number().finite().optional().nullable(),
  total_marks: z.number().finite().optional().nullable(),
  duration_minutes: z.number().finite().optional().nullable(),
  difficulty_level: z.string().max(16).optional().nullable(),
}).passthrough();

const bodySchema = z.object({
  exam_type: z.string().min(1).max(120),
  source_year: z.number().int().min(1990).max(2100),
  paper: paperSchema.nullable().optional(),
  questions: z.array(questionSchema).min(1).max(MAX_QUESTIONS),
});

type IncomingBody = z.infer<typeof bodySchema>;

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function s(v: unknown, max = 2000): string {
  return String(v ?? "").slice(0, max).trim();
}

function normalizeDifficulty(v: unknown): "EASY" | "MEDIUM" | "HARD" {
  const u = String(v ?? "").toUpperCase();
  return (VALID_DIFFICULTY as readonly string[]).includes(u)
    ? (u as "EASY" | "MEDIUM" | "HARD")
    : "MEDIUM";
}

function normalizeAnswer(v: unknown): "A" | "B" | "C" | "D" {
  const u = String(v ?? "").toUpperCase();
  return (VALID_ANSWER as readonly string[]).includes(u)
    ? (u as "A" | "B" | "C" | "D")
    : "A";
}

async function hashIngestKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function rejectOversizedPayload(req: Request): Response | null {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > MAX_BODY_BYTES) {
      return json(
        {
          error: "Request body is too large.",
          code: "PAYLOAD_TOO_LARGE",
          maxBodyBytes: MAX_BODY_BYTES,
        },
        413,
        req,
      );
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  // ── Auth: shared-secret header (JWT intentionally not required) ──────────
  const expectedKey = Deno.env.get("INGEST_API_KEY")?.trim();
  if (!expectedKey) {
    // Fail closed — never allow unauthenticated ingest if secret is unset.
    console.error("[bulk-import-questions] INGEST_API_KEY missing — refusing requests");
    return json(
      { error: "INGEST_API_KEY not configured on Supabase", code: "INGEST_MISCONFIGURED" },
      503,
      req,
    );
  }
  const providedKey = req.headers.get("x-ingest-key")?.trim();
  if (!providedKey || !timingSafeEqual(providedKey, expectedKey)) {
    return json({ error: "Forbidden" }, 403, req);
  }

  const oversized = rejectOversizedPayload(req);
  if (oversized) return oversized;

  // ── Distributed rate limit (keyed by ingest-key hash + IP) ───────────────
  const db = createServiceClient();
  const keyHash = await hashIngestKey(providedKey);
  const clientIp = getClientIp(req) ?? "unknown";
  const rateLimited = await enforceRateLimitAsync(db, {
    key: createRateLimitKey(FUNCTION_NAME, keyHash, clientIp),
    ...RATE_LIMIT_PRESETS.BULK_INGEST,
  });
  if (rateLimited) {
    // backendFailure → 503; quota exceeded → 429 (handled inside rateLimitResponse)
    return withCorsHeaders(req, rateLimited);
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return json({ error: "Invalid request body" }, 400, req);
  }

  if (rawText.length > MAX_BODY_BYTES) {
    return json(
      {
        error: "Request body is too large.",
        code: "PAYLOAD_TOO_LARGE",
        maxBodyBytes: MAX_BODY_BYTES,
      },
      413,
      req,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return json({ error: "Invalid JSON body" }, 400, req);
  }

  const validated = bodySchema.safeParse(parsedJson);
  if (!validated.success) {
    return json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: validated.error.flatten(),
      },
      400,
      req,
    );
  }

  const body: IncomingBody = validated.data;
  const examType = mapExamType(s(body.exam_type, 120)) || s(body.exam_type, 120);
  const sourceYear = body.source_year;
  const paper = body.paper ?? null;
  const rawQuestions = body.questions;

  const systemUserId = Deno.env.get("SYSTEM_USER_ID")?.trim() || null;

  // ── Upsert exam_papers row (optional) ───────────────────────────────────
  let paperId: string | null = null;
  if (paper && paper.exam_name) {
    const paperRow = {
      exam_type: examType,
      exam_name: s(paper.exam_name, 200),
      year: sourceYear,
      session: paper.session ? s(paper.session, 60) : null,
      shift: paper.shift ? s(paper.shift, 20) : null,
      total_questions: Number(paper.total_questions) || rawQuestions.length,
      total_marks: Number(paper.total_marks) || null,
      duration_minutes: Number(paper.duration_minutes) || null,
      difficulty_level: paper.difficulty_level
        ? normalizeDifficulty(paper.difficulty_level)
        : null,
    };

    let existingQuery = db
      .from("exam_papers")
      .select("id")
      .eq("exam_type", paperRow.exam_type)
      .eq("exam_name", paperRow.exam_name)
      .eq("year", paperRow.year);
    existingQuery = paperRow.shift
      ? existingQuery.eq("shift", paperRow.shift)
      : existingQuery.is("shift", null);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      paperId = existing.id;
    } else {
      const { data: inserted, error: paperErr } = await db
        .from("exam_papers")
        .insert(paperRow)
        .select("id")
        .maybeSingle();

      if (paperErr) {
        console.error("[bulk-import-questions] exam_papers insert:", paperErr.message);
      } else {
        paperId = inserted?.id ?? null;
      }
    }
  }

  // ── Build & insert question rows ────────────────────────────────────────
  const rows = rawQuestions
    .filter((q) => typeof q.question_text === "string" && q.question_text.trim().length > 5)
    .map((q) => {
      const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      return {
        question_text: s(q.question_text, 4000),
        question_type: "MCQ",
        options,
        correct_answer: normalizeAnswer(q.correct_answer),
        explanation: q.explanation ? s(q.explanation, 4000) : "",
        subject: q.subject ? s(q.subject, 120) : "General",
        topic: q.topic ? s(q.topic, 120) : "PYQ",
        difficulty: normalizeDifficulty(q.difficulty),
        exam_type: examType,
        source: "OFFICIAL_PYP",
        source_type: "official_verified",
        source_year: sourceYear,
        is_verified: true,
        is_public: true,
        uploaded_by: systemUserId,
        marks_positive: Number(q.marks_positive) || 4,
        marks_negative: Number(q.marks_negative) || 1,
        image_url: q.image_url ? s(q.image_url, 1000) : null,
        latex_present: Boolean(q.latex_present),
      };
    });

  if (rows.length === 0) {
    return json({ error: "No valid questions in payload" }, 400, req);
  }

  const { data: existingQuestions } = await db
    .from("questions")
    .select("question_text, options")
    .eq("exam_type", examType)
    .limit(4000);

  const { novel, skipped } = takeUniqueStemRows(
    rows,
    (existingQuestions ?? []).map((r) => String((r as { question_text?: string }).question_text ?? "")),
  );
  const existingTexts = (existingQuestions ?? []).map((r) =>
    String((r as { question_text?: string }).question_text ?? "")
  );
  const accepted: typeof novel = [];
  const rowErrors: Array<{ row: number; code: string; message: string }> = [];
  for (const row of novel) {
    const options = normalizeMcqOptions(row.options);
    const correctIndex = resolveCorrectIndex(row.correct_answer, options.length);
    const structural = validateSingleCorrectMcq({
      question_text: row.question_text,
      options,
      correct_index: correctIndex ?? -1,
    });
    if (!structural.ok) {
      rowErrors.push({ row: rawQuestions.indexOf(row) + 1, code: structural.code, message: structural.message });
      continue;
    }
    if (conflictsWithSelected(row.question_text, [...existingTexts, ...accepted.map((q) => q.question_text)])) {
      rowErrors.push({ row: rawQuestions.indexOf(row) + 1, code: "DUPLICATE_QUESTION", message: "Exact or near-duplicate question." });
      continue;
    }
    const quality = scoreQuestionQuality({
      question_text: row.question_text,
      options,
      correct_index: correctIndex ?? -1,
      sourceConfidence: 0.9,
    });
    if (quality.hardFail || quality.score < MIN_BANK_QUESTION_QUALITY) {
      rowErrors.push({ row: rawQuestions.indexOf(row) + 1, code: "QUALITY_FAILED", message: "Question did not meet the quality threshold." });
      continue;
    }
    accepted.push({
      ...row,
      options: options.map((text, index) => ({ label: VALID_ANSWER[index], text })),
      correct_answer: VALID_ANSWER[correctIndex!],
      quality_score: quality.score,
      is_public: false,
      is_verified: false,
      publish_status: "draft",
      review_status: "review_required",
      validation_status: "valid",
    });
  }
  const validatedNovel = accepted;
  const skippedCount = rawQuestions.length - rows.length + skipped + novel.length - validatedNovel.length;

  if (validatedNovel.length === 0) {
    return json(
      {
        success: true,
        paper_id: paperId,
        inserted_count: 0,
        skipped_count: skippedCount,
        row_errors: rowErrors,
        exam_type: examType,
        source_year: sourceYear,
        row_errors: rowErrors,
        message: "All questions already exist in the public bank.",
      },
      200,
      req,
    );
  }

  const { data: inserted, error: insertErr } = await db
    .from("questions")
    .insert(validatedNovel)
    .select("id");

  if (insertErr) {
    console.error("[bulk-import-questions] insert:", insertErr.message);
    return json({ error: `Insert failed: ${insertErr.message}` }, 500, req);
  }

  // ── Auto-approval pipeline (deterministic, rule-based, fail-closed) ───────
  const { data: ruleRow } = await db
    .from("gov_auto_approval_rules")
    .select("*")
    .eq("entity_type", "question")
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rule = ruleRow
    ? parseRuleRow(ruleRow as Record<string, unknown>)
    : DEFAULT_QUESTION_RULE;

  const autoApprovalResults: Array<{ id: string; outcome: string }> = [];

  for (let i = 0; i < (inserted?.length ?? 0); i++) {
    const qRow = validatedNovel[i];
    const qId = (inserted?.[i] as { id?: string })?.id;
    if (!qId || !qRow) continue;

    const quality = scoreQuestionQuality({
      question_text: qRow.question_text,
      options: normalizeMcqOptions(qRow.options).map((t) => t),
      correct_index: resolveCorrectIndex(qRow.correct_answer, 4) ?? 0,
      sourceConfidence: 0.9,
    });

    const validation: QuestionValidationInput = {
      entityType: "question",
      questionId: qId,
      sourceType: String(qRow.source_type ?? "official_verified"),
      qualityScore: quality.score,
      qualityHardFail: quality.hardFail,
      hardFailCodes: quality.hardFailCodes,
      duplicateStatus: "unique",
      hasProvenance: true,
      hasValidExam: Boolean(examType),
      hasValidStage: true,
      hasValidSection: true,
      hasValidSubject: Boolean(qRow.subject),
      hasValidLanguage: true,
      hasValidOptions: true,
      hasValidAnswer: !quality.hardFailCodes.includes("MCQ_STRUCTURE_INVALID"),
      hasValidDifficulty: VALID_DIFFICULTY.includes(qRow.difficulty as typeof VALID_DIFFICULTY[number]),
      ocrUncertainty: false,
      answerKeyConflict: quality.hardFailCodes.includes("ANSWER_VERIFICATION_FAILED"),
      policyViolation: false,
      unresolvedReviewFlag: false,
      sourceApproved: true,
    };

    const evaluation = evaluateAutoApproval(validation, rule);
    const idempotencyKey = buildIdempotencyKey("question", qId, null, rule.ruleVersion);

    try {
      await db.rpc("apply_auto_approval_event", {
        p_entity_type: "question",
        p_entity_id: qId,
        p_outcome: evaluation.outcome,
        p_approval_mode: evaluation.approvalMode,
        p_rule_version: evaluation.ruleVersion,
        p_rule_evaluation: { flags: evaluation.flags, ruleResults: evaluation.ruleResults },
        p_source_type: evaluation.sourceType,
        p_quality_score: evaluation.qualityScore,
        p_duplicate_result: evaluation.duplicateResult,
        p_provenance: { source: qRow.source, source_year: sourceYear },
        p_previous_status: evaluation.previousStatus,
        p_new_status: evaluation.newStatus,
        p_publish_status: evaluation.publishStatus,
        p_idempotency_key: idempotencyKey,
        p_auto_publish: evaluation.autoPublish,
      });
      autoApprovalResults.push({ id: qId, outcome: evaluation.outcome });
    } catch (aaErr) {
      console.error("[bulk-import-questions] auto-approval failed for", qId, aaErr);
      autoApprovalResults.push({ id: qId, outcome: "AUTO_APPROVAL_FAILED" });
    }
  }

  return json(
    {
      success: true,
      paper_id: paperId,
      inserted_count: inserted?.length ?? 0,
      skipped_count: skippedCount,
      exam_type: examType,
      source_year: sourceYear,
      auto_approval: autoApprovalResults,
    },
    200,
    req,
  );
});
