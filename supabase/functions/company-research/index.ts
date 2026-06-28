import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  deductCredits,
  callAI,
  log,
} from "../_shared/utils.ts";
import { parseJSON } from "../_shared/gemini.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import {
  enforceAiRateLimit,
} from "../_shared/rateLimit.ts";
import { creditCost } from "../_shared/creditEconomics.ts";

const FN = "company-research";
const CREDIT_COST = creditCost("company_research");

const SYSTEM_PROMPT = `
You are an expert career and company research assistant.
Provide structured, factual, concise interview insights.
Return ONLY valid JSON.
`;

function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), ms)
    ),
  ]);
}

async function retry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError;

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

function validateResponse(data: any) {
  return {
    overview:
      typeof data?.overview === "string"
        ? data.overview
        : "No overview available.",

    industry:
      typeof data?.industry === "string"
        ? data.industry
        : "",

    tags: Array.isArray(data?.tags)
      ? data.tags.slice(0, 20)
      : [],

    interview_process: Array.isArray(data?.interview_process)
      ? data.interview_process
      : [],

    questions: Array.isArray(data?.questions)
      ? data.questions
      : [],

    values: Array.isArray(data?.values)
      ? data.values
      : [],

    tips: Array.isArray(data?.tips)
      ? data.tips
      : [],

    watch_outs: Array.isArray(data?.watch_outs)
      ? data.watch_outs
      : [],
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = crypto.randomUUID();

  try {
    log(FN, "info", "Request started", { requestId });

    const auth = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = enforceAiRateLimit("company-research", userId);
    if (rateLimited) return rateLimited;

    const planGate = requirePlan(auth.planId, "starter", req);
    if (planGate) return planGate;

    const body = await parseBody<any>(req);

    const rawCompany = String(body.company || "").trim();
    const rawRole = String(body.role || "").trim();

    if (!rawCompany) {
      return errorResponse(
        "Missing company name",
        "INVALID_REQUEST",
        400
      );
    }

    const company = rawCompany.slice(0, 100);
    const role = rawRole.slice(0, 100);

    const credit = await deductCredits(
      userId,
      "company_research" as any,
      CREDIT_COST
    );

    if (!credit.success) {
      return errorResponse(
        "Insufficient credits.",
        "INSUFFICIENT_CREDITS",
        402
      );
    }

    const prompt = `
Generate a company research brief for interview preparation.

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
}
`;

    let aiResult;

    try {
      aiResult = await withTimeout(
        retry(() =>
          callAI({
            model: "gemini-2.0-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            maxTokens: 2000,
            temperature: 0.5,
          })
        ),
        20000
      );

      if (!aiResult?.text) {
        throw new Error("Empty AI response");
      }
    } catch (err) {
      await deductCredits(
        userId,
        "refund_company_research" as any,
        -CREDIT_COST
      );

      log(FN, "error", "AI failed", {
        requestId,
        error: String(err),
      });

      return errorResponse(
        "Company research unavailable. Credits refunded.",
        "AI_ERROR",
        502
      );
    }

    const parsed = parseJSON(aiResult.text, {
      overview: "",
      industry: "",
      tags: [],
      interview_process: [],
      questions: [],
      values: [],
      tips: [],
      watch_outs: [],
    });

    const data = validateResponse(parsed);

    log(FN, "info", "Success", {
      requestId,
      company,
      userId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data,
      }),
      {
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    log(FN, "error", "Unhandled error", {
      requestId,
      error: String(err),
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  }
});
