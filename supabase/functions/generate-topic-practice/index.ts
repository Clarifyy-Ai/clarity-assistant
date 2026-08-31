/**
 * generate-topic-practice — JWT + banCheck + rateLimit; credits via create_mock_test.
 * Assembles a Custom Practice Set from public+verified bank rows matching topics
 * (subject OR topic). Prefer a smaller clearly labeled set when the bank is short;
 * never claim full exam simulation.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import { reservePaperJobCredits, releasePaperJobCredits, finalizePaperJobCredits } from "../_shared/claimJobCredits.ts";
import {
  countEligibleGovQuestions,
  inventoryInsufficientPayload,
} from "../_shared/govQuestionInventory.ts";
import {
  attemptLimitPayload,
  checkGovExamAttemptLimit,
} from "../_shared/govAttemptLimits.ts";
import { isUniqueViolation } from "../_shared/postgresErrors.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  checkRateLimitAsyncWithLocalFallback,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { seededShuffle } from "../_shared/govBlueprint.ts";
import {
  conflictsWithSelected,
  normalizeMcqOptions,
  questionFingerprint,
  resolveCorrectIndex,
} from "../_shared/govMcqValidator.ts";
import {
  MIN_BANK_QUESTION_QUALITY,
  scoreQuestionQuality,
} from "../_shared/govQualityScore.ts";
import { filterQuestionsByTopics } from "../_shared/govTopicFilter.ts";
import {
  GOV_QUESTION_COUNT_ABS_MAX,
  validateGovQuestionCount,
} from "../_shared/govQuestionCount.ts";
import { examBankTypeKeys, mapExamType } from "../_shared/examTypeMap.ts";
import { type GapFillRow } from "../_shared/govAiGapFill.ts";

const COST = creditCost("create_mock_test");

function customPracticeLabel(count: number, requested: number, topics: string[], aiFilled = 0): string {
  const topicHint =
    topics.length <= 3
      ? topics.join(", ")
      : `${topics.slice(0, 3).join(", ")} (+${topics.length - 3} more)`;
  const fillNote =
    aiFilled > 0
      ? ` Bank plus ${aiFilled} unique AI-generated questions.`
      : count < requested
        ? ` Assembled ${count} of ${requested} requested from available approved bank items.`
        : " Assembled from available approved bank items.";
  return (
    `Custom Practice Set (${count} questions) — topic-focused (${topicHint}).` +
    fillNote +
    " Not a full official exam simulation."
  );
}

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

function parseDifficulty(v: unknown): "EASY" | "MEDIUM" | "HARD" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  if (s === "EASY" || s === "MEDIUM" || s === "HARD") return s;
  return null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsyncWithLocalFallback(db, {
      key: createRateLimitKey("generate-topic-practice", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const b = body as Record<string, unknown>;
    const examId = uuidOrNull(b.examId);
    if (!examId) {
      return json(req, { error: "examId required", code: "VALIDATION_ERROR" }, 400);
    }

    const topics = Array.isArray(b.topics)
      ? (b.topics as unknown[])
        .map((t) => String(t ?? "").trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 20)
      : [];

    if (topics.length === 0) {
      return json(req, {
        error: "topics[] required (at least one topic)",
        code: "VALIDATION_ERROR",
      }, 400);
    }

    const qc = validateGovQuestionCount(b.questionCount, GOV_QUESTION_COUNT_ABS_MAX);
    if (!qc.ok) {
      return json(req, { error: qc.error, code: qc.code }, 400);
    }
    const questionCount = qc.value;

    const language = String(b.language ?? "en").trim().slice(0, 8) || "en";
    const difficulty = parseDifficulty(b.difficulty);
    const stageId = uuidOrNull(b.stageId);
    const idempotencyKey =
      String(b.idempotencyKey ?? req.headers.get("x-idempotency-key") ?? "")
        .trim()
        .slice(0, 120) || crypto.randomUUID();
    const randomSeed = String(b.randomSeed ?? "").trim().slice(0, 120) || idempotencyKey;

    const { data: exam, error: examErr } = await db
      .from("gov_exams")
      .select("id, code, name, legacy_exam_type, review_state, is_public")
      .eq("id", examId)
      .maybeSingle();

    if (examErr || !exam) {
      return json(req, { error: "Exam not found", code: "EXAM_NOT_FOUND" }, 404);
    }
    if (exam.review_state !== "approved" || !exam.is_public) {
      return json(req, {
        error: "Exam version is not approved for public use",
        code: "EXAM_VERSION_NOT_APPROVED",
      }, 409);
    }

    // Idempotent replay
    const { data: existing } = await db
      .from("gov_paper_generation_jobs")
      .select(
        "id, status, mock_test_id, generated_paper_id, error_code, progress_stage, request_json",
      )
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      const reqJson = (existing.request_json ?? {}) as Record<string, unknown>;
      const priorCount = Number(reqJson.finalQuestionCount);
      const disclaimer =
        typeof reqJson.disclaimer === "string"
          ? reqJson.disclaimer
          : customPracticeLabel(
            Number.isFinite(priorCount) ? priorCount : questionCount,
            questionCount,
            topics,
          );
      return json(req, {
        jobId: existing.id,
        status: existing.status,
        mockTestId: existing.mock_test_id,
        paperId: existing.generated_paper_id,
        errorCode: existing.error_code,
        progressStage: existing.progress_stage,
        questionCount: Number.isFinite(priorCount) ? priorCount : undefined,
        paperClass: "custom_practice",
        disclaimer,
        idempotentReplay: true,
      }, existing.status === "completed" ? 200 : 202);
    }

    let patternId: string | null = null;
    let marksPerQ = 1;
    let negativeMark = 0;
    let durationMinutes = Math.max(5, Math.round(questionCount * 1.2));

    if (stageId) {
      const { data: pattern } = await db
        .from("gov_exam_pattern_versions")
        .select("id, marks_per_question, negative_mark, duration_minutes, total_questions")
        .eq("exam_id", examId)
        .eq("stage_id", stageId)
        .eq("review_state", "approved")
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pattern) {
        patternId = pattern.id as string;
        marksPerQ = Number(pattern.marks_per_question) || 1;
        negativeMark = Number(pattern.negative_mark) || 0;
        const fullDur = Number(pattern.duration_minutes) || 60;
        const fullQ = Number(pattern.total_questions) || questionCount;
        durationMinutes = Math.max(
          5,
          Math.round((fullDur / Math.max(1, fullQ)) * questionCount),
        );
      }
    }

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", user.id)
      .maybeSingle();

    const attemptLimit = await checkGovExamAttemptLimit(db, user.id, profile?.plan_id);
    if (!attemptLimit.allowed) {
      return json(req, attemptLimitPayload(attemptLimit), 429);
    }

    const inventory = await countEligibleGovQuestions(db, {
      examId,
      exam: {
        code: exam.code as string | null,
        name: exam.name as string | null,
        legacy_exam_type: exam.legacy_exam_type as string | null,
      },
      topics,
      difficulty,
    });

    if (inventory.available < questionCount) {
      return json(req, inventoryInsufficientPayload(inventory.available, questionCount), 409);
    }

    const { data: job, error: jobErr } = await db
      .from("gov_paper_generation_jobs")
      .insert({
        user_id: user.id,
        exam_id: examId,
        stage_id: stageId,
        pattern_version_id: patternId,
        mode: "custom_mock",
        language,
        request_json: { ...b, topics, questionCount, difficulty, skipAiFill: true },
        status: "selecting",
        progress_stage: "selecting_questions",
        idempotency_key: idempotencyKey,
        credits_charged: 0,
        credits_reserved: 0,
        random_seed: randomSeed,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      if (isUniqueViolation(jobErr)) {
        const { data: replay } = await db
          .from("gov_paper_generation_jobs")
          .select("id, status, mock_test_id, generated_paper_id, error_code, progress_stage, request_json")
          .eq("user_id", user.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (replay) {
          return json(req, {
            jobId: replay.id,
            status: replay.status,
            mockTestId: replay.mock_test_id,
            paperId: replay.generated_paper_id,
            errorCode: replay.error_code,
            progressStage: replay.progress_stage,
            paperClass: "custom_practice",
            idempotentReplay: true,
          }, replay.status === "completed" ? 200 : 202);
        }
      }
      console.error("[generate-topic-practice] job:", jobErr);
      return json(req, { error: "Failed to create job", code: "PAPER_GENERATION_FAILED" }, 500);
    }

    const reserved = await reservePaperJobCredits(
      db,
      job.id as string,
      user.id,
      COST,
      `gov_topic_practice:${idempotencyKey}`,
    );

    if (!reserved.success) {
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "failed_permanent",
          progress_stage: "failed_permanent",
          retryable: false,
          error_code: String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
          error_message: "Could not reserve credits for this paper.",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return creditDenialResponse(req, reserved.denial ?? { success: false }, COST);
    }

    const jobId = job.id as string;

    try {
      const examTypeKeys = examBankTypeKeys({
        code: exam.code as string | null,
        name: exam.name as string | null,
        legacy_exam_type: exam.legacy_exam_type as string | null,
      });
      const insertExamType =
        (exam.legacy_exam_type as string | null) ||
        mapExamType(String(exam.code ?? exam.name ?? ""));

      let bankRows: GapFillRow[] = [];
      if (examTypeKeys.length > 0) {
        let qQuery = db
          .from("questions")
          .select(
            "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_year, is_public, is_verified",
          )
          .eq("is_public", true)
          .eq("publish_status", "published")
          .eq("review_status", "approved")
          .in("exam_type", examTypeKeys)
          .limit(800);
        if (difficulty) {
          qQuery = qQuery.eq("difficulty", difficulty);
        }
        const { data, error: bankErr } = await qQuery;
        if (bankErr) throw new Error(bankErr.message);
        bankRows = (data ?? []) as GapFillRow[];
      }

      // Match subject OR topic (normalized); AI-fill remaining unique items.
      const topicMatched = filterQuestionsByTopics(bankRows, topics);
      const candidates = seededShuffle(topicMatched, randomSeed);
      const selected: GapFillRow[] = [];
      const seenFp = new Set<string>();
      const aiQuestionIds = new Set<string>();

      for (const row of candidates) {
        if (selected.length >= questionCount) break;
        const text = String(row.question_text ?? "");
        const options = normalizeMcqOptions(row.options);
        const correctIndex = resolveCorrectIndex(row.correct_answer, options.length);
        if (correctIndex == null) continue;

        const fp = questionFingerprint(text, options);
        if (seenFp.has(fp)) continue;

        const peerTexts = selected.map((p) => String(p.question_text ?? ""));
        if (conflictsWithSelected(text, peerTexts)) continue;

        const quality = scoreQuestionQuality({
          question_text: text,
          options,
          correct_index: correctIndex,
          peers: peerTexts,
          sourceConfidence: 0.75,
        });
        if (quality.hardFail || quality.score < MIN_BANK_QUESTION_QUALITY) continue;

        seenFp.add(fp);
        selected.push(row);
      }

      if (selected.length < questionCount) {
        await db
          .from("gov_paper_generation_jobs")
          .update({
            status: "failed",
            progress_stage: "failed",
            error_code: "QUESTION_INVENTORY_INSUFFICIENT",
            error_message: `Only ${selected.length} of ${questionCount} requested questions passed validation.`,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        await releasePaperJobCredits(db, jobId, "refund_topic_practice_insufficient");

        return json(req, {
          jobId,
          status: "failed",
          errorCode: "QUESTION_INVENTORY_INSUFFICIENT",
          error: `Only ${selected.length} approved questions are available for this configuration.`,
          available: selected.length,
          requested: questionCount,
          required: questionCount,
          paperClass: "custom_practice",
        }, 409);
      }

      const finalCount = Math.min(selected.length, questionCount);
      const questionIds = selected.slice(0, finalCount).map((q) => q.id);
      const totalMarks = finalCount * marksPerQ;
      const aiFilled = 0;
      const paperClass = "custom_practice";
      const disclaimer = customPracticeLabel(finalCount, questionCount, topics, aiFilled);
      durationMinutes = Math.max(
        5,
        Math.round((durationMinutes / Math.max(1, questionCount)) * finalCount),
      );

      const { data: mockTest, error: mtErr } = await db
        .from("mock_tests")
        .insert({
          user_id: user.id,
          test_name: `${exam.name} · ${aiFilled > 0 ? "Topic practice" : "Custom Practice Set"}`,
          question_ids: questionIds,
          time_limit_minutes: durationMinutes,
          config: {
            exam_type: exam.code,
            gov_exam_id: examId,
            gov_stage_id: stageId,
            paper_class: paperClass,
            marks_positive: marksPerQ,
            marks_negative: negativeMark,
            duration_minutes: durationMinutes,
            language,
            topics,
            difficulty,
            disclaimer,
            generation_job_id: jobId,
            label: aiFilled > 0 ? "AI-assisted topic practice" : "Custom Practice Set",
            shuffle_questions: false,
            shuffle_options: false,
          },
          status: "DRAFT",
        })
        .select("id")
        .single();

      if (mtErr || !mockTest) {
        throw new Error(mtErr?.message ?? "mock_tests insert failed");
      }

      const { data: paper, error: paperErr } = await db
        .from("gov_generated_papers")
        .insert({
          exam_id: examId,
          stage_id: stageId,
          pattern_version_id: patternId,
          job_id: jobId,
          created_by: user.id,
          title: `${exam.name} · ${aiFilled > 0 ? "Topic practice" : "Custom Practice Set"}`,
          paper_class: paperClass,
          language,
          question_count: questionIds.length,
          total_marks: totalMarks,
          duration_minutes: durationMinutes,
          negative_mark: negativeMark,
          blueprint_json: {
            topics,
            questionCount: finalCount,
            requestedQuestionCount: questionCount,
            difficulty,
            paper_class: paperClass,
            label: disclaimer,
          },
          provenance_json: {
            assembly: "topic_practice_v2",
            seed: randomSeed,
            topics,
            difficulty,
            question_ids: questionIds,
            shrunk: finalCount < questionCount,
            ai_filled_count: aiFilled,
          },
          review_state: "machine_validated",
          disclaimer,
          mock_test_id: mockTest.id,
        })
        .select("id")
        .single();

      if (paperErr || !paper) {
        throw new Error(paperErr?.message ?? "gov_generated_papers insert failed");
      }

      const linkRows = questionIds.map((qid, idx) => ({
        paper_id: paper.id,
        question_id: qid,
        section_code: null,
        sort_order: idx,
        source_class: aiQuestionIds.has(qid) ? ("generated" as const) : ("bank" as const),
      }));
      if (linkRows.length) {
        await db.from("gov_generated_paper_questions").insert(linkRows);
      }

      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "completed",
          progress_stage: "completed",
          mock_test_id: mockTest.id,
          generated_paper_id: paper.id,
          request_json: {
            ...b,
            topics,
            questionCount,
            difficulty,
            finalQuestionCount: finalCount,
            disclaimer,
          },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      await finalizePaperJobCredits(db, jobId);

      return json(req, {
        jobId,
        status: "completed",
        mockTestId: mockTest.id,
        paperId: paper.id,
        questionCount: questionIds.length,
        paperClass,
        label: aiFilled > 0 ? "AI-assisted topic practice" : "Custom Practice Set",
        disclaimer,
        topics,
        creditsCharged: COST,
        shrunk: finalCount < questionCount,
      }, 200);
    } catch (procErr) {
      console.error("[generate-topic-practice] process:", procErr);
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "failed",
          progress_stage: "failed",
          error_code: "PAPER_GENERATION_FAILED",
          error_message: "Topic practice generation failed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      await releasePaperJobCredits(db, jobId, "refund_topic_practice_failed");
      return json(req, {
        jobId,
        status: "failed",
        errorCode: "PAPER_GENERATION_FAILED",
        error: "Topic practice generation failed",
      }, 500);
    }
  } catch (err) {
    console.error("[generate-topic-practice]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
