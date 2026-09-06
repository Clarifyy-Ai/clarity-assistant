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
import { indiaUserAfterProfileLookup, PROFILE_LOOKUP_TIMEOUT_MS } from "../_shared/indiaRegion.ts";
import { withTimeout } from "../_shared/withTimeout.ts";
import {
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
  GOV_EXAM_FAMILIES,
  MAX_PAGE_SIZE,
  SERVICE_UNAVAILABLE,
  SERVICE_UNAVAILABLE_MESSAGE,
  SEARCH_SERVICE_UNAVAILABLE,
  SEARCH_SERVICE_UNAVAILABLE_MESSAGE,
  SEARCH_FAILED,
  SEARCH_FAILED_MESSAGE,
  INVALID_QUERY,
  INVALID_QUERY_MESSAGE,
} from "../_shared/govExamSearch.ts";

const DISCLAIMER =
  "Career Pilot is an independent preparation platform and is not affiliated with or endorsed by any government recruiting body. Candidates must verify notifications, eligibility, dates, syllabus, and examination rules on the official website.";

/** Families hidden from non-India profiles. */
const INDIA_ONLY_FAMILIES = new Set(["state_psc"]);
const INDIA_ONLY_CODES = new Set(["APPSC_GROUP2"]);
const SECONDARY_SEARCH_BUDGET_MS = 3_500;

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
  // Prefer SEARCH_SERVICE_UNAVAILABLE for the public contract; keep message stable.
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

    // The registry is extensible: prefer active family rows over the legacy
    // built-in list so new families do not require an edge-function deploy.
    const { data: familyRows, error: familyError } = await db
      .from("exam_families")
      .select("code")
      .eq("is_active", true);
    const dynamicFamilies = (familyRows ?? [])
      .map((row) => String((row as { code?: unknown }).code ?? "").trim().toLowerCase())
      .filter(Boolean);
    const allowedFamilies =
      familyError || dynamicFamilies.length === 0
        ? GOV_EXAM_FAMILIES
        : dynamicFamilies;
    const familyResult = resolveFamily(rawFamily, allowedFamilies);
    if (!familyResult.ok) {
      return corsError(req, 422, "VALIDATION_ERROR", familyResult.message);
    }
    const family = familyResult.family;
    const queryValidation = validateSearchQuery(rawQuery);
    if (!queryValidation.ok) {
      return corsError(req, 422, queryValidation.code, queryValidation.message);
    }
    const q = queryValidation.query;

    // Rate-limit only validated searches — invalid/empty payloads must not burn quota.
    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("search-exams", user.id),
      ...RATE_LIMIT_PRESETS.SEARCH_BROWSE,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const cursorPage = decodeSearchCursor(rawCursor);
    const pageRequest = resolvePagination({
      page: cursorPage ?? rawPage,
      pageSize: rawPageSize,
    });

    let isIndiaUser = true;
    let profileLookup: "ok" | "timed_out" | "failed" = "ok";
    try {
      const { data: profileRow } = await withTimeout(
        db
          .from("profiles")
          .select("region, timezone, locale")
          .eq("id", user.id)
          .maybeSingle(),
        PROFILE_LOOKUP_TIMEOUT_MS,
      );
      isIndiaUser = indiaUserAfterProfileLookup(profileRow, "ok");
    } catch (profileErr) {
      const timedOut =
        profileErr instanceof Error && /timeout/i.test(profileErr.message);
      profileLookup = timedOut ? "timed_out" : "failed";
      isIndiaUser = indiaUserAfterProfileLookup(null, profileLookup);
      console.warn(
        "[search-exams] profile lookup",
        profileLookup,
        profileErr instanceof Error ? profileErr.message : "unknown",
      );
    }

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
      // Optional year match via exam cycles (e.g. "2024").
      const yearMatch = /^20\d{2}$/.test(q.trim()) ? Number(q.trim()) : null;

      // Independent secondary indexes — run in parallel (sequential was ~4–5s).
      const [aliasRes, bodyRes, stageRes, cycleRes, languageRes, paperRes] =
        await withTimeout(Promise.all([
          db.from("gov_exam_aliases").select("exam_id").ilike("alias", like).limit(200),
          db
            .from("recruiting_bodies")
            .select("id")
            .or(`name.ilike.${likeOr},code.ilike.${likeOr}`)
            .limit(50),
          db
            .from("gov_exam_stages")
            .select("exam_id")
            .or(`name.ilike.${likeOr},code.ilike.${likeOr}`)
            .limit(200),
          yearMatch
            ? db
              .from("gov_exam_cycles")
              .select("exam_id")
              .eq("year", yearMatch)
              .eq("review_state", "approved")
              .limit(200)
            : Promise.resolve({ data: [] as { exam_id?: string }[], error: null }),
          db
            .from("gov_exam_languages")
            .select("exam_id")
            .ilike("language_code", like)
            .eq("review_state", "approved")
            .limit(200),
          db
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
            .limit(200),
        ]), SECONDARY_SEARCH_BUDGET_MS).catch((lookupError) => {
          // Name/code search remains authoritative. Optional enrichment indexes
          // must not consume the entire typeahead request budget.
          console.warn(
            "[search-exams] secondary lookup budget exceeded:",
            lookupError instanceof Error ? lookupError.message : "unknown",
          );
          const empty = { data: [], error: null };
          return [empty, empty, empty, empty, empty, empty] as const;
        });

      // Soft-fail: alias index is enrichment; name/body hits must still succeed.
      if (aliasRes.error) {
        console.warn("[search-exams] aliases lookup:", aliasRes.error.message);
        aliasExamIds = [];
      } else {
        aliasExamIds = [
          ...new Set(
            (aliasRes.data ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }

      if (bodyRes.error) {
        console.warn("[search-exams] recruiting_bodies lookup:", bodyRes.error.message);
      } else {
        const bodyIds = (bodyRes.data ?? [])
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

      if (stageRes.error) {
        console.warn("[search-exams] stages lookup:", stageRes.error.message);
      } else {
        stageExamIds = [
          ...new Set(
            (stageRes.data ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }

      if (cycleRes.error) {
        console.warn("[search-exams] cycles lookup:", cycleRes.error.message);
      } else {
        cycleExamIds = [
          ...new Set(
            (cycleRes.data ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }

      if (languageRes.error) {
        // Soft-fail: language index is optional enrichment, not required for name/alias hits.
        console.warn("[search-exams] languages lookup:", languageRes.error.message);
      } else {
        languageExamIds = [
          ...new Set(
            (languageRes.data ?? [])
              .map((row) => String((row as { exam_id?: string }).exam_id ?? ""))
              .filter(Boolean),
          ),
        ];
      }

      if (paperRes.error) {
        // Soft-fail: paper title search must not 503 the whole registry browse.
        console.warn("[search-exams] papers lookup:", paperRes.error.message);
      } else {
        paperExamIds = [
          ...new Set(
            (paperRes.data ?? [])
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
        // Preserve the registry total for an out-of-range page. A valid
        // search with no matches has total=0; a deep page can be empty while
        // earlier pages still contain results.
        count: pagination.total,
        results: [],
        pagination,
        isIndiaUser,
        profileLookup,
        disclaimer: DISCLAIMER,
      });
    }

    // One pattern query for the current page — avoid N+1 that blows the client timeout.
    // Intentionally skip get_gov_exam_bank_readiness on search (questions scan); detail pages load counts.
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
      // Search typeahead must stay fast: skip get_gov_exam_bank_readiness (questions
      // table scan). Detail/generate pages still load accurate bank counts.
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

    const enriched = results.map((r) => {
      const stage = r.stages[0];
      const registryLanguages = r.languages ?? [];
      if (!stage) {
        const emptyBank: BankReadinessPayload = {
          approvedPublicCount: 0,
          publicCount: 0,
          requiredQuestions: 0,
          status: "empty",
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
      const requiredQuestions = pat?.total_questions ?? 0;
      // Search omits live bank counts (see above); avoid fabricating readiness.
      const bankReadiness: BankReadinessPayload = {
        approvedPublicCount: 0,
        publicCount: 0,
        requiredQuestions,
        status: requiredQuestions > 0 ? "partial" : "empty",
        fullSimulationAvailable: false,
      };

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
    });

    return json(req, {
      success: true,
      query: q,
      family: family ?? null,
      count: pagination.total,
      results: enriched,
      pagination,
      isIndiaUser,
      profileLookup,
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    return searchFailed(
      req,
      err instanceof Error ? err.message : "unknown error",
    );
  }
}));
