import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  successResponse,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import { parseStructuredJson } from "../_shared/structuredParse.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { getAiFeaturePolicy } from "../_shared/aiFeaturePolicy.ts";
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
import { DomainError, classifyAiFailure, defaultMessage } from "../_shared/domainErrors.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import { isUniqueViolation } from "../_shared/postgresErrors.ts";
import {
  COMPANY_BRIEF_AI_TIMEOUT_MS,
  cancelCompanyBriefJob,
  claimCompanyBriefJob,
  completeCompanyBriefJob,
  failCompanyBriefJob,
  insertCompanyBriefJob,
  isStaleCompanyBriefJob,
  isTerminalCompanyBriefStatus,
  loadCompanyBriefJob,
  patchCompanyBriefJob,
  requeueFailedCompanyBriefJob,
  reserveCompanyBriefCredits,
  scheduleWaitUntil,
  toCompanyBriefJobClient,
  userFacingCompanyBriefError,
  type CompanyBriefJobRow,
} from "../_shared/companyResearchJob.ts";

const FN = "company-research";
const CREDIT_COST = creditCost("company_research");

const SYSTEM_PROMPT = `You are an expert career and company research assistant.
Provide structured, factual, concise interview insights.
Return ONLY valid JSON.`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withTimeout<T>(promise: Promise<T>, ms = COMPANY_BRIEF_AI_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), ms),
    ),
  ]);
}

async function retry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
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

async function persistBriefResult(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  company: string,
  normalized: string,
  role: string,
  brief: ResearchBrief,
  source: string,
): Promise<CompanyResearchClientData | null> {
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

function jobAcceptedResponse(req: Request, job: CompanyBriefJobRow, replay = false): Response {
  return successResponse(
    {
      ...toCompanyBriefJobClient(job),
      accepted: true,
      async: true,
      idempotentReplay: replay,
      message: "Brief queued. Credits reserved until generation finishes.",
    },
    undefined,
    isTerminalCompanyBriefStatus(job.status) ? 200 : 202,
    req,
  );
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

  const policy = getAiFeaturePolicy("company_research");
  const aiResult = await withTimeout(
    retry(() =>
      generateWithFallback({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: Math.min(2000, policy.maxOutputTokens),
        temperature: 0.5,
        jsonMode: true,
        userId,
        action: "company_research",
        skipSecondaryOnQuota: policy.skipSecondaryOnQuota,
      }),
    ),
    COMPANY_BRIEF_AI_TIMEOUT_MS,
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

async function generateBriefViaHybrid(
  req: Request,
  auth: Awaited<ReturnType<typeof requireAuth>>,
  admin: ReturnType<typeof getAdminClient>,
  input: {
    company: string;
    role: string;
    normalized: string;
    force: boolean;
    idempotencyKey: string;
    jobId: string;
  },
): Promise<CompanyResearchClientData> {
  const { company, role, normalized, force, userId } = {
    ...input,
    userId: auth.userId,
  };

  const hybridResult = await executeHybridOperation<CompanyResearchClientData>({
    req,
    auth,
    operation: "company_research",
    idempotencyKey: `job:${input.jobId}:${input.idempotencyKey}`.slice(0, 150),
    creditCost: 0,
    creditAction: "company_research",
    body: { company, role, normalized, force, jobId: input.jobId },
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
      // MATRIX: database → python (normalize only) → ai
      let pyData: unknown = null;
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
        if (py.ok) pyData = py.data;
      } catch (err) {
        log(FN, "warn", "Python normalization unavailable", {
          error: String(err),
        });
      }

      const brief = briefFromPythonCompany(pyData, company, role);
      const isScaffold = Boolean(
        brief?.overview.includes("being researched for") ||
          brief?.watch_outs.some((w) => w.includes("unverified assumptions")),
      );
      if (!brief || !isMeaningfulBrief(brief) || isScaffold) {
        return null;
      }

      return {
        persisted: false,
        cached: false,
        data: brief,
        brief,
        source: "python",
      };
    },
    runDeterministic: async () => {
      const brief = briefFromPythonCompany(
        { profile: { company_name: company, company_name_normalized: normalized } },
        company,
        role,
      );
      if (!brief) return null;
      return {
        persisted: false,
        cached: false,
        data: brief,
        brief,
        source: "deterministic",
      };
    },
    runAi: async () => {
      const brief = await generateBriefWithAi(company, role, userId);
      return {
        persisted: false,
        cached: false,
        data: brief,
        brief,
        source: "ai",
      };
    },
  });

  if (!hybridResult.ok) {
    const code = String(hybridResult.code || "AI_PROVIDER_UNAVAILABLE");
    const mapped =
      code === "DATABASE_FAILURE"
        ? "DATABASE_FAILURE"
        : code === "AI_TIMEOUT"
        ? "AI_TIMEOUT"
        : code === "AI_INVALID_OUTPUT"
        ? "AI_INVALID_OUTPUT"
        : "AI_PROVIDER_UNAVAILABLE";
    throw new DomainError(mapped, userFacingCompanyBriefError(code));
  }

  return hybridResult.data;
}

async function processCompanyResearchJob(
  req: Request,
  auth: Awaited<ReturnType<typeof requireAuth>>,
  jobId: string,
): Promise<CompanyBriefJobRow | null> {
  const admin = getAdminClient();
  let job = await loadCompanyBriefJob(admin, jobId, auth.userId);
  if (!job) return null;

  if (isStaleCompanyBriefJob(job)) {
    return failCompanyBriefJob(admin, job, {
      code: "JOB_TIMEOUT",
      message: userFacingCompanyBriefError("JOB_TIMEOUT"),
      retryable: true,
    });
  }

  if (job.cancel_requested_at || job.status === "cancelled") {
    return job.status === "cancelled" ? job : cancelCompanyBriefJob(admin, job);
  }
  if (isTerminalCompanyBriefStatus(job.status)) return job;

  job = (await claimCompanyBriefJob(admin, jobId, auth.userId)) ?? job;
  if (job.status !== "processing") return job;

  try {
    await patchCompanyBriefJob(admin, job.id, { progress_stage: "generating" });
    const generated = await generateBriefViaHybrid(req, auth, admin, {
      company: job.company_name,
      role: job.role_title ?? "",
      normalized: job.company_name_normalized,
      force: job.force,
      idempotencyKey: job.idempotency_key,
      jobId: job.id,
    });

    const latest = await loadCompanyBriefJob(admin, job.id, auth.userId);
    if (latest?.cancel_requested_at || latest?.status === "cancelled") {
      return latest.status === "cancelled" ? latest : cancelCompanyBriefJob(admin, latest);
    }

    const brief = generated.brief;
    if (!brief || !isMeaningfulBrief(brief)) {
      throw new DomainError("AI_INVALID_OUTPUT", userFacingCompanyBriefError("AI_INVALID_OUTPUT"));
    }

    await patchCompanyBriefJob(admin, job.id, { progress_stage: "saving" });
    const persisted = generated.persisted && generated.id
      ? generated
      : await persistBriefResult(
          admin,
          auth.userId,
          job.company_name,
          job.company_name_normalized,
          job.role_title ?? "",
          brief,
          generated.source ?? "ai",
        );

    if (!persisted?.id) {
      throw new DomainError("DATABASE_FAILURE", userFacingCompanyBriefError("DATABASE_FAILURE"));
    }

    return completeCompanyBriefJob(admin, job, {
      researchId: persisted.id,
      brief: persisted.brief,
      source: persisted.source ?? generated.source ?? "ai",
    });
  } catch (err) {
    const code = err instanceof DomainError ? err.code : classifyAiFailure(err);
    const message = userFacingCompanyBriefError(
      code,
      err instanceof Error ? err.message : defaultMessage(code),
    );
    log(FN, "error", "Job process failed", { jobId, code, error: String(err) });
    const latest = (await loadCompanyBriefJob(admin, job.id, auth.userId)) ?? job;
    if (latest.status === "cancelled") return latest;
    return failCompanyBriefJob(admin, latest, {
      code,
      message,
      retryable: code !== "CAPABILITY_REQUIRED" && code !== "INSUFFICIENT_CREDITS",
    });
  }
}

function kickProcess(
  req: Request,
  auth: Awaited<ReturnType<typeof requireAuth>>,
  jobId: string,
): void {
  const background = processCompanyResearchJob(req, auth, jobId);
  if (!scheduleWaitUntil(background)) {
    void background;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = crypto.randomUUID();
  let userId = "";

  try {
    log(FN, "info", "Request started", { requestId, method: req.method });

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

    const url = new URL(req.url);
    const queryJobId = url.searchParams.get("jobId");
    const body = req.method === "GET"
      ? {}
      : await parseBody<Record<string, unknown>>(req).catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? (queryJobId ? "status" : "start")).trim().toLowerCase();
    const jobIdRaw = String(body.jobId ?? body.job_id ?? queryJobId ?? "").trim();
    const jobId = UUID_RE.test(jobIdRaw) ? jobIdRaw : "";

    const admin = getAdminClient();

    if (action === "status" || req.method === "GET") {
      if (!jobId) return errorResponse("Missing jobId", "INVALID_REQUEST", 400, req);
      let job = await loadCompanyBriefJob(admin, jobId, userId);
      if (!job) return errorResponse("Job not found", "JOB_NOT_FOUND", 404, req);
      if (isStaleCompanyBriefJob(job)) {
        job = await failCompanyBriefJob(admin, job, {
          code: "JOB_TIMEOUT",
          message: userFacingCompanyBriefError("JOB_TIMEOUT"),
          retryable: true,
        });
      }
      const payload = toCompanyBriefJobClient(job);
      return successResponse(payload, undefined, 200, req);
    }

    if (action === "cancel") {
      if (!jobId) return errorResponse("Missing jobId", "INVALID_REQUEST", 400, req);
      const job = await loadCompanyBriefJob(admin, jobId, userId);
      if (!job) return errorResponse("Job not found", "JOB_NOT_FOUND", 404, req);
      const cancelled = await cancelCompanyBriefJob(admin, job);
      return successResponse(toCompanyBriefJobClient(cancelled), undefined, 200, req);
    }

    if (action === "process") {
      if (!jobId) return errorResponse("Missing jobId", "INVALID_REQUEST", 400, req);
      const job = await loadCompanyBriefJob(admin, jobId, userId);
      if (!job) return errorResponse("Job not found", "JOB_NOT_FOUND", 404, req);
      if (!isTerminalCompanyBriefStatus(job.status)) {
        kickProcess(req, auth, job.id);
      }
      return jobAcceptedResponse(req, job);
    }

    if (action === "retry") {
      if (!jobId) return errorResponse("Missing jobId", "INVALID_REQUEST", 400, req);
      const existing = await loadCompanyBriefJob(admin, jobId, userId);
      if (!existing) return errorResponse("Job not found", "JOB_NOT_FOUND", 404, req);
      if (existing.status === "queued" || existing.status === "processing") {
        kickProcess(req, auth, existing.id);
        return jobAcceptedResponse(req, existing, true);
      }
      const requeued = await requeueFailedCompanyBriefJob(admin, existing);
      if (!requeued) {
        return errorResponse("This brief can no longer be retried.", "INVALID_REQUEST", 409, req);
      }
      const reserved = await reserveCompanyBriefCredits(
        admin,
        requeued.id,
        userId,
        CREDIT_COST,
        `${requeued.idempotency_key}:retry:${requeued.attempt_count + 1}`.slice(0, 150),
      );
      if (!reserved.success) {
        await failCompanyBriefJob(admin, requeued, {
          code: String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
          message: userFacingCompanyBriefError(
            String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
            typeof reserved.denial?.error === "string" ? reserved.denial.error : undefined,
          ),
          retryable: true,
        });
        return creditDenialResponse(req, {
          success: false,
          error: String(reserved.denial?.error ?? "Insufficient credits."),
          code: String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
          balance: Number(reserved.denial?.balance),
        }, CREDIT_COST);
      }
      kickProcess(req, auth, requeued.id);
      return jobAcceptedResponse(req, requeued);
    }

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

    const inserted = await insertCompanyBriefJob(admin, {
      userId,
      company,
      normalized,
      role,
      force,
      idempotencyKey,
    });
    if (!inserted.row) {
      return errorResponse(
        "Could not queue company research. Please try again.",
        "DATABASE_FAILURE",
        503,
        req,
      );
    }

    let job = inserted.row;
    if (inserted.replay && job.status === "completed" && job.brief) {
      return successResponse(toCompanyBriefJobClient(job, { cached: true }), undefined, 200, req);
    }

    if (inserted.replay && (job.status === "failed" || job.status === "cancelled")) {
      const requeued = await requeueFailedCompanyBriefJob(admin, job);
      if (!requeued) {
        return errorResponse(
          job.error_message || userFacingCompanyBriefError(job.error_code),
          job.error_code || "PROVIDER_UNAVAILABLE",
          503,
          req,
        );
      }
      job = requeued;
      inserted.replay = false;
    }

    if (!inserted.replay || job.credits_reserved <= 0) {
      const reserved = await reserveCompanyBriefCredits(
        admin,
        job.id,
        userId,
        CREDIT_COST,
        idempotencyKey,
      );
      if (!reserved.success) {
        if (!inserted.replay) {
          await failCompanyBriefJob(admin, job, {
            code: String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
            message: userFacingCompanyBriefError(
              String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
              typeof reserved.denial?.error === "string" ? reserved.denial.error : undefined,
            ),
            retryable: true,
          });
        }
        return creditDenialResponse(req, {
          success: false,
          error: String(reserved.denial?.error ?? "Insufficient credits."),
          code: String(reserved.denial?.code ?? "INSUFFICIENT_CREDITS"),
          balance: Number(reserved.denial?.balance),
        }, CREDIT_COST);
      }
    }

    if (!isTerminalCompanyBriefStatus(job.status)) {
      kickProcess(req, auth, job.id);
    }

    log(FN, "info", "Job accepted", {
      requestId,
      jobId: job.id,
      replay: inserted.replay,
      company: normalized,
      userId,
    });

    return jobAcceptedResponse(req, job, inserted.replay);
  } catch (err) {
    log(FN, "error", "Unhandled error", { requestId, error: String(err) });
    if (isUniqueViolation(err as { message?: string })) {
      return errorResponse(
        "A brief is already being generated for this company.",
        "DUPLICATE_REQUEST",
        409,
        req,
      );
    }
    return errorResponse(
      "Company research failed. Please try again.",
      "INTERNAL_ERROR",
      500,
      req,
    );
  }
});
