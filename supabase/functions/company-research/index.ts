import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import { parseStructuredJson } from "../_shared/structuredParse.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import {
  normalizeCompanyName,
  companyResearchIdempotencyKey,
} from "../_shared/companyIdentity.ts";
import { callPythonProcess } from "../_shared/pythonClient.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import { DomainError } from "../_shared/domainErrors.ts";

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

type CompanyResearchClientData = {
  persisted: boolean;
  cached: boolean;
  id?: string;
  data: ResearchBrief;
  brief: ResearchBrief;
  source?: string;
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

function briefFromUnknown(data: unknown): ResearchBrief | null {
  if (!data || typeof data !== "object") return null;
  const brief = validateResponse(data as Record<string, unknown>);
  return isMeaningfulBrief(brief) ? brief : null;
}

/** Upsert on (user_id, company_name_normalized); on conflict, update-by-id. */
async function persistCompanyResearch(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  company: string,
  normalized: string,
  role: string,
  data: ResearchBrief,
): Promise<{ id: string } | null> {
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

  if (saved?.id) return { id: saved.id };

  const { data: existing } = await admin
    .from("company_research")
    .select("id")
    .eq("user_id", userId)
    .eq("company_name_normalized", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { data: updated, error: updateErr } = await admin
      .from("company_research")
      .update({
        company_name: company,
        role_title: role || null,
        overview: data.overview,
        culture,
        prep_tips: prepTips,
        raw_data: data,
      })
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();
    if (updated?.id) return { id: updated.id };
    if (!updateErr) return { id: existing.id };
    console.error("[company-research] update-by-id failed", updateErr.message);
  }

  if (persistErr) {
    console.error("[company-research] persist failed", persistErr.message);
  }
  return null;
}

async function persistCompanyResearchWithRetry(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  company: string,
  normalized: string,
  role: string,
  data: ResearchBrief,
): Promise<{ id: string } | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const saved = await persistCompanyResearch(
      admin,
      userId,
      company,
      normalized,
      role,
      data,
    );
    if (saved?.id) return saved;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

function briefFromPythonCompany(data: unknown, company: string, role: string): ResearchBrief | null {
  if (!data || typeof data !== "object") return null;
  const profile = (data as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const name = String(p.company_name ?? company).trim();
  const industry = String(p.industry ?? "").trim();
  const description = String(p.description ?? "").trim();
  const products = Array.isArray(p.products)
    ? p.products.filter((item): item is string => typeof item === "string").slice(0, 8)
    : [];
  const overview = description.length >= 40
    ? description
    : `${name} is being researched for ${role || "interview preparation"}. ` +
      `${industry ? `Known industry context: ${industry}. ` : ""}` +
      "Use verified company information and ask targeted questions before relying on assumptions.";
  const brief = validateResponse({
    overview,
    industry: industry || "Company research",
    tags: products,
    interview_process: [],
    questions: [
      `What recent priorities or products are most relevant to this ${role || "role"}?`,
    ],
    values: [],
    tips: [
      "Verify company-specific claims against the employer's official sources.",
    ],
    watch_outs: ["Do not present unverified assumptions as company facts."],
  });
  return isMeaningfulBrief(brief) ? brief : null;
}

function legacyJsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

async function generateBriefWithAi(
  company: string,
  role: string,
  userId: string,
): Promise<ResearchBrief> {
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
  const aiText = String(aiResult?.text ?? "").trim();
  if (!aiText) throw new Error("Empty AI response");

  const parsedResult = parseStructuredJson(
    aiText,
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
  const data = validateResponse(parsedResult.value ?? {});
  if (!isMeaningfulBrief(data)) {
    throw new Error("Invalid provider payload");
  }
  return data;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = crypto.randomUUID();
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

    const capabilityGate = await requireCapabilityForFunction(auth.planId, FN, req);
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
        const brief = briefFromUnknown(existing.raw_data);
        if (brief) {
          return legacyJsonResponse(req, {
            success: true,
            persisted: true,
            cached: true,
            id: existing.id,
            data: brief,
            brief,
            source: "database",
          });
        }
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

    const hybridResult = await executeHybridOperation<CompanyResearchClientData>({
      req,
      auth,
      operation: "company_research",
      idempotencyKey,
      creditCost: CREDIT_COST,
      creditAction: "company_research",
      body: { company, role, normalized, force },
      runDatabase: async () => {
        if (force) return null;
        const { data: existing } = await admin
          .from("company_research")
          .select("id, raw_data")
          .eq("user_id", userId)
          .eq("company_name_normalized", normalized)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const brief = briefFromUnknown(existing?.raw_data);
        if (!brief || !existing?.id) return null;
        return {
          persisted: true,
          cached: true,
          id: existing.id,
          data: brief,
          brief,
          source: "database",
        };
      },
      runPython: async (ctx) => {
        // Deterministic normalize first; optional AI enrichment in-path.
        let pyData: unknown = null;
        let source = "deterministic";
        try {
          const py = await callPythonProcess({
            operation: "company_normalize",
            operationId: ctx.operationId,
            correlationId: ctx.correlationId,
            payload: {
              company,
              company_name: company,
              role,
              role_title: role,
              normalized,
            },
          });
          if (py.ok) {
            pyData = py.data;
            source = "python";
          }
        } catch (err) {
          log(FN, "warn", "Python normalization unavailable; using deterministic brief", {
            requestId,
            error: String(err),
          });
        }

        let brief = briefFromPythonCompany(pyData, company, role);
        if (!brief) {
          brief = briefFromPythonCompany(
            { profile: { company_name: company, company_name_normalized: normalized } },
            company,
            role,
          );
        }

        try {
          const aiBrief = await generateBriefWithAi(company, role, userId);
          brief = aiBrief;
          source = source === "python" ? "python+ai" : "ai";
        } catch (err) {
          log(FN, "warn", "AI enrichment failed; keeping python brief if present", {
            requestId,
            error: String(err),
            hasPython: Boolean(brief),
          });
        }

        if (!brief) return null;

        const saved = await persistCompanyResearchWithRetry(
          admin,
          userId,
          company,
          normalized,
          role,
          brief,
        );
        if (!saved?.id) {
          throw new DomainError(
            "DATABASE_FAILURE",
            "Research was generated, but we could not save it after conflict recovery.",
          );
        }

        return {
          persisted: true,
          cached: false,
          id: saved.id,
          data: brief,
          brief,
          source,
        };
      },
      runDeterministic: async () => {
        const brief = briefFromPythonCompany(
          { profile: { company_name: company, company_name_normalized: normalized } },
          company,
          role,
        );
        if (!brief) return null;
        const saved = await persistCompanyResearchWithRetry(
          admin,
          userId,
          company,
          normalized,
          role,
          brief,
        );
        if (!saved?.id) {
          throw new DomainError(
            "DATABASE_FAILURE",
            "Research was generated, but we could not save it after conflict recovery.",
          );
        }
        return {
          persisted: true,
          cached: false,
          id: saved.id,
          data: brief,
          brief,
          source: "deterministic",
        };
      },
      runAi: async () => {
        // Fallback when Python path unavailable.
        const brief = await generateBriefWithAi(company, role, userId);
        const saved = await persistCompanyResearchWithRetry(
          admin,
          userId,
          company,
          normalized,
          role,
          brief,
        );
        if (!saved?.id) {
          throw new DomainError(
            "DATABASE_FAILURE",
            "Research was generated, but we could not save it after conflict recovery.",
          );
        }
        return {
          persisted: true,
          cached: false,
          id: saved.id,
          data: brief,
          brief,
          source: "ai",
        };
      },
    });

    if (!hybridResult.ok) {
      return hybridResult.response;
    }

    log(FN, "info", "Success", {
      requestId,
      company: normalized,
      userId,
      id: hybridResult.data.id,
      source: hybridResult.source,
    });

    return hybridResult.response;
  } catch (err) {
    log(FN, "error", "Unhandled error", { requestId, error: String(err) });
    return errorResponse(
      "Company research failed. Please try again.",
      "INTERNAL_ERROR",
      500,
      req,
    );
  }
});
