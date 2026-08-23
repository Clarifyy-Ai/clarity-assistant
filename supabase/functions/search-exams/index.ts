import {
  handleCors,
  getCorsHeaders,
  withBrowserCors,
  applyCors,
  corsError,
} from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { resolveIsIndiaProfile } from "../_shared/indiaRegion.ts";
import {
  computeBankReadinessStatus,
  toBankReadinessPayload,
  type BankReadinessPayload,
} from "../_shared/govBankReadiness.ts";
import {
  buildExamOrFilter,
  buildPagination,
  resolveFamily,
  resolvePagination,
  SEARCH_SERVICE_UNAVAILABLE,
  SEARCH_SERVICE_UNAVAILABLE_MESSAGE,
  SEARCH_FAILED,
  SEARCH_FAILED_MESSAGE,
  INVALID_QUERY,
  INVALID_QUERY_MESSAGE,
} from "../_shared/govExamSearch.ts";

const DISCLAIMER =
  "Clarify AI is an independent preparation platform and is not affiliated with or endorsed by any government recruiting body. Candidates must verify notifications, eligibility, dates, syllabus, and examination rules on the official website.";

/** Families hidden from non-India profiles. */
const INDIA_ONLY_FAMILIES = new Set(["state_psc"]);
const INDIA_ONLY_CODES = new Set(["APPSC_GROUP2"]);

type ExamRow = {
  id: string;
  code: string;
  name: string;
  family: string;
  description: string | null;
  legacy_exam_type: string | null;
  recruiting_bodies:
    | { id: string; code: string; name: string; official_url: string | null }
    | { id: string; code: string; name: string; official_url: string | null }[]
    | null;
  gov_exam_aliases: { alias: string }[] | null;
  gov_exam_stages: { id: string; code: string; name: string; sort_order: number }[] | null;
};

const EXAM_SELECT = `
  id, code, name, family, description, legacy_exam_type,
  recruiting_bodies ( id, code, name, official_url ),
  gov_exam_aliases ( alias ),
  gov_exam_stages ( id, code, name, sort_order )
`;

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function searchUnavailable(req: Request, detail: string) {
  console.error("[search-exams]", detail);
  return corsError(
    req,
    503,
    SEARCH_SERVICE_UNAVAILABLE,
    SEARCH_SERVICE_UNAVAILABLE_MESSAGE,
  );
}

function searchFailed(req: Request, detail: string) {
  console.error("[search-exams]", detail);
  return corsError(
    req,
    500,
    SEARCH_FAILED,
    SEARCH_FAILED_MESSAGE,
  );
}

function mapExam(row: ExamRow) {
  const body = row.recruiting_bodies;
  const recruitingBody = Array.isArray(body) ? body[0] : body;
  const aliases = (row.gov_exam_aliases ?? []).map((a) => a.alias);
  const stages = [...(row.gov_exam_stages ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return {
    resultType: "official_exam" as const,
    examId: row.id,
    code: row.code,
    name: row.name,
    family: row.family,
    description: row.description,
    legacyExamType: row.legacy_exam_type,
    recruitingBody: recruitingBody
      ? {
        id: recruitingBody.id,
        code: recruitingBody.code,
        name: recruitingBody.name,
        officialUrl: recruitingBody.official_url,
      }
      : null,
    aliases,
    stages,
    primaryActions: ["view_exam", "generate_mock", "start_preparation"] as const,
  };
}

Deno.serve(withBrowserCors("search-exams", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const db = createServiceClient();

    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("search-exams", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const url = new URL(req.url);
    let rawQuery: unknown = url.searchParams.get("q") ?? "";
    let rawFamily: unknown = url.searchParams.get("family") ?? "";
    let rawPage: unknown = url.searchParams.get("page") ?? undefined;
    let rawPageSize: unknown = url.searchParams.get("pageSize") ?? undefined;

    if (req.method === "POST") {
      const raw = await req.text();
      if (raw.trim()) {
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return corsError(req, 400, "BAD_REQUEST", "Invalid JSON payload.");
        }
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          return corsError(req, 422, "VALIDATION_ERROR", "Search body must be an object.");
        }
        const record = body as Record<string, unknown>;
        if (record.q !== undefined && typeof record.q !== "string") {
          return corsError(req, 422, INVALID_QUERY, INVALID_QUERY_MESSAGE);
        }
        if (!String(rawQuery ?? "").trim()) rawQuery = record.q ?? "";
        if (!String(rawFamily ?? "").trim()) rawFamily = record.family ?? "";
        if (rawPage === undefined) rawPage = record.page;
        if (rawPageSize === undefined) rawPageSize = record.pageSize;
      }
    } else if (req.method !== "GET" && req.method !== "HEAD") {
      return corsError(req, 405, "BAD_REQUEST", "Method not allowed.");
    }

    const familyResult = resolveFamily(rawFamily);
    if (!familyResult.ok) {
      return corsError(req, 422, "VALIDATION_ERROR", familyResult.message);
    }
    const family = familyResult.family;
    const q = String(rawQuery ?? "").trim().slice(0, 120);
    const pageRequest = resolvePagination({ page: rawPage, pageSize: rawPageSize });

    const { data: profileRow } = await db
      .from("profiles")
      .select("region, timezone, locale")
      .eq("id", user.id)
      .maybeSingle();
    const isIndiaUser = resolveIsIndiaProfile(profileRow);

    // Alias hits cannot be expressed as a PostgREST filter on gov_exams, so
    // resolve matching exam ids first and union them into the main filter.
    let aliasExamIds: string[] = [];
    if (q) {
      const { data: aliasRows, error: aliasError } = await db
        .from("gov_exam_aliases")
        .select("exam_id")
        .ilike("alias", `%${q}%`)
        .limit(200);
      if (aliasError) {
        return searchUnavailable(req, `aliases: ${aliasError.message}`);
      }
      aliasExamIds = [
        ...new Set(
          (aliasRows ?? [])
            .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
            .filter(Boolean),
        ),
      ];
    }

    // Filtering and paging happen in PostgREST so a large registry never gets
    // pulled into the function.
    let query = db
      .from("gov_exams")
      .select(EXAM_SELECT, { count: "exact" })
      .eq("is_public", true)
      .eq("review_state", "approved");

    if (family) {
      query = query.eq("family", family);
    }
    if (!isIndiaUser) {
      for (const hidden of INDIA_ONLY_FAMILIES) {
        query = query.not("family", "eq", hidden);
      }
      for (const hidden of INDIA_ONLY_CODES) {
        query = query.not("code", "eq", hidden);
      }
    }
    if (q) {
      query = query.or(
        aliasExamIds.length > 0
          ? `${buildExamOrFilter(q)},id.in.(${aliasExamIds.join(",")})`
          : buildExamOrFilter(q),
      );
    }

    const { data: exams, error, count } = await query
      .order("name")
      .range(pageRequest.from, pageRequest.to);

    if (error) {
      return searchUnavailable(req, error.message);
    }

    const pagination = buildPagination(pageRequest, count ?? 0);
    const results = ((exams ?? []) as ExamRow[]).map(mapExam);

    // No matches is a successful empty result, never an error.
    if (results.length === 0) {
      return json(req, {
        success: true,
        query: q,
        family: family ?? null,
        count: 0,
        results: [],
        pagination,
        isIndiaUser,
        disclaimer: DISCLAIMER,
      });
    }

    const readinessByExam = new Map<string, BankReadinessPayload>();
    const { data: readinessRows, error: readinessErr } = await db.rpc(
      "get_gov_exam_bank_readiness",
    );
    if (readinessErr) {
      console.warn("[search-exams] bank readiness RPC unavailable:", readinessErr.message);
    } else {
      for (const row of readinessRows ?? []) {
        const examId = String((row as { exam_id?: string }).exam_id ?? "");
        if (!examId) continue;
        readinessByExam.set(examId, toBankReadinessPayload(row as Record<string, unknown>));
      }
    }

    // Enrichment is bounded by pageSize (<= MAX_PAGE_SIZE), not by the registry.
    const enriched = await Promise.all(
      results.map(async (r) => {
        const stage = r.stages[0];
        if (!stage) {
          const emptyBank = readinessByExam.get(r.examId) ?? {
            approvedPublicCount: 0,
            publicCount: 0,
            requiredQuestions: 0,
            status: "empty" as const,
            fullSimulationAvailable: false,
          };
          return {
            ...r,
            pattern: null,
            languages: [] as string[],
            lastVerified: null as string | null,
            bankReadiness: emptyBank,
          };
        }
        const { data: pat } = await db
          .from("gov_exam_pattern_versions")
          .select(
            "id, version, total_questions, total_marks, duration_minutes, negative_mark, languages, effective_date, source_url",
          )
          .eq("exam_id", r.examId)
          .eq("stage_id", stage.id)
          .eq("review_state", "approved")
          .order("effective_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const fromRpc = readinessByExam.get(r.examId);
        const requiredQuestions = pat?.total_questions ?? fromRpc?.requiredQuestions ?? 0;
        let bankReadiness: BankReadinessPayload;
        if (fromRpc) {
          const resolvedRequired = requiredQuestions || fromRpc.requiredQuestions;
          const status = computeBankReadinessStatus(
            fromRpc.approvedPublicCount,
            resolvedRequired,
          );
          bankReadiness = {
            ...fromRpc,
            requiredQuestions: resolvedRequired,
            status,
            fullSimulationAvailable: status === "ready",
          };
        } else if (r.legacyExamType) {
          const { count: bankCount } = await db
            .from("questions")
            .select("id", { count: "exact", head: true })
            .eq("exam_type", r.legacyExamType)
            .eq("is_public", true)
            .eq("is_verified", true);
          const approvedPublicCount = bankCount ?? 0;
          const status = computeBankReadinessStatus(approvedPublicCount, requiredQuestions);
          bankReadiness = {
            approvedPublicCount,
            publicCount: approvedPublicCount,
            requiredQuestions,
            status,
            fullSimulationAvailable: status === "ready",
          };
        } else {
          bankReadiness = {
            approvedPublicCount: 0,
            publicCount: 0,
            requiredQuestions,
            status: "empty",
            fullSimulationAvailable: false,
          };
        }

        return {
          ...r,
          pattern: pat
            ? {
              version: pat.version,
              totalQuestions: pat.total_questions,
              totalMarks: Number(pat.total_marks),
              durationMinutes: pat.duration_minutes,
              negativeMark: Number(pat.negative_mark),
              sourceUrl: pat.source_url,
            }
            : null,
          languages: (pat?.languages as string[] | null) ?? [],
          lastVerified: pat?.effective_date ?? null,
          stage,
          bankReadiness,
        };
      }),
    );

    return json(req, {
      success: true,
      query: q,
      family: family ?? null,
      count: enriched.length,
      results: enriched,
      pagination,
      isIndiaUser,
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    return searchFailed(
      req,
      err instanceof Error ? err.message : "unknown error",
    );
  }
}));
