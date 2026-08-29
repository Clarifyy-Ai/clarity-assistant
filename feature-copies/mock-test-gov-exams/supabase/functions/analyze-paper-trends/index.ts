/**
 * analyze-paper-trends — JWT; topic frequency from PYQ links with recency_v1 weights.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import {
  ALGORITHM_VERSION,
  DEFAULT_RECENCY_WEIGHTS,
  analyzePatternVersions,
  applyShiftToWeightTable,
  buildTopicTrends,
  occurrencesFromQuestionRows,
  type PatternSnapshot,
} from "../_shared/govTrendAnalysis.ts";

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

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("analyze-paper-trends", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const examId = uuidOrNull((body as Record<string, unknown>).examId);
    const stageId = uuidOrNull((body as Record<string, unknown>).stageId);
    if (!examId || !stageId) {
      return json(req, {
        error: "examId and stageId are required UUIDs",
        code: "VALIDATION_ERROR",
      }, 400);
    }

    const sourceYearsRaw = (body as Record<string, unknown>).sourceYears;
    const sourceYears = Array.isArray(sourceYearsRaw)
      ? sourceYearsRaw
        .map((y) => Number(y))
        .filter((y) => Number.isFinite(y) && y >= 1990 && y <= 2100)
        .slice(0, 20)
      : [];

    // Pattern shift detection across approved versions (newest first)
    const { data: patternRows } = await db
      .from("gov_exam_pattern_versions")
      .select("id, total_questions, total_marks, duration_minutes, negative_mark, effective_date")
      .eq("exam_id", examId)
      .eq("stage_id", stageId)
      .eq("review_state", "approved")
      .order("effective_date", { ascending: false })
      .limit(5);

    const snapshots: PatternSnapshot[] = [];
    for (const p of patternRows ?? []) {
      const { data: secs } = await db
        .from("gov_exam_sections")
        .select("code")
        .eq("pattern_version_id", p.id);
      snapshots.push({
        total_questions: Number(p.total_questions) || 0,
        total_marks: Number(p.total_marks) || 0,
        duration_minutes: Number(p.duration_minutes) || 0,
        negative_mark: Number(p.negative_mark) || 0,
        section_codes: (secs ?? []).map((s) => String(s.code)),
      });
    }

    const patternShift = analyzePatternVersions(snapshots);
    const weightTable = applyShiftToWeightTable(DEFAULT_RECENCY_WEIGHTS, patternShift);

    // Load approved previous-year papers for exam/stage
    let paperQuery = db
      .from("previous_year_papers")
      .select("id, year")
      .eq("exam_id", examId)
      .eq("review_status", "approved");

    if (stageId) {
      paperQuery = paperQuery.eq("stage_id", stageId);
    }

    const { data: papers, error: paperErr } = await paperQuery.limit(100);
    if (paperErr) {
      console.error("[analyze-paper-trends] papers:", paperErr);
      return json(req, { error: "Trend lookup failed", code: "INTERNAL_ERROR" }, 500);
    }

    const paperIds = (papers ?? []).map((p) => p.id as string);
    const yearByPaper = new Map<string, number>();
    for (const p of papers ?? []) {
      yearByPaper.set(p.id as string, Number(p.year));
    }

    let questionRows: Array<{ topic: string | null; year: number | null }> = [];

    if (paperIds.length > 0) {
      const { data: links } = await db
        .from("previous_year_paper_questions")
        .select("paper_id, question_id")
        .in("paper_id", paperIds)
        .limit(5000);

      const qIds = [...new Set((links ?? []).map((l) => l.question_id as string))];
      if (qIds.length > 0) {
        const { data: qs } = await db
          .from("questions")
          .select("id, topic, source_year")
          .in("id", qIds.slice(0, 2000));

        const topicById = new Map<string, string | null>();
        const sourceYearById = new Map<string, number | null>();
        for (const q of qs ?? []) {
          topicById.set(q.id as string, (q.topic as string | null) ?? null);
          sourceYearById.set(
            q.id as string,
            q.source_year != null ? Number(q.source_year) : null,
          );
        }

        questionRows = (links ?? []).map((l) => {
          const pid = l.paper_id as string;
          const qid = l.question_id as string;
          const year = yearByPaper.get(pid) ?? sourceYearById.get(qid) ?? null;
          return { topic: topicById.get(qid) ?? null, year };
        });
      }
    }

    // Fallback: public verified bank questions tagged with legacy exam + source_year
    if (questionRows.length === 0) {
      const { data: exam } = await db
        .from("gov_exams")
        .select("legacy_exam_type")
        .eq("id", examId)
        .maybeSingle();

      if (exam?.legacy_exam_type) {
        let qQuery = db
          .from("questions")
          .select("topic, source_year")
          .eq("exam_type", exam.legacy_exam_type)
          .eq("is_public", true)
          .eq("is_verified", true)
          .not("source_year", "is", null)
          .limit(2000);

        if (sourceYears.length > 0) {
          qQuery = qQuery.in("source_year", sourceYears);
        }

        const { data: bankQs } = await qQuery;
        questionRows = (bankQs ?? []).map((q) => ({
          topic: (q.topic as string | null) ?? null,
          year: q.source_year != null ? Number(q.source_year) : null,
        }));
      }
    }

    const occurrences = occurrencesFromQuestionRows(questionRows);
    const trends = buildTopicTrends(occurrences, sourceYears, weightTable);

    const emptyMessage =
      trends.message ??
      (trends.empty
        ? "No previous-year question topic data is available for the selected years. Trends cannot be computed until approved PYQ links exist in the registry."
        : undefined);

    return json(req, {
      examId,
      stageId,
      algorithmVersion: ALGORITHM_VERSION,
      empty: trends.empty,
      message: emptyMessage,
      topics: trends.topics.slice(0, 50),
      sourceYearsUsed: trends.sourceYearsUsed,
      questionCount: trends.questionCount,
      patternShift: patternShift
        ? {
          material: patternShift.material,
          changes: patternShift.changes,
          historicalWeightFactor: patternShift.historicalWeightFactor,
          versionsCompared: snapshots.length,
        }
        : null,
      disclaimer:
        "Topic trends are derived from approved registry PYQ links and public bank provenance. They are not official recruiting-body statistics.",
    });
  } catch (err) {
    console.error("[analyze-paper-trends]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
