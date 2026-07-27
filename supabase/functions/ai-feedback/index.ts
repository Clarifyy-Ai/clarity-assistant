// supabase/functions/ai-feedback/index.ts
//
// Generates structured AI feedback on interview answers.
//
// Production hardening:
// - CORS handling
// - POST-only method enforcement
// - centralized JWT authentication
// - Zod input validation
// - rate limiting
// - session ownership & type enforcement (DB-only, no client practice flag)
// - atomic credit deduction
// - safe refund via refundCredits helper
// - audit logging

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, resolveUserPlanId } from "../_shared/auth.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  isSessionTypeAllowedForAi,
} from "../_shared/sessionEnforcement.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import {
  logAiAudit,
  logAuthFailure,
  logRateLimitBlocked,
  logValidationFailure,
} from "../_shared/audit.ts";
import {
  createServiceClient,
  deductCreditsAtomic,
  refundCredits,
} from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";
import {
  callAI,
  extractBYOK,
} from "../_shared/utils.ts";
import { resolveModel } from "../_shared/resolveModel.ts";
import type { ModelId } from "../_shared/types.ts";
import { creditCost } from "../_shared/creditEconomics.ts";

const FUNCTION_NAME = "ai-feedback";
const CREDIT_COST = creditCost("live_feedback");

const SYSTEM_PROMPT = `
You are an expert interview coach.
Provide structured, actionable, JSON-only feedback.
Never output markdown or commentary.
Be concise, constructive, and professional.
Always return strictly valid JSON following the provided schema.
`;

const requestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question is required.")
    .max(2_000, "Question is too long."),

  transcript: z
    .string()
    .trim()
    .min(1, "Transcript is required.")
    .max(5_000, "Transcript is too long."),

  interview_type: z
    .string()
    .trim()
    .max(80, "Interview type is too long.")
    .optional()
    .default("behavioural"),

  target_company: z
    .string()
    .trim()
    .max(120, "Company name is too long.")
    .optional()
    .default("unspecified"),

  session_id: z.string().uuid("Invalid session ID."),

  answer_id: z
    .string()
    .uuid("Invalid answer ID.")
    .nullable()
    .optional(),

  wpm: z
    .number()
    .min(0)
    .max(500)
    .nullable()
    .optional(),

  filler_count: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .nullable()
    .optional(),

  resume_text: z
    .string()
    .trim()
    .max(2_000, "Resume text is too long.")
    .optional()
    .default(""),
});

function json(
  corsHeaders: HeadersInit,
  status: number,
  body: unknown,
): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return json(corsHeaders, 405, {
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  const auth = await authenticateRequest(req);

  if (auth.error) {
    await logAuthFailure({
      req,
      functionName: FUNCTION_NAME,
      reason: "Missing or invalid access token.",
    });
    const errHeaders = new Headers(auth.error.headers);
    new Headers(corsHeaders).forEach((v, k) => errHeaders.set(k, v));
    return new Response(auth.error.body, {
      status: auth.error.status,
      headers: errHeaders,
    });
  }

  const { user } = auth.context;

  const planId = await resolveUserPlanId(user.id);
  const capabilityGate = requireCapabilityForFunction(planId, FUNCTION_NAME, req);
  if (capabilityGate) {
    const capHeaders = new Headers(capabilityGate.headers);
    new Headers(corsHeaders).forEach((v, k) => capHeaders.set(k, v));
    return new Response(capabilityGate.body, { status: capabilityGate.status, headers: capHeaders });
  }

  const rateLimitResult = await checkRateLimitAsync(createServiceClient(), {
    key: createRateLimitKey(FUNCTION_NAME, user.id),
    ...RATE_LIMIT_PRESETS.AI_GENERATION,
  });

  if (!rateLimitResult.allowed) {
    await logRateLimitBlocked({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      limit: rateLimitResult.limit,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });

    const rlResp = rateLimitResponse(rateLimitResult);
    const rlHeaders = new Headers(rlResp.headers);
    new Headers(corsHeaders).forEach((v, k) => rlHeaders.set(k, v));
    return new Response(rlResp.body, { status: rlResp.status, headers: rlHeaders });
  }

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody(req);
  } catch {
    return json(corsHeaders, 400, {
      error: "Invalid JSON payload.",
      code: "BAD_REQUEST",
    });
  }

  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    await logValidationFailure({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      details: parsed.error.flatten(),
    });

    return json(corsHeaders, 422, {
      error: "Validation failed.",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const body = parsed.data;
  const db = createServiceClient();

  const { data: sessionRow, error: sessionErr } = await db
    .from("sessions")
    .select("id, user_id, status, type, tags")
    .eq("id", body.session_id)
    .single();

  if (sessionErr || !sessionRow || sessionRow.user_id !== user.id) {
    return json(corsHeaders, 403, {
      error: "Invalid session.",
      code: "FORBIDDEN",
    });
  }

  const sessionVerdict = isSessionTypeAllowedForAi(sessionRow);

  if (!sessionVerdict.allowed) {
    return json(corsHeaders, 403, {
      error: sessionVerdict.message ?? "Session type not permitted for AI feedback.",
      code: "FORBIDDEN",
    });
  }

  if (sessionRow.status !== "active") {
    return json(corsHeaders, 400, {
      error: "Session not active.",
      code: "INVALID_STATE",
    });
  }

  if (body.answer_id) {
    const { data: answerRow, error: answerErr } = await db
      .from("session_answers")
      .select("id, user_id")
      .eq("id", body.answer_id)
      .single();

    if (answerErr || !answerRow || answerRow.user_id !== user.id) {
      return json(corsHeaders, 403, {
        error: "Answer not found.",
        code: "FORBIDDEN",
      });
    }
  }

  const creditResult = await deductCreditsAtomic({
    userId: user.id,
    action: "generate_feedback",
    cost: CREDIT_COST,
    sessionId: body.session_id,
  });

  if (!creditResult.success) {
    return json(corsHeaders, 402, {
      error: "Not enough credits.",
      code: "INSUFFICIENT_CREDITS",
    });
  }

  const safeQuestion = body.question.slice(0, 1000);
  const safeTranscript = body.transcript.slice(0, 3000);
  const safeResume = body.resume_text.slice(0, 1000);

  const prompt = `
Interview type: ${body.interview_type}
Target company: ${body.target_company}

Question: ${safeQuestion}
Candidate answer: ${safeTranscript}

Speaking metrics:
- WPM: ${body.wpm ?? "unknown"}
- Filler words: ${body.filler_count ?? 0}

Resume context: ${safeResume || "None"}

Return ONLY valid JSON matching EXACTLY this structure:
{
  "score": 0,
  "content_score": 0,
  "structure_score": 0,
  "communication_score": 0,
  "confidence_score": 0,
  "feedback": "",
  "strengths": [],
  "improvements": [],
  "star_breakdown": {
    "situation": "",
    "task": "",
    "action": "",
    "result": ""
  },
  "model_answer": "",
  "sentiment": "neutral"
}
`;

  let aiResult;
  const resolvedModel = await resolveModel(db, user.id, null);

  try {
    aiResult = await callAI(
      {
        model: resolvedModel as ModelId,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        maxTokens: 1500,
        temperature: 0.3,
      },
      extractBYOK(req),
    );
  } catch (aiErr) {
    await refundCredits({
      userId: user.id,
      cost: CREDIT_COST,
      reason: "ai-feedback AI call failure",
      sessionId: body.session_id,
    });

    await logAiAudit({
      req,
      userId: user.id,
      action: "AI_FEEDBACK",
      sessionId: body.session_id,
      status: "failure",
      metadata: { reason: "AI call failed, credits refunded." },
    });

    return json(corsHeaders, 502, {
      error: "AI service temporarily unavailable. Credits refunded.",
      code: "AI_ERROR",
    });
  }

  const feedback = parseJSON(aiResult.text, null);

  if (!feedback) {
    await refundCredits({
      userId: user.id,
      cost: CREDIT_COST,
      reason: "ai-feedback invalid JSON response",
      sessionId: body.session_id,
    });

    return json(corsHeaders, 500, {
      error: "AI returned invalid JSON. Credits refunded.",
      code: "AI_ERROR",
    });
  }

  if (body.answer_id) {
    await db
      .from("session_answers")
      .update({
        score: feedback.score,
        content_score: feedback.content_score,
        structure_score: feedback.structure_score,
        communication_score: feedback.communication_score,
        confidence_score: feedback.confidence_score,
        ai_feedback: feedback.feedback,
        model_answer: feedback.model_answer,
        star_breakdown: feedback.star_breakdown,
        sentiment: feedback.sentiment,
      })
      .eq("id", body.answer_id);
  }

  await logAiAudit({
    req,
    userId: user.id,
    action: "AI_FEEDBACK",
    sessionId: body.session_id,
    status: "success",
    metadata: { cost: CREDIT_COST, answerId: body.answer_id ?? null },
  });

  return new Response(JSON.stringify(feedback), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
