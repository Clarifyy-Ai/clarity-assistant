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
  decodeSearchCursor,
  escapeIlikePattern,
  ilikeFilterValue,
  rankExamResults,
  resolveFamily,
  resolvePagination,
  validateSearchQuery,
  MAX_PAGE_SIZE,
  SERVICE_UNAVAILABLE,
  SERVICE_UNAVAILABLE_MESSAGE,
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
  short_name: string | null;
  family: string;
  description: string | null;
  legacy_exam_type: string | null;
  jurisdiction: string | null;
  state_code: string | null;
  region: string | null;
  verified_at: string | null;
  recruiting_bodies:
    | { id: string; code: string; name: string; official_url: string | null; jurisdiction?: string | null }
    | { id: string; code: string; name: string; official_url: string | null; jurisdiction?: string | null }[]
    | null;
  gov_exam_aliases: { alias: string }[] | null;
  gov_exam_stages: { id: string; code: string; name: string; sort_order: number }[] | null;
  gov_exam_languages?: { language_code: string }[] | null;
};

const EXAM_SELECT = `
  id, code, name, short_name, family, description, legacy_exam_type,
  jurisdiction, state_code, region, verified_at,
  recruiting_bodies ( id, code, name, official_url, jurisdiction ),
  gov_exam_aliases ( alias ),
  gov_exam_stages ( id, code, name, sort_order ),
  gov_exam_languages ( language_code )
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
    SERVICE_UNAVAILABLE,
    SERVICE_UNAVAILABLE_MESSAGE,
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
  const languages = [
    ...new Set(
      (row.gov_exam_languages ?? [])
        .map((l) => String(l.language_code ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const shortName = row.short_name?.trim() ||
    (row.code ? row.code.replace(/_/g, " ") : null);
  const jurisdiction = row.jurisdiction ??
    recruitingBody?.jurisdiction ??
    null;

  return {
    resultType: "official_exam" as const,
    examId: row.id,
    code: row.code,
    shortName,
    name: row.name,
    family: row.family,
    description: row.description,
    legacyExamType: row.legacy_exam_type,
    jurisdiction,
    stateCode: row.state_code,
    region: row.region,
    verifiedAt: row.verified_at,
    recruitingBody: recruitingBody
      ? {
        id: recruitingBody.id,
        code: recruitingBody.code,
        name: recruitingBody.name,
        officialUrl: recruitingBody.official_url,
        jurisdiction: recruitingBody.jurisdiction ?? null,
      }
      : null,
    aliases,
    stages,
    languages,
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
      ...RATE_LIMIT_PRESETS.SEARCH_BROWSE,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const url = new URL(req.url);
    let rawQuery: unknown = url.searchParams.get("q") ?? "";
    let rawFamily: unknown = url.searchParams.get("family") ?? "";
    let rawPage: unknown = url.searchParams.get("page") ?? undefined;
    let rawPageSize: unknown = url.searchParams.get("pageSize") ?? undefined;
    let rawCursor: unknown = url.searchParams.get("cursor") ?? undefined;

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
        if (rawCursor === undefined) rawCursor = record.cursor ?? record.nextCursor;
      }
    } else if (req.method !== "GET" && req.method !== "HEAD") {
      return corsError(req, 405, "BAD_REQUEST", "Method not allowed.");
    }

    const familyResult = resolveFamily(rawFamily);
    if (!familyResult.ok) {
      return corsError(req, 422, "VALIDATION_ERROR", familyResult.message);
    }
    const family = familyResult.family;
    const queryValidation = validateSearchQuery(rawQuery);
    if (!queryValidation.ok) {
      return corsError(req, 422, queryValidation.code, queryValidation.message);
    }
    const q = queryValidation.query;
    const cursorPage = decodeSearchCursor(rawCursor);
    const pageRequest = resolvePagination({
      page: cursorPage ?? rawPage,
      pageSize: rawPageSize,
    });

    const { data: profileRow } = await db
      .from("profiles")
      .select("region, timezone, locale")
      .eq("id", user.id)
      .maybeSingle();
    const isIndiaUser = resolveIsIndiaProfile(profileRow);

    // Alias / stage / body / cycle year hits cannot all be expressed as a single
    // PostgREST filter on gov_exams — resolve matching exam ids then union.
    let aliasExamIds: string[] = [];
    let bodyExamIds: string[] = [];
    let stageExamIds: string[] = [];
    let cycleExamIds: string[] = [];
    let languageExamIds: string[] = [];
    let paperExamIds: string[] = [];
    if (q) {
      const like = `%${escapeIlikePattern(q)}%`;
      const likeOr = ilikeFilterValue(q);
      const { data: aliasRows, error: aliasError } = await db
        .from("gov_exam_aliases")
        .select("exam_id")
        .ilike("alias", like)
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

      const { data: bodyRows, error: bodyError } = await db
        .from("recruiting_bodies")
        .select("id")
        .or(`name.ilike.${likeOr},code.ilike.${likeOr}`)
        .limit(50);
      if (bodyError) {
        console.warn("[search-exams] recruiting_bodies lookup:", bodyError.message);
      } else {
        const bodyIds = (bodyRows ?? [])
          .map((row) => String((row as { id?: string }).id ?? ""))
          .filter(Boolean);
        if (bodyIds.length > 0) {
          const { data: examByBody, error: examByBodyErr } = await db
            .from("gov_exams")
            .select("id")
            .in("recruiting_body_id", bodyIds)
            .eq("is_public", true)
            .eq("review_state", "approved")
            .limit(200);
          if (examByBodyErr) {
            console.warn("[search-exams] exams-by-body:", examByBodyErr.message);
          } else {
            bodyExamIds = (examByBody ?? [])
              .map((row) => String((row as { id?: string }).id ?? ""))
              .filter(Boolean);
          }
        }
      }

      // Stage name / code matches (e.g. "Tier I", "Prelims").
      const { data: stageRows, error: stageErr } = await db
        .from("gov_exam_stages")
        .select("exam_id")
        .or(`name.ilike.${likeOr},code.ilike.${likeOr}`)
        .limit(200);
      if (stageErr) {
        console.warn("[search-exams] stages lookup:", stageErr.message);
      } else {
        stageExamIds = [
          ...new Set(
            (stageRows ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }

      // Optional year match via exam cycles (e.g. "2024").
      const yearMatch = /^20\d{2}$/.test(q.trim()) ? Number(q.trim()) : null;
      if (yearMatch) {
        const { data: cycleRows, error: cycleErr } = await db
          .from("gov_exam_cycles")
          .select("exam_id")
          .eq("year", yearMatch)
          .eq("review_state", "approved")
          .limit(200);
        if (cycleErr) {
          console.warn("[search-exams] cycles lookup:", cycleErr.message);
        } else {
          cycleExamIds = [
            ...new Set(
              (cycleRows ?? [])
                .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
                .filter(Boolean),
            ),
          ];
        }
      }

      const { data: languageRows, error: languageErr } = await db
        .from("gov_exam_languages")
        .select("exam_id")
        .ilike("language_code", like)
        .eq("review_state", "approved")
        .limit(200);
      if (languageErr) {
        // Soft-fail: language index is optional enrichment, not required for name/alias hits.
        console.warn("[search-exams] languages lookup:", languageErr.message);
      } else {
        languageExamIds = [
          ...new Set(
            (languageRows ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }

      const { data: paperRows, error: paperErr } = await db
        .from("previous_year_papers")
        .select("exam_id")
        .or(
          [
            `title.ilike.${likeOr}`,
            `cycle.ilike.${likeOr}`,
            `tier.ilike.${likeOr}`,
            `shift.ilike.${likeOr}`,
            `language.ilike.${likeOr}`,
          ].join(","),
        )
        .in("review_status", ["approved", "in_review"])
        .limit(200);
      if (paperErr) {
        // Soft-fail: paper title search must not 503 the whole registry browse.
        console.warn("[search-exams] papers lookup:", paperErr.message);
      } else {
        paperExamIds = [
          ...new Set(
            (paperRows ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }
    }

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
      const idUnion = [
        ...new Set([
          ...aliasExamIds,
          ...bodyExamIds,
          ...stageExamIds,
          ...cycleExamIds,
          ...languageExamIds,
          ...paperExamIds,
        ]),
      ];
      query = query.or(
        idUnion.length > 0
          ? `${buildExamOrFilter(q)},id.in.(${idUnion.join(",")})`
          : buildExamOrFilter(q),
      );
    }

    // Fetch through the requested page before ranking so deep pagination does
    // not incorrectly return an empty list once page three is reached.
    const fetchSize = Math.min(Math.max(MAX_PAGE_SIZE * 3, pageRequest.to + 1), 1000);
    const { data: exams, error, count } = await query
      .order("name")
      .range(0, fetchSize - 1);

    if (error) {
      return searchUnavailable(req, error.message);
    }

    const pagination = buildPagination(pageRequest, count ?? 0);
    const mapped = ((exams ?? []) as ExamRow[]).map(mapExam);
    const ranked = rankExamResults(mapped, q);
    const results = ranked.slice(pageRequest.from, pageRequest.to + 1);

    // No matches is a successful empty result, never an error / never invent exams.
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

    // One pattern query for the current page — avoid N+1 that blows the client timeout.
    type PatternRow = {
      exam_id: string;
      stage_id: string;
      version: string;
      total_questions: number;
      total_marks: number;
      duration_minutes: number;
      negative_mark: number;
      languages: string[] | null;
      effective_date: string | null;
      source_url: string | null;
    };
    const patternByExamStage = new Map<string, PatternRow>();
    const pageExamIds = [...new Set(results.map((r) => r.examId).filter(Boolean))];
    if (pageExamIds.length > 0) {
      const { data: patternRows, error: patternErr } = await db
        .from("gov_exam_pattern_versions")
        .select(
          "exam_id, stage_id, version, total_questions, total_marks, duration_minutes, negative_mark, languages, effective_date, source_url",
        )
        .in("exam_id", pageExamIds)
        .eq("review_state", "approved")
        .order("effective_date", { ascending: false });
      if (patternErr) {
        console.warn("[search-exams] pattern batch lookup:", patternErr.message);
      } else {
        for (const row of (patternRows ?? []) as PatternRow[]) {
          const key = `${row.exam_id}:${row.stage_id}`;
          if (!patternByExamStage.has(key)) {
            patternByExamStage.set(key, row);
          }
        }
      }
    }

    const enriched = await Promise.all(
      results.map(async (r) => {
      const stage = r.stages[0];
      const registryLanguages = r.languages ?? [];
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
          languages: registryLanguages,
          lastVerified: r.verifiedAt,
          verifiedAt: r.verifiedAt,
          bankReadiness: emptyBank,
          approvedQuestionCount: emptyBank.approvedPublicCount,
        };
      }

      const pat = patternByExamStage.get(`${r.examId}:${stage.id}`);
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
      } else {
        // Prefer RPC counts; skip per-row questions table probes (latency).
        bankReadiness = {
          approvedPublicCount: 0,
          publicCount: 0,
          requiredQuestions,
          status: "empty",
          fullSimulationAvailable: false,
        };
      }

      const patternLanguages = (pat?.languages as string[] | null) ?? [];
      const languages = [
        ...new Set([...registryLanguages, ...patternLanguages].filter(Boolean)),
      ];

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
        languages,
        lastVerified: r.verifiedAt ?? pat?.effective_date ?? null,
        verifiedAt: r.verifiedAt ?? pat?.effective_date ?? null,
        stage,
        bankReadiness,
        approvedQuestionCount: bankReadiness.approvedPublicCount,
      };
      }),
    );

    return json(req, {
      success: true,
      query: q,
      family: family ?? null,
      count: pagination.total,
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
