import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("search-exams", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const url = new URL(req.url);
    let q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    let family = (url.searchParams.get("family") ?? "").trim().slice(0, 40);

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object") {
        if (!q) q = String((body as Record<string, unknown>).q ?? "").trim().slice(0, 120);
        if (!family) {
          family = String((body as Record<string, unknown>).family ?? "").trim().slice(0, 40);
        }
      }
    }

    const { data: exams, error } = await db
      .from("gov_exams")
      .select(`
        id, code, name, family, description, legacy_exam_type,
        recruiting_bodies ( id, code, name, official_url ),
        gov_exam_aliases ( alias ),
        gov_exam_stages ( id, code, name, sort_order )
      `)
      .eq("is_public", true)
      .eq("review_state", "approved")
      .order("name");

    if (error) {
      console.error("[search-exams]", error);
      return json(req, { error: "Search failed", code: "INTERNAL_ERROR" }, 500);
    }

    const qLower = q.toLowerCase();
    let results = (exams ?? []).map((e) => {
      const body = e.recruiting_bodies as
        | { id: string; code: string; name: string; official_url: string | null }
        | { id: string; code: string; name: string; official_url: string | null }[]
        | null;
      const recruitingBody = Array.isArray(body) ? body[0] : body;
      const aliases = ((e.gov_exam_aliases as { alias: string }[] | null) ?? []).map(
        (a) => a.alias,
      );
      const stages = ((e.gov_exam_stages as {
        id: string;
        code: string;
        name: string;
        sort_order: number;
      }[] | null) ?? []).sort((a, b) => a.sort_order - b.sort_order);

      return {
        resultType: "official_exam" as const,
        examId: e.id as string,
        code: e.code as string,
        name: e.name as string,
        family: e.family as string,
        description: e.description as string | null,
        legacyExamType: e.legacy_exam_type as string | null,
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
    });

    if (family) {
      results = results.filter((r) => r.family === family);
    }

    if (qLower) {
      results = results.filter((r) => {
        const hay = [
          r.name,
          r.code,
          r.family,
          r.recruitingBody?.name ?? "",
          r.recruitingBody?.code ?? "",
          ...r.aliases,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(qLower) ||
          qLower.split(/\s+/).every((tok) => hay.includes(tok));
      });
    }

    // Bank readiness matrix (public+verified vs pattern total) — single RPC
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
        readinessByExam.set(
          examId,
          toBankReadinessPayload(row as Record<string, unknown>),
        );
      }
    }

    // Attach approved pattern summary + bank readiness for top matches
    const enriched = await Promise.all(
      results.slice(0, 40).map(async (r) => {
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
          bankReadiness = {
            ...fromRpc,
            requiredQuestions: requiredQuestions || fromRpc.requiredQuestions,
            status: computeBankReadinessStatus(
              fromRpc.approvedPublicCount,
              requiredQuestions || fromRpc.requiredQuestions,
            ),
            fullSimulationAvailable: computeBankReadinessStatus(
              fromRpc.approvedPublicCount,
              requiredQuestions || fromRpc.requiredQuestions,
            ) === "ready",
          };
        } else if (r.legacyExamType) {
          // Fallback count when RPC not yet migrated
          const { count } = await db
            .from("questions")
            .select("id", { count: "exact", head: true })
            .eq("exam_type", r.legacyExamType)
            .eq("is_public", true)
            .eq("is_verified", true);
          const approvedPublicCount = count ?? 0;
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
          stage: stage,
          bankReadiness,
        };
      }),
    );

    return json(req, {
      query: q,
      family: family || null,
      count: enriched.length,
      results: enriched,
      disclaimer:
        "Clarify AI is an independent preparation platform and is not affiliated with or endorsed by any government recruiting body. Candidates must verify notifications, eligibility, dates, syllabus, and examination rules on the official website.",
    });
  } catch (err) {
    console.error("[search-exams]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
