import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import {
  deductCreditsAtomic,
  refundCredits,
  getIdempotentResponse,
  storeIdempotentResponse,
  createServiceClient,
} from "../_shared/supabase.ts";
import { parseStructuredJson } from "../_shared/structuredParse.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import {
  normalizeCompanyName,
  companyResearchIdempotencyKey,
} from "../_shared/companyIdentity.ts";

const FN = "company-research";
const CREDIT_COST = creditCost("company_research");

const SYSTEM_PROMPT = `You are an expert career and company research assistant.
Provide structured, factual, concise interview insights.
Return ONLY valid JSON.`;

function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), ms),
    ),
  ]);
}

async function retry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

type ResearchBrief = {
  overview: string;
  industry: string;
  tags: string[];
  interview_process: string[];
  questions: string[];
  values: string[];
  tips: string[];
  watch_outs: string[];
};

function validateResponse(data: Record<string, unknown>): ResearchBrief {
  return {
    overview: typeof data.overview === "string" ? data.overview.trim() : "",
    industry: typeof data.industry === "string" ? data.industry.trim() : "",
    tags: Array.isArray(data.tags)
      ? data.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
      : [],
    interview_process: Array.isArray(data.interview_process)
      ? data.interview_process.filter((t): t is string => typeof t === "string")
      : [],
    questions: Array.isArray(data.questions)
      ? data.questions.filter((t): t is string => typeof t === "string")
      : [],
    values: Array.isArray(data.values)
      ? data.values.filter((t): t is string => typeof t === "string")
      : [],
    tips: Array.isArray(data.tips)
      ? data.tips.filter((t): t is string => typeof t === "string")
      : [],
    watch_outs: Array.isArray(data.watch_outs)
      ? data.watch_outs.filter((t): t is string => typeof t === "string")
      : [],
  };
}

function isMeaningfulBrief(data: ResearchBrief): boolean {
  const overview = data.overview.trim();
  if (!overview || overview === "No overview available.") return false;
  if (overview.length < 40) return false;
  const substance =
    data.tags.length +
    data.interview_process.length +
    data.questions.length +
    data.values.length +
    data.tips.length;
  return substance > 0;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = crypto.randomUUID();
  let charged = false;
  let userId = "";

  try {
    log(FN, "info", "Request started", { requestId });

    const auth = await requireAuth(req);
    userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      FN,
      userId,
    );
    if (rateLimited) return rateLimited;

    const planGate = requirePlan(auth.planId, "pro", req);
    if (planGate) return planGate;

    const capabilityGate = requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    const body = await parseBody<Record<string, unknown>>(req);
    const rawCompany = String(body.company ?? body.companyName ?? "").trim();
    const rawRole = String(body.role ?? body.roleTitle ?? "").trim();
    const force = body.force === true || body.refresh === true;

    if (!rawCompany) {
      return errorResponse("Missing company name", "INVALID_REQUEST", 400, req);
    }

    const company = rawCompany.slice(0, 100);
    const role = rawRole.slice(0, 100);
    const normalized = normalizeCompanyName(company);
    if (!normalized) {
      return errorResponse("Missing company name", "INVALID_REQUEST", 400, req);
    }

    const admin = getAdminClient();

    if (!force) {
      const { data: existing, error: existingErr } = await admin
        .from("company_research")
        .select("id, raw_data")
        .eq("user_id", userId)
        .eq("company_name_normalized", normalized)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        log(FN, "error", "Cache read failed", {
          requestId,
          error: existingErr.message,
        });
      } else if (existing?.raw_data && typeof existing.raw_data === "object") {
        return jsonResponse(req, {
          success: true,
          persisted: true,
          cached: true,
          id: existing.id,
          data: existing.raw_data,
          brief: existing.raw_data,
        });
      }
    }

    const headerKey = req.headers.get("x-idempotency-key")?.trim();
    const derivedKey = companyResearchIdempotencyKey({
      userId,
      normalizedCompany: normalized.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._:-]/g, "_"),
      force,
    });
    const idempotencyKey =
      headerKey && /^[A-Za-z0-9._:-]{16,150}$/.test(headerKey)
        ? headerKey.slice(0, 150)
        : derivedKey.slice(0, 150);

    const serviceDb = createServiceClient();
    const prior = await getIdempotentResponse(serviceDb, idempotencyKey, {
      userId,
      action: "company_research",
    });
    if (prior?.success && prior.payload?.data && prior.payload?.persisted) {
      return jsonResponse(req, {
        success: true,
        persisted: true,
        cached: true,
        id: prior.payload.id,
        data: prior.payload.data,
        brief: prior.payload.data,
        balance: prior.balanceAfter ?? prior.balance,
      });
    }

    const creditResult = await deductCreditsAtomic({
      userId,
      action: "company_research",
      cost: CREDIT_COST,
      idempotencyKey,
    });

    if (!creditResult.success) {
      return creditDenialResponse(req, creditResult, CREDIT_COST);
    }
    charged = true;

    if (creditResult.payload?.data && creditResult.payload?.persisted) {
      return jsonResponse(req, {
        success: true,
        persisted: true,
        cached: true,
        id: creditResult.payload.id,
        data: creditResult.payload.data,
        brief: creditResult.payload.data,
        balance: creditResult.balanceAfter ?? creditResult.balance,
      });
    }

    const prompt = `Generate a company research brief for interview preparation.

Company: ${company}
Role: ${role || "General interview"}

Return ONLY valid JSON:

{
  "overview": "",
  "industry": "",
  "tags": [],
  "interview_process": [],
  "questions": [],
  "values": [],
  "tips": [],
  "watch_outs": []
}`;

    let aiText = "";
    try {
      const aiResult = await withTimeout(
        retry(() =>
          generateWithFallback({
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            maxTokens: 2000,
            temperature: 0.5,
            jsonMode: true,
            userId,
            action: "company_research",
          }),
        ),
        20000,
      );
      aiText = String(aiResult?.text ?? "").trim();
      if (!aiText) throw new Error("Empty AI response");
    } catch (err) {
      await refundCredits({
        userId,
        cost: CREDIT_COST,
        reason: "company-research provider failure",
      });
      charged = false;
      log(FN, "error", "Provider failed", { requestId, error: String(err) });
      return errorResponse(
        "Company research is temporarily unavailable. Please try again.",
        "PROVIDER_UNAVAILABLE",
        503,
        req,
      );
    }

    const parsedResult = parseStructuredJson(
      aiText,
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value),
    );
    const data = validateResponse(parsedResult.value ?? {});

    if (!isMeaningfulBrief(data)) {
      await refundCredits({
        userId,
        cost: CREDIT_COST,
        reason: "company-research invalid provider payload",
      });
      charged = false;
      return errorResponse(
        "Company research is temporarily unavailable. Please try again.",
        "PROVIDER_UNAVAILABLE",
        503,
        req,
      );
    }

    const culture =
      data.values.length > 0 ? data.values.join("; ") : data.industry || null;
    const prepTips =
      data.tips.length > 0
        ? data.tips.join("; ")
        : data.watch_outs.length > 0
        ? data.watch_outs.join("; ")
        : null;

    const upsertRow = {
      user_id: userId,
      company_name: company,
      company_name_normalized: normalized,
      role_title: role || null,
      overview: data.overview,
      culture,
      prep_tips: prepTips,
      raw_data: data,
    };

    const { data: saved, error: persistErr } = await admin
      .from("company_research")
      .upsert(upsertRow, { onConflict: "user_id,company_name_normalized" })
      .select("id")
      .maybeSingle();

    if (persistErr || !saved?.id) {
      await refundCredits({
        userId,
        cost: CREDIT_COST,
        reason: "company-research persistence failure",
      });
      charged = false;
      log(FN, "error", "Persist failed", {
        requestId,
        error: persistErr?.message ?? "missing id",
      });
      return errorResponse(
        "Research was generated, but we could not save it. Please retry.",
        "DATABASE_UNAVAILABLE",
        503,
        req,
      );
    }

    await storeIdempotentResponse(
      serviceDb,
      idempotencyKey,
      {
        success: true,
        balance: creditResult.balanceAfter ?? creditResult.balance,
        balanceAfter: creditResult.balanceAfter ?? creditResult.balance,
        payload: {
          persisted: true,
          id: saved.id,
          data,
        },
      },
      { userId, action: "company_research" },
    );

    log(FN, "info", "Success", {
      requestId,
      company: normalized,
      userId,
      id: saved.id,
    });

    return jsonResponse(req, {
      success: true,
      persisted: true,
      cached: false,
      id: saved.id,
      data,
      brief: data,
      balance: creditResult.balanceAfter ?? creditResult.balance,
    });
  } catch (err) {
    if (charged && userId) {
      try {
        await refundCredits({
          userId,
          cost: CREDIT_COST,
          reason: "company-research unhandled failure",
        });
      } catch {
        // best-effort compensation
      }
    }
    log(FN, "error", "Unhandled error", { requestId, error: String(err) });
    return errorResponse(
      "Company research failed. Please try again.",
      "INTERNAL_ERROR",
      500,
      req,
    );
  }
});
