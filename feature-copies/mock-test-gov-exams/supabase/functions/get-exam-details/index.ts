/**
 * get-exam-details — JWT; examId or code → full exam pack summary for detail page.
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
  computeBankReadinessStatus,
  toBankReadinessPayload,
  type BankReadinessPayload,
} from "../_shared/govBankReadiness.ts";

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

const AFFILIATION =
  "Clarify AI is an independent preparation platform and is not affiliated with or endorsed by any government recruiting body. Candidates must verify notifications, eligibility, dates, syllabus, and examination rules on the official website.";

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
      key: createRateLimitKey("get-exam-details", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const url = new URL(req.url);
    let examId = uuidOrNull(url.searchParams.get("examId"));
    let code = (url.searchParams.get("code") ?? url.searchParams.get("examCode") ?? "")
      .trim()
      .slice(0, 64);

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        if (!examId) examId = uuidOrNull(b.examId);
        if (!code) {
          code = String(b.code ?? b.examCode ?? "").trim().slice(0, 64);
        }
      }
    }

    let examQuery = db
      .from("gov_exams")
      .select(`
        id, code, name, family, description, legacy_exam_type, review_state, is_public,
        recruiting_bodies ( id, code, name, official_url ),
        gov_exam_aliases ( alias ),
        gov_exam_stages ( id, code, name, sort_order )
      `)
      .eq("is_public", true)
      .eq("review_state", "approved");

    if (examId) {
      examQuery = examQuery.eq("id", examId);
    } else if (code) {
      examQuery = examQuery.eq("code", code.toUpperCase());
    } else {
      return json(req, {
        error: "examId or code is required",
        code: "VALIDATION_ERROR",
      }, 400);
    }

    const { data: exam, error: examErr } = await examQuery.maybeSingle();
    if (examErr || !exam) {
      return json(req, { error: "Exam not found", code: "EXAM_NOT_FOUND" }, 404);
    }

    const body = exam.recruiting_bodies as
      | { id: string; code: string; name: string; official_url: string | null }
      | { id: string; code: string; name: string; official_url: string | null }[]
      | null;
    const recruitingBody = Array.isArray(body) ? body[0] ?? null : body;

    const stages = ((exam.gov_exam_stages as {
      id: string;
      code: string;
      name: string;
      sort_order: number;
    }[] | null) ?? []).sort((a, b) => a.sort_order - b.sort_order);

    const primaryStage = stages[0] ?? null;

    let activePatternSummary: Record<string, unknown> | null = null;
    let languages: string[] = [];
    let syllabusSummary: Record<string, unknown> | null = null;

    if (primaryStage) {
      const { data: pat } = await db
        .from("gov_exam_pattern_versions")
        .select(
          "id, version, total_questions, total_marks, duration_minutes, negative_mark, languages, effective_date, source_url",
        )
        .eq("exam_id", exam.id)
        .eq("stage_id", primaryStage.id)
        .eq("review_state", "approved")
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pat) {
        languages = (pat.languages as string[] | null) ?? [];
        activePatternSummary = {
          id: pat.id,
          version: pat.version,
          totalQuestions: pat.total_questions,
          totalMarks: Number(pat.total_marks),
          durationMinutes: pat.duration_minutes,
          negativeMark: Number(pat.negative_mark),
          sourceUrl: pat.source_url,
          effectiveDate: pat.effective_date,
          stageId: primaryStage.id,
        };
      }

      const { data: syl } = await db
        .from("gov_exam_syllabus_versions")
        .select("id, version, effective_date, source_url, topics_json")
        .eq("exam_id", exam.id)
        .eq("stage_id", primaryStage.id)
        .eq("review_state", "approved")
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (syl) {
        const topics = Array.isArray(syl.topics_json) ? syl.topics_json : [];
        syllabusSummary = {
          id: syl.id,
          version: syl.version,
          effectiveDate: syl.effective_date,
          sourceUrl: syl.source_url,
          topicCount: topics.length,
          topicsPreview: topics.slice(0, 12),
        };
      }
    }

    // Bank readiness
    let bankReadiness: BankReadinessPayload = {
      approvedPublicCount: 0,
      publicCount: 0,
      requiredQuestions: Number(activePatternSummary?.totalQuestions ?? 0) || 0,
      status: "empty",
      fullSimulationAvailable: false,
    };

    const { data: readinessRows } = await db.rpc("get_gov_exam_bank_readiness");
    const matchRow = (readinessRows ?? []).find(
      (r: { exam_id?: string }) => String(r.exam_id) === exam.id,
    );
    if (matchRow) {
      bankReadiness = toBankReadinessPayload(matchRow as Record<string, unknown>);
      const required =
        Number(activePatternSummary?.totalQuestions ?? 0) || bankReadiness.requiredQuestions;
      bankReadiness = {
        ...bankReadiness,
        requiredQuestions: required,
        status: computeBankReadinessStatus(bankReadiness.approvedPublicCount, required),
        fullSimulationAvailable:
          computeBankReadinessStatus(bankReadiness.approvedPublicCount, required) === "ready",
      };
    } else if (exam.legacy_exam_type) {
      const { count } = await db
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("exam_type", exam.legacy_exam_type)
        .eq("is_public", true)
        .eq("is_verified", true);
      const approvedPublicCount = count ?? 0;
      const required = bankReadiness.requiredQuestions;
      const status = computeBankReadinessStatus(approvedPublicCount, required);
      bankReadiness = {
        approvedPublicCount,
        publicCount: approvedPublicCount,
        requiredQuestions: required,
        status,
        fullSimulationAvailable: status === "ready",
      };
    }

    const { data: sources } = await db
      .from("gov_official_sources")
      .select(
        "id, title, source_url, document_type, publication_date, effective_date, language, is_official",
      )
      .eq("exam_id", exam.id)
      .eq("review_state", "approved")
      .order("publication_date", { ascending: false })
      .limit(40);

    const { data: papers } = await db
      .from("previous_year_papers")
      .select("id, year, stage_id")
      .eq("exam_id", exam.id)
      .eq("review_status", "approved");

    const byYear: Record<string, number> = {};
    for (const p of papers ?? []) {
      const y = String(p.year);
      byYear[y] = (byYear[y] ?? 0) + 1;
    }

    const aliases = ((exam.gov_exam_aliases as { alias: string }[] | null) ?? []).map(
      (a) => a.alias,
    );

    return json(req, {
      exam: {
        examId: exam.id,
        code: exam.code,
        name: exam.name,
        family: exam.family,
        description: exam.description,
        legacyExamType: exam.legacy_exam_type,
        aliases,
      },
      body: recruitingBody
        ? {
          id: recruitingBody.id,
          code: recruitingBody.code,
          name: recruitingBody.name,
          officialUrl: recruitingBody.official_url,
        }
        : null,
      stages,
      primaryStage,
      activePatternSummary,
      syllabusSummary,
      languages,
      bankReadiness,
      officialSources: (sources ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        sourceUrl: s.source_url,
        documentType: s.document_type,
        publicationDate: s.publication_date,
        effectiveDate: s.effective_date,
        language: s.language,
        isOfficial: s.is_official,
      })),
      previousPaperCounts: {
        total: (papers ?? []).length,
        byYear,
      },
      disclaimers: {
        affiliation: AFFILIATION,
        aiGenerated:
          "AI-generated practice paper based on the selected syllabus, pattern, and historical topic distribution. This is not an official or leaked examination paper.",
        customPractice:
          "Custom Practice Set — assembled from available approved bank items. Not a full official exam simulation.",
      },
    });
  } catch (err) {
    console.error("[get-exam-details]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
