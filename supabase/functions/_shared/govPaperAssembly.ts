/**
 * Bank-first paper assembly pipeline for gov_paper_generation_jobs.
 * Shared by create-exam-paper (waitUntil/inline) and process-paper-generation-job.
 */

import { createServiceClient, refundCredits } from "./supabase.ts";
import {
  buildBlueprint,
  seededShuffle,
  validateBlueprintHardConstraints,
  type PatternSection,
} from "./govBlueprint.ts";
import {
  conflictsWithSelected,
  questionFingerprint,
  resolveCorrectIndex,
  findNearDuplicatesInSet,
} from "./govMcqValidator.ts";
import {
  MIN_BANK_QUESTION_QUALITY,
  scorePaperQuality,
  scoreQuestionQuality,
} from "./govQualityScore.ts";
import {
  ENABLE_LLM_GENERATOR,
  runBankMultiAgentValidation,
  validatePaperSimilarity,
} from "./govMultiAgentValidation.ts";
import { adaptiveSoftPriority } from "./masteryEngine.ts";
import {
  claimPaperGenerationJob,
  clearJobLease,
  heartbeatJobLease,
  isJobCancelled,
  setJobIfActive,
  type ServiceDb,
} from "./govPaperJobLease.ts";

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
        status: "queued",
        progress_stage: "queued",
        error_code: errorCode,
        error_message: errorMessage,
        retryable: true,
        completed_at: null,
        worker_id: null,
        lease_expires_at: null,
        ...extra,
      },
      { workerId },
    );
    return;
  }

  await setJobIfActive(
    db,
    job.id,
    {
      status: "failed",
      progress_stage: "failed",
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
  const cost = Math.max(0, Number(job.credits_charged) || 0);
  if (cost > 0) {
    await refundCredits({
      userId: job.user_id,
      cost,
      reason: `refund_paper_gen_${errorCode.toLowerCase()}`,
    }).catch(() => {});
    await clearJobLease(db, job.id, { credits_charged: 0 });
  }
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

  const questionCountRaw = Number(req.questionCount);
  const questionCount = Number.isFinite(questionCountRaw)
    ? Math.min(200, Math.max(5, Math.floor(questionCountRaw)))
    : null;

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
    let st = await stage(db, job.id, workerId, "analyzing_pattern");
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

    st = await stage(db, job.id, workerId, "planning_blueprint");
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

    const legacy = exam.legacy_exam_type as string | null;
    let qQuery = db
      .from("questions")
      .select(
        "id, question_text, options, correct_answer, subject, topic, difficulty, source, source_year, is_public, is_verified",
      )
      .eq("is_public", true)
      .eq("is_verified", true)
      .limit(800);

    if (legacy) {
      qQuery = qQuery.eq("exam_type", legacy);
    }

    const { data: bankRows, error: bankErr } = await qQuery;
    if (bankErr) {
      throw new Error(bankErr.message);
    }

    let candidates = seededShuffle(bankRows ?? [], randomSeed);

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

    if (ENABLE_LLM_GENERATOR) {
      console.warn(
        "[govPaperAssembly] ENABLE_LLM_GENERATOR is true but ignored; assembly stays bank-first.",
      );
    }

    const selected: typeof candidates = [];
    const seenFp = new Set<string>();
    const rejectedQuality: Array<{ id: string; reason: string; score: number }> = [];
    const reviewQueue: unknown[] = [];

    for (const row of candidates) {
      if (selected.length >= blueprint.total_questions) break;
      const text = String(row.question_text ?? "");
      const options = Array.isArray(row.options)
        ? row.options.map((o: unknown) => String(o))
        : [];
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

      const quality = scoreQuestionQuality({
        question_text: text,
        options,
        correct_index: correctIndex,
        peers: peerTexts,
        sourceConfidence: 0.8,
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
        sourceConfidence: 0.8,
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

    const requireExact = mode === "generated_mock" || mode === "official_previous";

    if (selected.length < blueprint.total_questions) {
      if (requireExact) {
        await failJob(
          db,
          job,
          workerId,
          "INSUFFICIENT_APPROVED_QUESTIONS",
          `Need ${blueprint.total_questions} approved questions, found ${selected.length}. ` +
            "Use custom_mock with a lower questionCount, or import more reviewed bank items.",
          false,
        );
        return {
          ok: false,
          status: "failed",
          errorCode: "INSUFFICIENT_APPROVED_QUESTIONS",
          error:
            `Insufficient approved questions (${selected.length}/${blueprint.total_questions}).`,
          available: selected.length,
          required: blueprint.total_questions,
          httpStatus: 422,
        };
      }
      if (selected.length < 5) {
        await failJob(
          db,
          job,
          workerId,
          "INSUFFICIENT_APPROVED_QUESTIONS",
          `Only ${selected.length} approved questions available.`,
          false,
        );
        return {
          ok: false,
          status: "failed",
          errorCode: "INSUFFICIENT_APPROVED_QUESTIONS",
          error: "Not enough approved questions for a practice set.",
          available: selected.length,
          httpStatus: 422,
        };
      }
      blueprint.total_questions = selected.length;
      blueprint.total_marks = selected.length * blueprint.marks_per_question;
      blueprint.paper_class = "custom_practice";
      blueprint.label =
        "Custom Practice Set — assembled from available approved bank items. Not a full exam simulation.";
      blueprint.slots = blueprint.slots.slice(0, selected.length);
    }

    st = await stage(db, job.id, workerId, "assembling", { blueprint_json: blueprint });
    if (st === "cancelled") {
      return { ok: false, status: "cancelled", errorCode: "CANCELLED", error: "Cancelled" };
    }
    if (st === "lost_lease") {
      return { ok: false, status: "failed", errorCode: "LEASE_LOST", error: "Lost job lease", httpStatus: 409 };
    }

    const questionIds = selected.slice(0, blueprint.total_questions).map((q) => q.id);

    const paperQuality = scorePaperQuality(
      selected.slice(0, blueprint.total_questions).map((row) => {
        const options = Array.isArray(row.options)
          ? row.options.map((o: unknown) => String(o))
          : [];
        return {
          question_text: String(row.question_text ?? ""),
          options,
          correct_index: resolveCorrectIndex(row.correct_answer, options.length) ?? 0,
          peers: [],
          sourceConfidence: 0.8,
        };
      }),
    );

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
          assembly: "bank_select_v1",
          seed: randomSeed,
          source_years: sourceYears,
          question_ids: questionIds,
          quality_score: paperQuality.score,
          quality_hard_fail_count: paperQuality.hardFailCount,
          rejected_quality_sample: rejectedQuality.slice(0, 20),
          review_queue: reviewQueue.slice(0, 50),
          llm_generator: false,
          note:
            "Assembled from approved public question bank; not an official paper. LLM fill disabled.",
        },
        quality_score: paperQuality.score,
        review_state: paperQuality.hardFailCount > 0 || reviewQueue.length > 0
          ? "needs_review"
          : "machine_validated",
        disclaimer: blueprint.label,
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
      section_code: blueprint.slots[idx]?.section_code ?? null,
      sort_order: idx,
      source_class: "bank" as const,
    }));

    if (linkRows.length) {
      await db.from("gov_generated_paper_questions").insert(linkRows);
    }

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
        worker_id: null,
        lease_expires_at: null,
        retryable: false,
      },
      { workerId },
    );

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
