/**
 * list-previous-papers — authenticated listing of approved previous_year_papers.
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
      key: createRateLimitKey("list-previous-papers", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const url = new URL(req.url);
    let examId = uuidOrNull(url.searchParams.get("examId"));
    let stageId = uuidOrNull(url.searchParams.get("stageId"));
    let examCode = (url.searchParams.get("examCode") ?? "").trim().slice(0, 64);

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        if (!examId) examId = uuidOrNull(b.examId);
        if (!stageId) stageId = uuidOrNull(b.stageId);
        if (!examCode) {
          examCode = String(b.examCode ?? "").trim().slice(0, 64);
        }
      }
    }

    if (!examId && examCode) {
      const { data: examRow } = await db
        .from("gov_exams")
        .select("id")
        .eq("code", examCode.toUpperCase())
        .eq("is_public", true)
        .eq("review_state", "approved")
        .maybeSingle();
      examId = (examRow?.id as string | undefined) ?? null;
    }

    if (!examId) {
      // Unknown or missing exam codes should not 400 the papers UI — the
      // local exam_papers table still powers the page.
      return json(req, {
        examId: null,
        stageId,
        count: 0,
        papers: [],
        bankEmpty: true,
        message:
          "No approved previous-year papers in the registry yet. Practice papers can still be generated from the pattern blueprint.",
        disclaimer:
          "Clarify AI is not affiliated with any recruiting body. Official labels mean registry provenance only — verify on the official website.",
      });
    }

    let query = db
      .from("previous_year_papers")
      .select(`
        id, exam_id, stage_id, year, cycle, tier, shift, language,
        duration_minutes, marking, question_count, source_id,
        official_status, answer_key_status, review_status,
        pattern_version_id, syllabus_version_id, title, notes, created_at,
        gov_official_sources ( id, title, source_url, is_official, document_type, review_state )
      `)
      .eq("exam_id", examId)
      .eq("review_status", "approved")
      .order("year", { ascending: false });

    if (stageId) {
      query = query.eq("stage_id", stageId);
    }

    const { data, error } = await query.limit(100);
    if (error) {
      console.error("[list-previous-papers]", error);
      return json(req, { error: "List failed", code: "INTERNAL_ERROR" }, 500);
    }

    const papers = (data ?? []).map((row) => {
      const src = row.gov_official_sources as
        | {
          id: string;
          title: string;
          source_url: string | null;
          is_official: boolean;
          document_type: string;
          review_state: string;
        }
        | {
          id: string;
          title: string;
          source_url: string | null;
          is_official: boolean;
          document_type: string;
          review_state: string;
        }[]
        | null;
      const source = Array.isArray(src) ? src[0] : src;

      const official =
        row.official_status === "official_verified" ||
        row.official_status === "admin_attested" ||
        (source?.is_official === true);

      return {
        id: row.id,
        examId: row.exam_id,
        stageId: row.stage_id,
        year: row.year,
        cycle: row.cycle,
        tier: row.tier,
        shift: row.shift,
        language: row.language,
        durationMinutes: row.duration_minutes,
        marking: row.marking,
        questionCount: row.question_count,
        title: row.title,
        officialStatus: row.official_status,
        answerKeyStatus: row.answer_key_status,
        reviewStatus: row.review_status,
        label: official ? "official" : "practice",
        source: source
          ? {
            id: source.id,
            title: source.title,
            sourceUrl: source.source_url,
            documentType: source.document_type,
          }
          : null,
      };
    });

    return json(req, {
      examId,
      stageId,
      count: papers.length,
      papers,
      bankEmpty: papers.length === 0,
      message:
        papers.length === 0
          ? "No approved previous-year papers in the registry yet. Practice papers can still be generated from the pattern blueprint."
          : undefined,
      disclaimer:
        "Clarify AI is not affiliated with any recruiting body. Official labels mean registry provenance only — verify on the official website.",
    });
  } catch (err) {
    console.error("[list-previous-papers]", err);
    return json(req, { error: "Internal error", code: "INTERNAL" }, 500);
  }
});
