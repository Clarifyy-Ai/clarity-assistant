/**
 * Bank-first paper assembly pipeline for gov_paper_generation_jobs.
 * Shared by create-exam-paper (waitUntil/inline) and process-paper-generation-job.
 *
 * Hybrid model: MATRIX `gov_exam_assemble` (database → python → optional AI).
 * Durable / plan-driven — not request-scoped `executeHybridOperation`.
 * On AI gap-fill failure or shortfall, always attempt Python select + bank
 * reassembly when the plan allows (`pythonFallbackOnAiFailure` /
 * `allowDeterministicFill`).
 */

import { createServiceClient } from "./supabase.ts";
import { finalizePaperJobCredits, refundClaimedPaperCredits } from "./claimJobCredits.ts";
import {
  buildBlueprint,
  seededShuffle,
  validateBlueprintHardConstraints,
  validateAssembledPaperHardConstraints,
  type PatternSection,
} from "./govBlueprint.ts";
import { hasCapability } from "./requireCapability.ts";
import {
  conflictsWithSelected,
  findNearDuplicatesInSet,
  normalizeMcqOptions,
  questionFingerprint,
  resolveCorrectIndex,
} from "./govMcqValidator.ts";
import {
  MIN_BANK_QUESTION_QUALITY,
  QUALITY_ALGORITHM_VERSION,
  scorePaperQuality,
  scoreQuestionQuality,
} from "./govQualityScore.ts";
import { clampGovQuestionCount, GOV_QUESTION_COUNT_ABS_MAX } from "./govQuestionCount.ts";
import { DEDUP_ALGORITHM_VERSION } from "./algorithmCatalog.ts";
import {
  runBankMultiAgentValidation,
  validatePaperSimilarity,
} from "./govMultiAgentValidation.ts";
import { examBankTypeKeys, mapExamType } from "./examTypeMap.ts";
import { fillUntilCount, type GapFillRow } from "./govAiGapFill.ts";
import { adaptiveSoftPriority } from "./masteryEngine.ts";
import {
  claimPaperGenerationJob,
  clearJobLease,
  heartbeatJobLease,
  isJobCancelled,
  setJobIfActive,
  type ServiceDb,
} from "./govPaperJobLease.ts";
import {
  isPythonGovExamConfigured,
  pythonGovSelect,
  pythonGovValidateQuestions,
} from "./pythonGovExamClient.ts";
import { decideRoute } from "./operationRouter.ts";
import { recordOperationSource } from "./operationSource.ts";

/**
 * Flattens `gov_exam_syllabus_versions.topics_json` (`[{ section, topics[] }]`) into a
 * readable topic list for AI prompting. Returns `[]` when no approved syllabus exists.
 */
export async function loadSyllabusTopics(
  db: ServiceDb,
  syllabusVersionId: string | null | undefined,
): Promise<string[]> {
  if (!syllabusVersionId) return [];
  const { data, error } = await db
    .from("gov_exam_syllabus_versions")
    .select("topics_json")
    .eq("id", syllabusVersionId)
    .maybeSingle();
  if (error || !data) return [];

  const raw = (data as { topics_json?: unknown }).topics_json;
  const collected: string[] = [];

  const pushTopic = (value: unknown) => {
    const text = String(value ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) collected.push(text);
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const topics = (entry as { topics?: unknown })?.topics;
      if (Array.isArray(topics)) topics.forEach(pushTopic);
    }
  } else if (raw && typeof raw === "object") {
    for (const topics of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(topics)) topics.forEach(pushTopic);
    }
  }

  return [...new Set(collected)];
}

export type AssemblyResult =
  | {
    ok: true;
    status: "completed";
    mockTestId: string;
    paperId: string;
    questionCount: number;
    paperClass: string;
    disclaimer: string;
    patternVersion: string | null;
    syllabusVersion: string | null;
  }
  | {
    ok: false;
    status: "failed" | "cancelled";
    errorCode: string;
    error: string;
    httpStatus?: number;
    available?: number;
    required?: number;
  };

type JobRow = {
  id: string;
  user_id: string;
  exam_id: string;
  stage_id: string | null;
  pattern_version_id: string | null;
  syllabus_version_id: string | null;
  mode: string;
  language: string;
  request_json: Record<string, unknown> | null;
  credits_charged: number;
  random_seed: string | null;
  mock_test_id: string | null;
  generated_paper_id: string | null;
};

type PaperSourceType =
  | "official_verified"
  | "verified_public_source"
  | "approved_bank"
  | "generated_practice"
  | "ai_generated_practice";

const OFFICIAL_MODE_ALLOWED = new Set<PaperSourceType>([
  "official_verified",
  "verified_public_source",
  "approved_bank",
]);

const GENERATED_SOURCE_TYPES = new Set<PaperSourceType>([
  "generated_practice",
  "ai_generated_practice",
]);

function canonicalSourceType(row: Record<string, unknown>, aiQuestionIds: Set<string>): PaperSourceType {
  if (aiQuestionIds.has(String(row.id ?? ""))) return "ai_generated_practice";
  const explicit = String(row.source_type ?? "").trim().toLowerCase();
  if (
    explicit === "official_verified" ||
    explicit === "verified_public_source" ||
    explicit === "approved_bank" ||
    explicit === "generated_practice" ||
    explicit === "ai_generated_practice"
  ) {
    return explicit;
  }
  const source = String(row.source ?? "").trim().toLowerCase();
  if (["official_pyp", "official", "previous_year", "pyq", "pyp"].includes(source)) {
    return "official_verified";
  }
  if (source.includes("ai")) return "ai_generated_practice";
  if (source.includes("generated") || source.includes("deterministic")) {
    return "generated_practice";
  }
  return "approved_bank";
}

/** DB CHECK on gov_generated_paper_questions.source_class. */
function mapToLegacySourceClass(sourceType: PaperSourceType): "previous_year" | "generated" | "bank" {
  if (sourceType === "official_verified") return "previous_year";
  if (GENERATED_SOURCE_TYPES.has(sourceType)) return "generated";
  return "bank";
}

function allowedSourceForMode(mode: string, sourceType: PaperSourceType): boolean {
  if (mode === "official_previous") {
    return OFFICIAL_MODE_ALLOWED.has(sourceType) && !GENERATED_SOURCE_TYPES.has(sourceType);
  }
  return true;
}

function resolvePaperSource(mix: Record<string, number>, mode: string): string {
  if (mode === "official_previous") return "official_verified";
  const generated = (mix.generated_practice ?? 0) + (mix.ai_generated_practice ?? 0);
  const bankish =
    (mix.official_verified ?? 0) +
    (mix.verified_public_source ?? 0) +
    (mix.approved_bank ?? 0);
  if (generated > 0 && bankish > 0) return "hybrid_realistic_mock";
  if ((mix.ai_generated_practice ?? 0) > 0) return "ai_generated_practice";
  if ((mix.generated_practice ?? 0) > 0) return "generated_practice";
  if ((mix.official_verified ?? 0) > 0) return "official_verified";
  return "approved_bank";
}

async function stage(
  db: ServiceDb,
  jobId: string,
  workerId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<"ok" | "cancelled" | "lost_lease"> {
  if (await isJobCancelled(db, jobId)) return "cancelled";
  const beat = await heartbeatJobLease(db, jobId, workerId);
  if (!beat) {
    // Lease lost or job terminal — re-check cancel
    if (await isJobCancelled(db, jobId)) return "cancelled";
    return "lost_lease";
  }
  const ok = await setJobIfActive(
    db,
    jobId,
    { status, progress_stage: status, ...extra },
    { workerId },
  );
  if (!ok) {
    if (await isJobCancelled(db, jobId)) return "cancelled";
    return "lost_lease";
  }
  return "ok";
}

async function failJob(
  db: ServiceDb,
  job: JobRow,
  workerId: string,
  errorCode: string,
  errorMessage: string,
  retryable: boolean,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Retryable: re-queue with cleared lease so another worker can claim.
  // Terminal: mark failed, refund credits, stop further claims.
  if (retryable) {
    await setJobIfActive(
      db,
      job.id,
      {
        status: "failed_retryable",
        progress_stage: "failed_retryable",
        error_code: errorCode,
        error_message: errorMessage,
        retryable: true,
        completed_at: new Date().toISOString(),
        worker_id: null,
        lease_expires_at: null,
        ...extra,
      },
      { workerId },
    );
    await refundClaimedPaperCredits(
      db,
      job.id,
      job.user_id,
      `refund_paper_gen_${errorCode.toLowerCase()}`,
    );
    return;
  }

  await setJobIfActive(
    db,
    job.id,
    {
      status: "failed_permanent",
      progress_stage: "failed_permanent",
      error_code: errorCode,
      error_message: errorMessage,
      retryable: false,
      completed_at: new Date().toISOString(),
      worker_id: null,
      lease_expires_at: null,
      ...extra,
    },
    { workerId },
  );
  await refundClaimedPaperCredits(
    db,
    job.id,
    job.user_id,
    `refund_paper_gen_${errorCode.toLowerCase()}`,
  );
}

/**
 * Run assembly for an already-claimed job (worker_id + lease held).
 * Idempotent: if mock_test_id / generated_paper_id already set, marks completed.
 */
export async function assembleClaimedPaperJob(
  db: ServiceDb,
  jobInput: Record<string, unknown>,
  workerId: string,
): Promise<AssemblyResult> {
  const job: JobRow = {
    id: String(jobInput.id),
    user_id: String(jobInput.user_id),
    exam_id: String(jobInput.exam_id),
    stage_id: (jobInput.stage_id as string | null) ?? null,
    pattern_version_id: (jobInput.pattern_version_id as string | null) ?? null,
    syllabus_version_id: (jobInput.syllabus_version_id as string | null) ?? null,
    mode: String(jobInput.mode ?? "custom_mock"),
    language: String(jobInput.language ?? "en"),
    request_json: (jobInput.request_json as Record<string, unknown> | null) ?? {},
    credits_charged: Number(jobInput.credits_charged) || 0,
    random_seed: (jobInput.random_seed as string | null) ?? null,
    mock_test_id: (jobInput.mock_test_id as string | null) ?? null,
    generated_paper_id: (jobInput.generated_paper_id as string | null) ?? null,
  };

  // Already assembled — idempotent complete
  if (job.mock_test_id && job.generated_paper_id) {
    await setJobIfActive(
      db,
      job.id,
      {
        status: "completed",
        progress_stage: "completed",
        completed_at: new Date().toISOString(),
        worker_id: null,
        lease_expires_at: null,
        retryable: false,
      },
      { workerId },
    );
    await finalizePaperJobCredits(db, job.id);
    return {
      ok: true,
      status: "completed",
      mockTestId: job.mock_test_id,
      paperId: job.generated_paper_id,
      questionCount: 0,
      paperClass: "custom_practice",
      disclaimer: "",
      patternVersion: null,
      syllabusVersion: null,
    };
  }

  const req = job.request_json ?? {};
  const sourceYears = Array.isArray(req.sourceYears)
    ? (req.sourceYears as unknown[])
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y) && y >= 1990 && y <= 2100)
      .slice(0, 20)
    : [2024, 2023, 2022];

  const questionCountRaw = req.questionCount;
  const questionCount =
    questionCountRaw === undefined || questionCountRaw === null
      ? null
      : clampGovQuestionCount(questionCountRaw, GOV_QUESTION_COUNT_ABS_MAX);

  const durationRaw = Number(req.durationMinutes);
  const durationMinutes = Number.isFinite(durationRaw)
    ? Math.min(360, Math.max(5, Math.floor(durationRaw)))
    : null;

  const randomSeed = String(job.random_seed ?? job.id);
  const mode = (
    ["official_previous", "generated_mock", "custom_mock", "adaptive"].includes(job.mode)
      ? job.mode
      : "custom_mock"
  ) as "official_previous" | "generated_mock" | "custom_mock" | "adaptive";

  try {
    let st = await stage(db, job.id, workerId, "validating");
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    const { data: exam, error: examErr } = await db
      .from("gov_exams")
      .select("id, code, name, legacy_exam_type, review_state, is_public")
      .eq("id", job.exam_id)
      .maybeSingle();

    if (examErr || !exam) {
      await failJob(db, job, workerId, "EXAM_NOT_FOUND", "Exam not found", false);
      return { ok: false, status: "failed", errorCode: "EXAM_NOT_FOUND", error: "Exam not found", httpStatus: 404 };
    }

    st = await stage(db, job.id, workerId, "building_blueprint");
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    let pattern: Record<string, unknown> | null = null;
    if (job.pattern_version_id) {
      const { data } = await db
        .from("gov_exam_pattern_versions")
        .select("*")
        .eq("id", job.pattern_version_id)
        .maybeSingle();
      pattern = data;
    }
    if (!pattern && job.stage_id) {
      const { data } = await db
        .from("gov_exam_pattern_versions")
        .select("*")
        .eq("exam_id", job.exam_id)
        .eq("stage_id", job.stage_id)
        .eq("review_state", "approved")
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      pattern = data;
    }
    if (!pattern) {
      await failJob(db, job, workerId, "PATTERN_NOT_AVAILABLE", "Approved pattern not available", false);
      return {
        ok: false,
        status: "failed",
        errorCode: "PATTERN_NOT_AVAILABLE",
        error: "Approved pattern not available",
        httpStatus: 409,
      };
    }

    const langs: string[] = Array.isArray(pattern.languages) ? pattern.languages as string[] : ["en"];

    const { data: sectionsRows } = await db
      .from("gov_exam_sections")
      .select("code, name, question_count, marks, sort_order")
      .eq("pattern_version_id", pattern.id)
      .order("sort_order", { ascending: true });

    const sections: PatternSection[] = (sectionsRows ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      question_count: s.question_count,
      marks: Number(s.marks),
    }));

    if (sections.length === 0) {
      await failJob(db, job, workerId, "PATTERN_NOT_AVAILABLE", "Pattern sections missing", false);
      return {
        ok: false,
        status: "failed",
        errorCode: "PATTERN_NOT_AVAILABLE",
        error: "Pattern sections missing",
        httpStatus: 409,
      };
    }

    let syllabus: { id: string; version: string | null } | null = null;
    if (job.syllabus_version_id) {
      const { data } = await db
        .from("gov_exam_syllabus_versions")
        .select("id, version")
        .eq("id", job.syllabus_version_id)
        .maybeSingle();
      syllabus = data;
    } else if (job.stage_id) {
      const { data } = await db
        .from("gov_exam_syllabus_versions")
        .select("id, version")
        .eq("exam_id", job.exam_id)
        .eq("stage_id", job.stage_id)
        .eq("review_state", "approved")
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      syllabus = data;
    }

    const blueprint = buildBlueprint({
      examId: job.exam_id,
      examCode: exam.code,
      stageId: job.stage_id ?? "",
      pattern: {
        id: pattern.id as string,
        version: pattern.version as string,
        total_questions: pattern.total_questions as number,
        total_marks: Number(pattern.total_marks),
        duration_minutes: pattern.duration_minutes as number,
        negative_mark: Number(pattern.negative_mark),
        marks_per_question: Number(pattern.marks_per_question),
        languages: langs,
        sections,
      },
      syllabusVersionId: syllabus?.id ?? null,
      syllabusVersion: syllabus?.version ?? null,
      language: job.language,
      sourceYears,
      mode,
      randomSeed,
      customQuestionCount: questionCount,
      customDuration: durationMinutes,
    });

    const hard = validateBlueprintHardConstraints(blueprint);
    if (!hard.ok) {
      await failJob(
        db,
        job,
        workerId,
        "BLUEPRINT_INVALID",
        hard.errors.join("; "),
        false,
        { blueprint_json: blueprint },
      );
      return {
        ok: false,
        status: "failed",
        errorCode: "BLUEPRINT_INVALID",
        error: hard.errors.join("; "),
        httpStatus: 422,
      };
    }

    st = await stage(db, job.id, workerId, "selecting_questions", { blueprint_json: blueprint });
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    const examTypeKeys = examBankTypeKeys({
      code: exam.code as string | null,
      name: exam.name as string | null,
      legacy_exam_type: exam.legacy_exam_type as string | null,
    });
    const insertExamType =
      (exam.legacy_exam_type as string | null) ||
      mapExamType(String(exam.code ?? exam.name ?? ""));

    const PYP_SOURCES = ["OFFICIAL_PYP", "Previous Year Paper", "PYP", "previous_year"];

    let bankRows: GapFillRow[] = [];
    if (examTypeKeys.length > 0) {
      // Public PYP rows are practice-ready even when is_verified is still false.
      // Requiring verified-only dropped ~1000 previous-year questions and forced AI fill.
      let bankQuery = db
        .from("questions")
        .select(
          "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_type, source_year, is_public, is_verified",
        )
        .eq("is_public", true)
        .eq("publish_status", "published")
        .eq("review_status", "approved")
        .in("exam_type", examTypeKeys)
        .limit(2000);
      if (mode === "official_previous") {
        bankQuery = bankQuery.in("source", PYP_SOURCES);
      }
      const { data, error: bankErr } = await bankQuery;
      if (bankErr) {
        throw new Error(bankErr.message);
      }
      bankRows = (data ?? []) as GapFillRow[];
    }

    let candidates = seededShuffle(bankRows, randomSeed);

    if (mode === "adaptive") {
      try {
        const { data: masteryRows } = await db
          .from("topic_mastery")
          .select("topic, mastery_score, evidence_count")
          .eq("user_id", job.user_id)
          .eq("exam_id", job.exam_id)
          .gt("evidence_count", 0);

        if (masteryRows && masteryRows.length > 0) {
          const masteryByTopic: Record<string, number> = {};
          for (const row of masteryRows) {
            masteryByTopic[String(row.topic)] = Number(row.mastery_score) || 0;
          }
          candidates = [...candidates]
            .map((row, idx) => ({
              row,
              pri: adaptiveSoftPriority(
                row.topic as string | null,
                masteryByTopic,
                idx / Math.max(1, candidates.length - 1),
              ),
            }))
            .sort((a, b) => b.pri - a.pri)
            .map((x) => x.row);

          blueprint.label =
            "Adaptive practice set — soft-biased toward your weaker assessed topics. Not an official paper.";
        }
      } catch (masteryRankErr) {
        console.warn("[govPaperAssembly] mastery soft-rank skipped:", masteryRankErr);
      }
    }

    st = await stage(db, job.id, workerId, "validating_questions");
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    const selected: GapFillRow[] = [];
    const seenFp = new Set<string>();
    const rejectedQuality: Array<{ id: string; reason: string; score: number }> = [];
    const reviewQueue: unknown[] = [];
    const aiQuestionIds = new Set<string>();

    for (const row of candidates) {
      if (selected.length >= blueprint.total_questions) break;
      const sourceType = canonicalSourceType(row as unknown as Record<string, unknown>, aiQuestionIds);
      if (!allowedSourceForMode(mode, sourceType)) {
        rejectedQuality.push({
          id: String(row.id),
          reason: "GENERATED_PROVENANCE_REJECTED",
          score: 0,
        });
        continue;
      }
      const text = String(row.question_text ?? "");
      const options = normalizeMcqOptions(row.options);
      const correctIndex = resolveCorrectIndex(row.correct_answer, options.length);
      if (correctIndex == null) {
        rejectedQuality.push({
          id: String(row.id),
          reason: "ANSWER_VERIFICATION_FAILED",
          score: 0,
        });
        continue;
      }

      const fp = questionFingerprint(text, options);
      if (seenFp.has(fp)) continue;

      const peerTexts = selected.map((p) => String(p.question_text ?? ""));
      if (conflictsWithSelected(text, peerTexts)) continue;

      // Content validators drive quality — never invent verified=100 from provenance alone.
      const quality = scoreQuestionQuality({
        question_text: text,
        options,
        correct_index: correctIndex,
        peers: peerTexts,
        sourceConfidence: 0.7,
      });
      if (quality.hardFail || quality.score < MIN_BANK_QUESTION_QUALITY) {
        rejectedQuality.push({
          id: String(row.id),
          reason: quality.hardFailCodes[0] ?? "LOW_QUALITY",
          score: quality.score,
        });
        continue;
      }

      const agent = runBankMultiAgentValidation({
        question_text: text,
        options,
        correct_index: correctIndex,
        peers: peerTexts,
        sourceConfidence: 0.7,
        language: job.language,
      });
      if (!agent.publishable) {
        if (agent.disagreements.length) {
          reviewQueue.push({
            questionId: row.id,
            disagreements: agent.disagreements,
            qualityScore: agent.quality.score,
          });
        }
        rejectedQuality.push({
          id: String(row.id),
          reason: agent.disagreements[0]?.topic ?? "AGENT_REJECT",
          score: agent.quality.score,
        });
        continue;
      }

      seenFp.add(fp);
      selected.push(row);
    }

    st = await stage(db, job.id, workerId, "checking_similarity");
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    const requestedQuestionCount = blueprint.total_questions;

    const selectedStems = selected.map((q) => String(q.question_text ?? ""));
    const paperSim = validatePaperSimilarity(selectedStems);
    if (!paperSim.ok) {
      const drop = new Set<number>();
      for (const pair of paperSim.pairs) {
        drop.add(pair.j);
      }
      const filtered = selected.filter((_, idx) => !drop.has(idx));
      selected.length = 0;
      selected.push(...filtered);
    }

    const residualPairs = findNearDuplicatesInSet(
      selected.map((q) => String(q.question_text ?? "")),
    );
    if (residualPairs.length) {
      const drop = new Set(residualPairs.map((p) => p.j));
      const filtered = selected.filter((_, idx) => !drop.has(idx));
      selected.length = 0;
      selected.push(...filtered);
    }

    // Custom / adaptive practice: after the quality bar, take remaining unique
    // public bank items (fingerprint + valid answer only). Re-running paper-wide
    // near-dup collapse here is what shrunk IBPS custom sets from 50 → ~18.
    const allowRelaxedBank = mode === "custom_mock" || mode === "adaptive";
    if (allowRelaxedBank && selected.length < blueprint.total_questions) {
      const selectedIds = new Set(selected.map((r) => String(r.id)));
      for (const row of candidates) {
        if (selected.length >= blueprint.total_questions) break;
        if (selectedIds.has(String(row.id))) continue;
        const sourceType = canonicalSourceType(row as unknown as Record<string, unknown>, aiQuestionIds);
        if (!allowedSourceForMode(mode, sourceType)) continue;
        const text = String(row.question_text ?? "");
        const options = normalizeMcqOptions(row.options);
        const correctIndex = resolveCorrectIndex(row.correct_answer, options.length);
        if (correctIndex == null) continue;
        const fp = questionFingerprint(text, options);
        if (seenFp.has(fp)) continue;
        seenFp.add(fp);
        selectedIds.add(String(row.id));
        selected.push(row);
      }
    }

    // Enforce server-side capability check for AI fill — direct edge invocations cannot bypass
    const { data: userProfile } = await db
      .from("profiles")
      .select("plan_id")
      .eq("id", job.user_id)
      .maybeSingle();

    const requestJson = (jobInput.request_json ?? {}) as Record<string, unknown>;
    const skipAiFill = requestJson.skipAiFill === true || requestJson.allowAiFill === false;
    const allowDeterministicFill = requestJson.allowDeterministicFill === true;
    const userCanAiFill = hasCapability(userProfile?.plan_id, "gov_exam_ai_fill");
    const assembleRoute = decideRoute({ operation: "gov_exam_assemble" });
    const allowAiFill =
      mode !== "official_previous" &&
      userCanAiFill &&
      !skipAiFill &&
      assembleRoute.canUseAI;
    let aiFilledCount = 0;
    let aiFillError: string | undefined;
    let usedPythonFallback = false;
    const correlationId = String(
      requestJson.correlationId ?? requestJson.correlation_id ?? job.id,
    );
    const assemblyStartedAt = Date.now();

    if (allowAiFill && selected.length < blueprint.total_questions) {
      st = await stage(db, job.id, workerId, "generating_missing_slots");
      if (st === "cancelled") {
        return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
      }
      if (st === "lost_lease") {
        return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
      }

      // Drive generation from the approved blueprint and syllabus rather than from the
      // bank rows we happened to select: an exam with an empty bank still needs a
      // correctly scoped prompt.
      const subjects = [
        ...new Set([
          ...blueprint.sections.map((s) => String(s.name ?? "").trim()),
          ...selected.map((r) => String(r.subject ?? "").trim()),
        ].filter(Boolean)),
      ].slice(0, 8);

      const syllabusTopics = await loadSyllabusTopics(
        db,
        blueprint.syllabus_version_id,
      );
      const topics = [
        ...new Set([
          ...syllabusTopics,
          ...selected.map((r) => String(r.topic ?? "").trim()),
        ].filter(Boolean)),
      ].slice(0, 24);

      const fill = await fillUntilCount({
        db,
        targetCount: blueprint.total_questions,
        existing: selected,
        examType: insertExamType,
        subjects: subjects.length ? subjects : [String(exam.name ?? "General")],
        topics,
        marksPositive: blueprint.marks_per_question,
        marksNegative: blueprint.negative_mark,
        userId: job.user_id,
        onBatch: async () => {
          await heartbeatJobLease(db, job.id, workerId, 180_000);
        },
      });
      aiFillError = fill.error;
      for (const row of fill.added) {
        if (selected.length >= blueprint.total_questions) break;
        aiQuestionIds.add(row.id);
        selected.push(row);
      }
      aiFilledCount = fill.added.length;

      if (selected.length < blueprint.total_questions) {
        console.error(JSON.stringify({
          tag: "[GOV_EXAM] ai_generation_failed",
          correlation_id: correlationId,
          job_id: job.id,
          selected: selected.length,
          required: blueprint.total_questions,
          error: (aiFillError ?? "short_fill").slice(0, 240),
        }));
      }
    }

    // MATRIX pythonFallbackOnAiFailure / allowDeterministicFill: AI shortfall OR
    // AI skipped (hybrid_deterministic) → Python select + local bank reassembly.
    // Previously this lived only inside the AI block, so deterministic plans never
    // reached Python/bank fallback after a short bank select.
    const shouldPythonBankFallback =
      selected.length < blueprint.total_questions &&
      mode !== "official_previous" &&
      (
        (allowAiFill && assembleRoute.pythonFallbackOnAiFailure) ||
        allowDeterministicFill
      );

    if (shouldPythonBankFallback) {
      const need = blueprint.total_questions - selected.length;
      const selectedIds = new Set(selected.map((r) => String(r.id)));

      if (isPythonGovExamConfigured() && job.stage_id) {
        console.log(JSON.stringify({
          tag: "[GOV_EXAM] python_fallback_started",
          correlation_id: correlationId,
          job_id: job.id,
          need,
          after_ai: allowAiFill,
          allow_deterministic: allowDeterministicFill,
        }));
        const pySel = await pythonGovSelect({
          exam_id: job.exam_id,
          stage_id: job.stage_id,
          language: job.language,
          question_count: need,
          seed: randomSeed,
          correlation_id: correlationId,
          job_id: job.id,
          exclude_ids: [...selectedIds],
        });
        if (pySel.ok && pySel.data.question_ids.length > 0) {
          usedPythonFallback = true;
          const { data: pyRows } = await db
            .from("questions")
            .select(
              "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_type, source_year, is_public, is_verified",
            )
            .in("id", pySel.data.question_ids)
            .eq("is_public", true)
            .eq("publish_status", "published")
            .eq("review_status", "approved");
          for (const row of (pyRows ?? []) as GapFillRow[]) {
            if (selected.length >= blueprint.total_questions) break;
            const id = String(row.id);
            if (selectedIds.has(id)) continue;
            const sourceType = canonicalSourceType(row as unknown as Record<string, unknown>, aiQuestionIds);
            if (!allowedSourceForMode(mode, sourceType)) continue;
            selectedIds.add(id);
            selected.push(row);
          }
        } else if (!pySel.ok) {
          console.warn(JSON.stringify({
            tag: "[GOV_EXAM] python_fallback_select_failed",
            correlation_id: correlationId,
            job_id: job.id,
            code: pySel.error.code,
          }));
        }
      }

      // Local bank re-selection from already-fetched candidates.
      if (selected.length < blueprint.total_questions) {
        for (const row of candidates) {
          if (selected.length >= blueprint.total_questions) break;
          const id = String(row.id);
          if (selectedIds.has(id)) continue;
          const sourceType = canonicalSourceType(row as unknown as Record<string, unknown>, aiQuestionIds);
          if (!allowedSourceForMode(mode, sourceType)) continue;
          const text = String(row.question_text ?? "");
          const options = normalizeMcqOptions(row.options);
          const correctIndex = resolveCorrectIndex(row.correct_answer, options.length);
          if (correctIndex == null) continue;
          const fp = questionFingerprint(text, options);
          if (seenFp.has(fp)) continue;
          seenFp.add(fp);
          selectedIds.add(id);
          selected.push(row);
        }
      }
    }

    st = await stage(db, job.id, workerId, "validating_questions");
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    // Python canonical validation gate (wired product path for validate-questions).
    if (isPythonGovExamConfigured() && selected.length > 0) {
      const payloads = selected.map((row) => {
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
          language: job.language,
          source: row.source != null ? String(row.source) : null,
        };
      });
      const pyVal = await pythonGovValidateQuestions({
        questions: payloads,
        correlation_id: correlationId,
        job_id: job.id,
        language: job.language,
        reject_near_duplicates: true,
      });
      if (pyVal.ok && pyVal.data.rejected_indices.length > 0) {
        const drop = new Set(pyVal.data.rejected_indices);
        const filtered = selected.filter((_, idx) => !drop.has(idx));
        for (const idx of pyVal.data.rejected_indices) {
          const reasons = pyVal.data.rejected_reasons[idx] ?? ["PYTHON_VALIDATION_REJECT"];
          rejectedQuality.push({
            id: String(selected[idx]?.id ?? idx),
            reason: reasons[0] ?? "PYTHON_VALIDATION_REJECT",
            score: 0,
          });
        }
        selected.length = 0;
        selected.push(...filtered);
      } else if (!pyVal.ok) {
        console.warn(JSON.stringify({
          tag: "[GOV_EXAM] python_validate_questions_failed",
          correlation_id: correlationId,
          job_id: job.id,
          code: pyVal.error.code,
        }));
      }
    }

    const requireExact = mode === "official_previous" || mode === "generated_mock";

    if (selected.length < blueprint.total_questions) {
      if (requireExact) {
        const isCapBlocked = mode === "generated_mock" && !userCanAiFill && !skipAiFill;
        const errorCode = isCapBlocked
          ? "CAPABILITY_REQUIRED"
          : "CONTENT_INSUFFICIENT";
        const errorMsg = isCapBlocked
          ? `Only ${selected.length}/${blueprint.total_questions} approved bank items are available. A supported plan is required to fill the remaining slots.`
          : `Only ${selected.length} approved questions are available for this configuration (need ${blueprint.total_questions}).`;

        await failJob(
          db,
          job,
          workerId,
          errorCode,
          errorMsg,
          false,
        );
        return {
          ok: false,
          status: "failed",
          errorCode,
          error: errorMsg,
          available: selected.length,
          required: blueprint.total_questions,
          httpStatus: isCapBlocked ? 403 : 422,
        };
      }
      if (selected.length < 5) {
        const quotaBlocked = /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(aiFillError ?? "");
        const errorCode = "CONTENT_INSUFFICIENT";
        const errorMsg = quotaBlocked
          ? `Question generation is temporarily rate-limited. Only ${selected.length} questions are ready — try again shortly or use a smaller set.`
          : `Only ${selected.length} approved questions are available. Choose a smaller custom practice set.`;
        await failJob(
          db,
          job,
          workerId,
          errorCode,
          errorMsg,
          quotaBlocked,
        );
        return {
          ok: false,
          status: "failed",
          errorCode,
          error: errorMsg,
          available: selected.length,
          required: blueprint.total_questions,
          httpStatus: 422,
        };
      }
      blueprint.total_questions = selected.length;
      blueprint.total_marks = selected.length * blueprint.marks_per_question;
      blueprint.paper_class = aiFilledCount > 0 ? "ai_generated" : "custom_practice";
      blueprint.label =
        aiFilledCount > 0
          ? `AI-assisted practice set (${selected.length} of ${requestedQuestionCount} requested unique questions). Not an official or leaked examination paper.`
          : `Custom Practice Set — ${selected.length} of ${requestedQuestionCount} requested questions from available bank items. Not a full exam simulation.`;
      blueprint.slots = blueprint.slots.slice(0, selected.length);
    } else if (aiFilledCount > 0 && blueprint.paper_class !== "official_previous") {
      blueprint.paper_class = "ai_generated";
      blueprint.label =
        "AI-generated practice paper based on the selected syllabus, pattern, and historical topic distribution. This is not an official or leaked examination paper.";
    }

    // Hard constraint validation on assembled question set before freezing
    const assembledHard = validateAssembledPaperHardConstraints({
      blueprint,
      questions: selected.slice(0, blueprint.total_questions).map((r, idx) => ({
        id: String(r.id),
        question_text: String(r.question_text ?? ""),
        options: r.options,
        correct_answer: r.correct_answer,
        subject: r.subject,
        topic: r.topic,
        section_code: blueprint.slots[idx]?.section_code ?? null,
        difficulty: r.difficulty,
        language: blueprint.language,
        source_type: canonicalSourceType(r as unknown as Record<string, unknown>, aiQuestionIds),
      })),
      aiQuestionIds,
    });

    if (!assembledHard.ok) {
      await failJob(
        db,
        job,
        workerId,
        "HARD_CONSTRAINT_VIOLATION",
        `Hard constraint violation: ${assembledHard.errors.join("; ")}`,
        false,
        { blueprint_json: blueprint },
      );
      return {
        ok: false,
        status: "failed_permanent",
        errorCode: "HARD_CONSTRAINT_VIOLATION",
        error: `Hard constraint violation: ${assembledHard.errors.join("; ")}`,
        httpStatus: 422,
      };
    }

    const paperQuality = scorePaperQuality(
      selected.slice(0, blueprint.total_questions).map((row) => {
        const options = normalizeMcqOptions(row.options);
        return {
          question_text: String(row.question_text ?? ""),
          options,
          correct_index: resolveCorrectIndex(row.correct_answer, options.length) ?? -1,
          peers: [],
          // Neutral provenance weight — content validators own the score.
          sourceConfidence: 0.7,
        };
      }),
    );
    if (paperQuality.hardFailCount > 0 || paperQuality.score < MIN_BANK_QUESTION_QUALITY) {
      await failJob(
        db,
        job,
        workerId,
        "QUALITY_POLICY_VIOLATION",
        `Canonical quality policy ${paperQuality.algorithm_version} rejected the assembled paper.`,
        false,
        { blueprint_json: blueprint },
      );
      return {
        ok: false,
        status: "failed_permanent",
        errorCode: "QUALITY_POLICY_VIOLATION",
        error: `Canonical quality policy ${paperQuality.algorithm_version} rejected the assembled paper.`,
        httpStatus: 422,
      };
    }

    st = await stage(db, job.id, workerId, "assembling", { blueprint_json: blueprint });
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    const questionIds = selected.slice(0, blueprint.total_questions).map((q) => q.id);
    const selectedRows = selected.slice(0, blueprint.total_questions);
    const sourceMix: Record<string, number> = {};
    const questionSourceTypes = selectedRows.map((row) => {
      const sourceType = canonicalSourceType(row as unknown as Record<string, unknown>, aiQuestionIds);
      sourceMix[sourceType] = (sourceMix[sourceType] ?? 0) + 1;
      return sourceType;
    });
    const paperSource = resolvePaperSource(sourceMix, mode);

    const { data: mockTest, error: mtErr } = await db
      .from("mock_tests")
      .insert({
        user_id: job.user_id,
        test_name:
          `${exam.name} · ${blueprint.paper_class === "ai_generated" ? "Pattern mock" : "Practice set"}`,
        question_ids: questionIds,
        time_limit_minutes: blueprint.duration_minutes,
        config: {
          exam_type: exam.code,
          gov_exam_id: job.exam_id,
          gov_stage_id: job.stage_id,
          pattern_version: blueprint.pattern_version,
          syllabus_version: blueprint.syllabus_version,
          paper_class: blueprint.paper_class,
          marks_positive: blueprint.marks_per_question,
          marks_negative: blueprint.negative_mark,
          duration_minutes: blueprint.duration_minutes,
          language: blueprint.language,
          source_years: blueprint.source_years,
          disclaimer: blueprint.label,
          generation_job_id: job.id,
          shuffle_questions: false,
          shuffle_options: false,
          quality_score: paperQuality.score,
          quality_algorithm_version: QUALITY_ALGORITHM_VERSION,
          dedup_algorithm_version: DEDUP_ALGORITHM_VERSION,
          requested_question_count: requestedQuestionCount,
          source_mix: sourceMix,
          paper_source: paperSource,
          scoring_version: "gov_exam_snapshot_v1",
          sections: blueprint.sections,
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
        exam_id: job.exam_id,
        stage_id: job.stage_id,
        pattern_version_id: pattern.id,
        syllabus_version_id: syllabus?.id ?? null,
        job_id: job.id,
        created_by: job.user_id,
        title: `${exam.name} practice paper`,
        paper_class: blueprint.paper_class,
        language: blueprint.language,
        question_count: questionIds.length,
        total_marks: blueprint.total_marks,
        duration_minutes: blueprint.duration_minutes,
        negative_mark: blueprint.negative_mark,
        blueprint_json: blueprint,
        provenance_json: {
          assembly: aiFilledCount > 0 ? "bank_plus_ai_fill_v1" : "bank_select_v1",
          seed: randomSeed,
          source_years: sourceYears,
          question_ids: questionIds,
          quality_score: paperQuality.score,
          quality_algorithm_version: QUALITY_ALGORITHM_VERSION,
          duplicate_algorithm_version: DEDUP_ALGORITHM_VERSION,
          quality_hard_fail_count: paperQuality.hardFailCount,
          rejected_quality_sample: rejectedQuality.slice(0, 20),
          review_queue: reviewQueue.slice(0, 50),
          llm_generator: aiFilledCount > 0,
          ai_filled_count: aiFilledCount,
          source_mix: sourceMix,
          paper_source: paperSource,
          question_source_types: questionSourceTypes,
          exam_type_keys: examTypeKeys,
          missing_coverage: selected.length < requestedQuestionCount ? {
            requested: requestedQuestionCount,
            provided: selected.length,
            deficit: requestedQuestionCount - selected.length,
          } : undefined,
          note:
            aiFilledCount > 0
              ? "Assembled from the approved public bank, then unique AI-generated MCQs filled remaining slots. Not an official paper."
              : "Assembled from approved public question bank; not an official paper.",
        },
        quality_score: paperQuality.score,
        review_state: paperQuality.hardFailCount > 0 || reviewQueue.length > 0
          ? "needs_review"
          : "machine_validated",
        disclaimer: blueprint.label,
        mock_test_id: mockTest.id,
        paper_source: paperSource,
        source_mix: sourceMix,
      })
      .select("id")
      .single();

    if (paperErr || !paper) {
      throw new Error(paperErr?.message ?? "gov_generated_papers insert failed");
    }

    const linkRows = questionIds.map((qid, idx) => {
      const row = selectedRows[idx] as Record<string, unknown> | undefined;
      const options = normalizeMcqOptions(row?.options);
      return {
        paper_id: paper.id,
        question_id: qid,
        section_code: blueprint.slots[idx]?.section_code ?? null,
        sort_order: idx,
        source_class: mapToLegacySourceClass(questionSourceTypes[idx] ?? "approved_bank"),
        question_source_type: questionSourceTypes[idx],
        quality_score: paperQuality.perQuestion[idx]?.score ?? null,
        validation_status: paperQuality.perQuestion[idx]?.hardFail ? "invalid" : "valid",
        duplicate_status: paperQuality.perQuestion[idx]?.hardFailCodes.includes("NEAR_DUPLICATE")
          ? "near_duplicate"
          : "unique",
        quality_algorithm_version: QUALITY_ALGORITHM_VERSION,
        duplicate_algorithm_version: DEDUP_ALGORITHM_VERSION,
        snapshot_json: {
          question_text: String(row?.question_text ?? ""),
          options: options.map((text, i) => ({ label: String.fromCharCode(65 + i), text })),
          correct_answer: row?.correct_answer ?? null,
          question_type: String(row?.question_type ?? "MCQ"),
          subject: String(row?.subject ?? ""),
          topic: String(row?.topic ?? ""),
          difficulty: String(row?.difficulty ?? "MEDIUM"),
          language: blueprint.language,
          marks_positive: Number(row?.marks_positive ?? blueprint.marks_per_question),
          marks_negative: Number(row?.marks_negative ?? blueprint.negative_mark),
          section_code: blueprint.slots[idx]?.section_code ?? null,
          source_type: questionSourceTypes[idx],
        },
      };
    });

    if (linkRows.length) {
      await db.from("gov_generated_paper_questions").insert(linkRows);
    }

    await db
      .from("mock_tests")
      .update({
        config: {
          exam_type: exam.code,
          gov_exam_id: job.exam_id,
          gov_stage_id: job.stage_id,
          gov_paper_id: paper.id,
          pattern_version: blueprint.pattern_version,
          syllabus_version: blueprint.syllabus_version,
          paper_class: blueprint.paper_class,
          marks_positive: blueprint.marks_per_question,
          marks_negative: blueprint.negative_mark,
          duration_minutes: blueprint.duration_minutes,
          language: blueprint.language,
          source_years: blueprint.source_years,
          disclaimer: blueprint.label,
          generation_job_id: job.id,
          shuffle_questions: false,
          shuffle_options: false,
          quality_score: paperQuality.score,
          quality_algorithm_version: QUALITY_ALGORITHM_VERSION,
          dedup_algorithm_version: DEDUP_ALGORITHM_VERSION,
          requested_question_count: requestedQuestionCount,
          source_mix: sourceMix,
          paper_source: paperSource,
          scoring_version: "gov_exam_snapshot_v1",
          sections: blueprint.sections,
        },
      })
      .eq("id", mockTest.id);

    await setJobIfActive(
      db,
      job.id,
      {
        status: "completed",
        progress_stage: "completed",
        mock_test_id: mockTest.id,
        generated_paper_id: paper.id,
        completed_at: new Date().toISOString(),
        blueprint_json: blueprint,
        source_mix: sourceMix,
        missing_count: Math.max(0, requestedQuestionCount - questionIds.length),
        worker_id: null,
        lease_expires_at: null,
        retryable: false,
      },
      { workerId },
    );
    await finalizePaperJobCredits(db, job.id);

    const opSource =
      usedPythonFallback || (aiFillError && aiFilledCount === 0)
        ? "fallback"
        : aiFilledCount > 0
        ? "ai"
        : "database";
    await recordOperationSource({
      operationId: job.id,
      userId: job.user_id,
      operationType: "gov_exam_assemble",
      source: opSource,
      fallbackReason: aiFillError
        ? "ai_gap_fill_shortfall"
        : usedPythonFallback
        ? "python_bank_fallback"
        : null,
      executionMs: Date.now() - assemblyStartedAt,
      status: "success",
      correlationId,
    });

    return {
      ok: true,
      status: "completed",
      mockTestId: mockTest.id as string,
      paperId: paper.id as string,
      questionCount: questionIds.length,
      paperClass: blueprint.paper_class,
      disclaimer: blueprint.label,
      patternVersion: blueprint.pattern_version,
      syllabusVersion: blueprint.syllabus_version,
    };
  } catch (procErr) {
    console.error("[govPaperAssembly] process:", procErr);
    // Transient failures stay retryable so a worker can reclaim after lease expiry.
    await failJob(
      db,
      job,
      workerId,
      "PAPER_GENERATION_FAILED",
      "Generation failed",
      true,
    );
    return {
      ok: false,
      status: "failed",
      errorCode: "PAPER_GENERATION_FAILED",
      error: "Paper generation failed",
      httpStatus: 500,
    };
  }
}

/** Claim (if needed) + assemble a specific job id. */
export async function processPaperGenerationJobById(
  jobId: string,
  opts: { workerId?: string; userId?: string } = {},
): Promise<AssemblyResult & { jobId: string; workerId?: string; attemptCount?: number }> {
  const db = createServiceClient();
  const claimed = await claimPaperGenerationJob(db, {
    jobId,
    workerId: opts.workerId,
    userId: opts.userId,
  });
  if (!claimed.ok) {
    if (claimed.reason === "max_attempts") {
      return {
        jobId,
        ok: false,
        status: "failed",
        errorCode: "MAX_ATTEMPTS",
        error: "Exceeded max processing attempts",
        httpStatus: 422,
      };
    }
    // Idempotent: already completed
    const { data: existing } = await db
      .from("gov_paper_generation_jobs")
      .select("id, status, mock_test_id, generated_paper_id, error_code, error_message")
      .eq("id", jobId)
      .maybeSingle();
    if (existing?.status === "completed" && existing.mock_test_id && existing.generated_paper_id) {
      return {
        jobId,
        ok: true,
        status: "completed",
        mockTestId: existing.mock_test_id,
        paperId: existing.generated_paper_id,
        questionCount: 0,
        paperClass: "custom_practice",
        disclaimer: "",
        patternVersion: null,
        syllabusVersion: null,
      };
    }
    if (existing?.status === "cancelled") {
      return {
        jobId,
        ok: false,
        status: "cancelled",
        errorCode: "CANCELLED",
        error: "Cancelled",
      };
    }
    return {
      jobId,
      ok: false,
      status: "failed",
      errorCode: "NOT_CLAIMABLE",
      error: claimed.message ?? "Job not claimable",
      httpStatus: 409,
    };
  }

  const result = await assembleClaimedPaperJob(db, claimed.job, claimed.workerId);
  return {
    jobId,
    workerId: claimed.workerId,
    attemptCount: claimed.attemptCount,
    ...result,
  };
}

/** Detect EdgeRuntime.waitUntil without hard dependency. */
export function scheduleWithWaitUntil(task: Promise<unknown>): boolean {
  try {
    const er = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(
        task.catch((err) => {
          console.error("[govPaperAssembly] background task:", err);
        }),
      );
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
