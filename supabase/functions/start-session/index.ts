// supabase/functions/start-session/index.ts
//
// Initializes an interview session.
// - strict request validation// Creates or reuses a recent active/pending session for the authenticated user.
// - rate limiting
// - safe DB writes
// - abandoned-session cleanup
// - audit logging
// - safe JSON responses

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import {
  handleCors,
  getCorsHeaders,
  withCorsHeaders,
} from "../_shared/cors.ts";

import { authenticateRequest, requireOnboardingComplete } from "../_shared/auth.ts";
import { isUserBanned } from "../_shared/banCheck.ts";

import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

import { parseJsonBody } from "../_shared/errors.ts";

import {
  logAuthFailure,
  logAuditEventFromRequest,
  logRateLimitBlocked,
  logValidationFailure,
} from "../_shared/audit.ts";

import { createServiceClient } from "../_shared/supabase.ts";
import { capDurationMinutes } from "../_shared/freeTier.ts";
import { requireCapabilityAsync, type Capability } from "../_shared/requireCapability.ts";
import {
  eligibilityUserMessage,
  httpStatusForEligibilityReason,
  isCoachingServiceConfigured,
  sessionServiceReadiness,
  type EligibilityRpc,
} from "../_shared/sessionStartEligibility.ts";
import { rpcJson } from "../_shared/sessionLifecycleRpc.ts";

const FUNCTION_NAME = "start-session";

const allowedSessionTypes = [
  "mock",
  "live",
  "warmup",
  "rehearsal",
  "room",
  "practice",
] as const;

const allowedInterviewTypes = [
  "behavioral",
  "behavioural",
  "technical",
  "case_study",
  "system_design",
  "hr",
  "mixed",
  "custom",
] as const;

const allowedPersonalityTypes = [
  "strict",
  "friendly",
  "neutral",
  "panel",
] as const;

const allowedHintStyles = [
  "minimal",
  "balanced",
  "detailed",
] as const;

const startSessionSchema = z.object({
  session_type: z
    .enum(allowedSessionTypes)
    .optional(),

  type: z
    .enum(allowedSessionTypes)
    .optional(),

  interview_type: z
    .enum(allowedInterviewTypes)
    .optional()
    .default("behavioral"),

  company: z
    .string()
    .trim()
    .max(120, "Company name is too long.")
    .nullable()
    .optional(),

  role: z
    .string()
    .trim()
    .max(120, "Role is too long.")
    .nullable()
    .optional(),

  resume_id: z
    .string()
    .uuid("Invalid resume ID.")
    .nullable()
    .optional(),

  jd_id: z
    .string()
    .uuid("Invalid job description ID.")
    .nullable()
    .optional(),

  duration_minutes: z
    .number()
    .int()
    .min(5)
    .max(60)
    .optional()
    .default(30),

  question_count: z
    .number()
    .int()
    .min(5)
    .max(20)
    .optional()
    .default(10),

  personality_type: z
    .enum(allowedPersonalityTypes)
    .optional()
    .default("neutral"),

  enable_recording: z
    .boolean()
    .optional()
    .default(false),

  enable_transcription: z
    .boolean()
    .optional()
    .default(true),

  enable_metrics: z
    .boolean()
    .optional()
    .default(true),

  model: z
    .string()
    .trim()
    .max(100, "Model name is too long.")
    .optional()
    .default("gemini-2.5-flash"),

  hint_style: z
    .enum(allowedHintStyles)
    .optional()
    .default("balanced"),

  focus_areas: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(80)
    )
    .max(20, "Too many focus areas.")
    .optional()
    .default([]),

  is_practice: z
    .boolean()
    .optional()
    .default(false),

  practice_context_id: z
    .string()
    .uuid("Invalid practice context ID.")
    .nullable()
    .optional(),

  source_type: z
    .enum(["answer_bank", "manual", "interview_day"])
    .nullable()
    .optional(),

  session_call_type: z
    .enum(["interview", "regular_call"])
    .nullable()
    .optional(),

  action: z
    .enum(["start", "eligibility", "restore", "heartbeat"])
    .optional()
    .default("start"),

  session_id: z
    .string()
    .uuid("Invalid session ID.")
    .nullable()
    .optional(),

  check_only: z
    .boolean()
    .optional()
    .default(false),
});

type StartSessionRequest = z.infer<typeof startSessionSchema>;

type SessionType = (typeof allowedSessionTypes)[number];

type ExistingSessionRow = {
  id: string;
  created_at: string;
  status: string;
  practice_context_id?: string | null;
};

function shouldReuseExistingSession(opts: {
  existingStatus: string | null | undefined;
  existingContextId: string | null | undefined;
  requestContextId: string | null | undefined;
}): boolean {
  const status = String(opts.existingStatus ?? "").toLowerCase();
  if (status === "completed" || status === "abandoned") return false;
  if (status !== "pending") return false;
  const existing = opts.existingContextId ?? null;
  const request = opts.requestContextId ?? null;
  if (request && existing !== request) return false;
  if (!request && existing) return false;
  return true;
}

type CreatedSessionRow = {
  id: string;
};

function json(
  corsHeaders: HeadersInit,
  status: number,
  body: unknown
): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function zodErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key =
      issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";

    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }

    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

function sanitizeShortText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : null;
}

function normalizeInterviewType(value: string): string {
  if (value === "behavioural") {
    return "behavioral";
  }

  return value;
}

function toSessionType(body: StartSessionRequest): SessionType {
  return body.session_type ?? body.type ?? "mock";
}

const DB_SESSION_TYPES = new Set<string>([
  "live",
  "mock",
  "warmup",
  "rehearsal",
  "room",
]);

const DB_AI_MODELS = new Set<string>([
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet",
  "claude-3-haiku",
  "gemini-1-5-pro",
  "gemini-1-5-flash",
  "gemini-2.0-flash",
]);

/** Map API session types to values allowed by the sessions.type column. */
function toDbSessionType(type: SessionType): SessionType {
  if (type === "practice") return "rehearsal";
  if (DB_SESSION_TYPES.has(type)) return type;
  return "mock";
}

function toDbModel(model: string): string {
  const value = model.trim();

  const map: Record<string, string> = {
    "gemini-flash": "gemini-2.5-flash",
    "gemini-pro": "gemini-2.5-flash",
    "gemini-2.5-flash": "gemini-2.5-flash",
    "gpt_4o": "gpt-4o",
  };

  const mapped = map[value] ?? value;

  if (/^gemini-[a-z0-9.-]+$/i.test(mapped)) {
    return mapped;
  }

  if (/^gpt-[a-z0-9.-]+$/i.test(mapped)) {
    return mapped;
  }

  return "gemini-1-5-flash";
}

function toDbModelEnum(model: string): string {
  const mapped = toDbModel(model);
  // sessions.model_used enum may not include newer API ids yet
  if (
    mapped === "gemini-2.5-flash" ||
    mapped === "gemini-flash-latest" ||
    mapped === "gemini-2.0-flash-lite"
  ) {
    return "gemini-2.0-flash";
  }
  return DB_AI_MODELS.has(mapped) ? mapped : "gemini-1-5-flash";
}

function buildSessionTags(options: {
  sessionType: SessionType;
  isPractice: boolean;
}): string[] {
  const tags: string[] = [];

  if (
    options.isPractice ||
    options.sessionType === "mock" ||
    options.sessionType === "warmup" ||
    options.sessionType === "rehearsal" ||
    options.sessionType === "room" ||
    options.sessionType === "practice"
  ) {
    tags.push("practice");
  }

  if (options.sessionType === "rehearsal") {
    tags.push("rehearsal");
  }

  return tags;
}

/** Only keep IDs that exist in public.documents (sessions.document_id / jd_id FK). */
async function resolveDocumentsFk(
  db: ReturnType<typeof createServiceClient>,
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;

  const { data, error } = await db
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[start-session] documents FK lookup failed:", error.message);
    return null;
  }

  return data?.id ?? null;
}

/** Validate resume ownership in resumes table (wizard IDs live here, not documents). */
async function assertOwnedResume(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  resumeId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!resumeId) return { ok: true };
  const { data, error } = await db
    .from("resumes")
    .select("id, user_id")
    .eq("id", resumeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[start-session] resume ownership lookup failed:", error.message);
    return { ok: false, message: "Could not verify the selected resume." };
  }
  if (!data) {
    // Resume may live in documents instead (legacy / unified docs).
    const { data: doc, error: docErr } = await db
      .from("documents")
      .select("id, user_id, document_type")
      .eq("id", resumeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr || !doc) {
      return { ok: false, message: "Resume is required and must belong to you." };
    }
  }
  return { ok: true };
}

async function assertOwnedJd(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  jdId: string | null | undefined,
): Promise<
  | { ok: true; effectiveJdId: string | null }
  | { ok: false; message: string }
> {
  if (!jdId) return { ok: true, effectiveJdId: null };
  const { data, error } = await db
    .from("job_descriptions")
    .select("id, user_id, parse_status")
    .eq("id", jdId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!error && data) {
    const status = String((data as { parse_status?: string }).parse_status ?? "ready");
    // JD is optional. A still-processing or failed parse must not block session start —
    // proceed without attaching JD context (TC-REG-010 / Practice Coach).
    if (status && !["ready", "completed", ""].includes(status)) {
      console.warn(
        "[start-session] optional JD not ready — starting without jd_id",
        { jdId, status },
      );
      return { ok: true, effectiveJdId: null };
    }
    return { ok: true, effectiveJdId: jdId };
  }
  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("id, user_id")
    .eq("id", jdId)
    .eq("user_id", userId)
    .maybeSingle();
  if (docErr || !doc) {
    return { ok: false, message: "The selected job description is no longer available." };
  }
  return { ok: true, effectiveJdId: jdId };
}

function setupInvalid(
  corsHeaders: HeadersInit,
  message: string,
  fields?: string[],
): Response {
  return json(corsHeaders, 400, {
    error: message,
    code: "SETUP_INVALID",
    fields: fields ?? [],
  });
}

function buildSessionTitle(options: {
  sessionType: SessionType;
  company: string | null;
}): string {
  const label =
    options.sessionType === "live"
      ? "Live"
      : options.sessionType === "rehearsal"
        ? "Rehearsal"
        : options.sessionType === "warmup"
          ? "Warmup"
          : options.sessionType === "room"
            ? "Room"
            : "Mock";

  if (options.company) {
    return `${label} — ${options.company}`;
  }

  return options.sessionType === "live"
    ? "Practice Coach"
    : options.sessionType === "rehearsal"
      ? "Practice Session"
      : options.sessionType === "warmup"
        ? "Mock warmup"
        : "Mock interview";
}

async function parseAndValidateRequest(
  req: Request,
  corsHeaders: HeadersInit
): Promise<
  | {
      ok: true;
      data: StartSessionRequest;
    }
  | {
      ok: false;
      response: Response;
      details?: unknown;
    }
> {
  let rawBody: unknown;

  try {
    rawBody = await parseJsonBody(req);
  } catch {
    return {
      ok: false,
      response: json(corsHeaders, 400, {
        error: "Invalid JSON payload.",
        code: "BAD_REQUEST",
      }),
    };
  }

  const validationResult = startSessionSchema.safeParse(rawBody);

  if (!validationResult.success) {
    return {
      ok: false,
      details: zodErrors(validationResult.error),
      response: json(corsHeaders, 422, {
        error: "Validation failed.",
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: zodErrors(validationResult.error),
        },
      }),
    };
  }

  return {
    ok: true,
    data: validationResult.data,
  };
}

function buildConfig(input: {
  body: StartSessionRequest;
  sessionType: SessionType;
  durationMinutes: number;
  questionCount: number;
  company: string | null;
  role: string | null;
}) {
  return {
    company: input.company,
    role: input.role,
    interview_type: normalizeInterviewType(input.body.interview_type),
    question_count: input.questionCount,
    time_per_question_seconds: Math.round(
      (input.durationMinutes * 60) / input.questionCount
    ),
    model: toDbModelEnum(input.body.model),
    hint_style: input.body.hint_style,
    include_warmup: false,
    resume_id: input.body.resume_id ?? null,
    jd_id: input.body.jd_id ?? null,
    focus_areas: input.body.focus_areas,
    duration_minutes: input.durationMinutes,
    personality_type: input.body.personality_type,
    enable_recording: input.body.enable_recording,
    enable_transcription: input.body.enable_transcription,
    enable_metrics: input.body.enable_metrics,
    session_type: input.sessionType,
  };
}

function capabilityForSessionType(sessionType: SessionType): Capability {
  if (sessionType === "live" || sessionType === "rehearsal") return "live_rehearsal";
  return "mock_interview";
}

function eligibilityPayload(data: EligibilityRpc, reason: string) {
  return {
    allowed: reason === "ALLOWED",
    reason,
    error: reason === "ALLOWED" ? undefined : eligibilityUserMessage(reason, data),
    code: reason === "ALLOWED" ? undefined : reason,
    used: data.used ?? null,
    limit: data.limit ?? null,
    reset_at: data.reset_at ?? null,
    upgrade_available: data.upgrade_available ?? reason === "DAILY_LIMIT_REACHED",
    session_id: data.session_id,
    reused: data.reused,
    started_at: data.started_at,
    expires_at: data.expires_at ?? null,
    status: data.status,
    lifecycle_status: data.lifecycle_status,
    terminal_reason: data.terminal_reason ?? null,
    found: data.found,
    duration_seconds: data.duration_seconds ?? null,
    ended_at: data.ended_at ?? null,
    readiness: sessionServiceReadiness(),
  };
}

function eligibilityHttp(
  corsHeaders: HeadersInit,
  data: EligibilityRpc,
  reason: string,
): Response {
  const status = httpStatusForEligibilityReason(reason);
  return json(corsHeaders, status, eligibilityPayload(data, reason));
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);

  if (corsResponse) {
    return corsResponse;
  }

  const corsHeaders = getCorsHeaders(req);

  try {

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

    return withCorsHeaders(req, auth.error);
  }

  const { user } = auth.context;

  const onboardingBlock = await requireOnboardingComplete(user.id, req);
  if (onboardingBlock) {
    return withCorsHeaders(req, onboardingBlock);
  }

  const db = createServiceClient();

  const rateLimitResult = await checkRateLimitAsync(db, {
    key: createRateLimitKey(FUNCTION_NAME, user.id),
    ...RATE_LIMIT_PRESETS.SESSION_ACTION,
  });

  if (!rateLimitResult.allowed) {
    await logRateLimitBlocked({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      limit: rateLimitResult.limit,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });

    return withCorsHeaders(req, rateLimitResponse(rateLimitResult));
  }

  const validation = await parseAndValidateRequest(req, corsHeaders);

  if (!validation.ok) {
    await logValidationFailure({
      req,
      userId: user.id,
      functionName: FUNCTION_NAME,
      details: validation.details,
    });

    return validation.response;
  }

  const body = validation.data;
  const action = body.check_only ? "eligibility" : (body.action ?? "start");
  const idempotencyKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    req.headers.get("x-idempotency-key")?.trim() ||
    null;

  if (await isUserBanned(db, user.id)) {
    return eligibilityHttp(corsHeaders, {}, "ACCOUNT_RESTRICTED");
  }

  const { data: profile } = await db
    .from("profiles")
    .select("plan_id, credits")
    .eq("id", user.id)
    .maybeSingle();

  const sessionType = toDbSessionType(toSessionType(body));
  const capabilityGate = await requireCapabilityAsync(
    profile?.plan_id ?? "free",
    capabilityForSessionType(sessionType),
    req,
  );
  if (capabilityGate && action === "start") {
    return json(corsHeaders, 403, {
      ...eligibilityPayload({}, "CAPABILITY_REQUIRED"),
      error: "This session type requires a supported plan.",
      code: "CAPABILITY_REQUIRED",
    });
  }

  if (action === "eligibility") {
    const { data, error } = await rpcJson(db, "session_start_eligibility", {
      p_user_id: user.id,
    });
    if (error) {
      console.error("[start-session] eligibility rpc:", error);
      return json(corsHeaders, 500, {
        error: "Could not check session eligibility.",
        code: "INTERNAL_ERROR",
      });
    }
    let reason = String(data.reason ?? (data.allowed ? "ALLOWED" : "ACCOUNT_RESTRICTED"));
    if (reason === "ALLOWED" && !isCoachingServiceConfigured()) {
      reason = "PROVIDER_UNAVAILABLE";
    }
    if (reason === "ALLOWED") {
      return json(corsHeaders, 200, eligibilityPayload(data, "ALLOWED"));
    }
    return eligibilityHttp(corsHeaders, data, reason);
  }

  if (action === "restore" || action === "heartbeat") {
    const { data, error } = await rpcJson(db, "restore_owned_session", {
      p_user_id: user.id,
      p_session_id: body.session_id ?? null,
      // sessions.type has no 'practice' value — always map before the RPC.
      p_type: toDbSessionType(sessionType),
    });
    if (error) {
      console.error("[start-session] restore rpc:", error);
      return json(corsHeaders, 500, {
        error: "Could not restore session.",
        code: "INTERNAL_ERROR",
      });
    }
    if (data.reason === "SESSION_EXPIRED" || data.expired) {
      return json(corsHeaders, 409, {
        error: "This practice session has expired and can no longer accept new actions.",
        code: "SESSION_EXPIRED",
        reason: "SESSION_EXPIRED",
        session_id: data.session_id,
        terminal_reason: data.terminal_reason ?? "SESSION_TIMEOUT",
        status: data.status,
        lifecycle_status: data.lifecycle_status ?? "EXPIRED",
        duration_seconds: data.duration_seconds ?? null,
        ended_at: data.ended_at ?? null,
      });
    }
    if (!data.found) {
      return json(corsHeaders, 200, {
        found: false,
        reason: "NONE",
        code: "NONE",
      });
    }
    if (action === "heartbeat" && data.session_id) {
      await db
        .from("sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.session_id)
        .eq("user_id", user.id)
        .in("status", ["pending", "active", "paused"]);
    }
    return json(corsHeaders, 200, {
      found: true,
      reason: "ACTIVE",
      session_id: data.session_id,
      status: data.status,
      lifecycle_status: data.lifecycle_status,
      started_at: data.started_at,
      expires_at: data.expires_at,
      type: data.type ?? sessionType,
      reused: true,
    });
  }

  if (!isCoachingServiceConfigured()) {
    return eligibilityHttp(corsHeaders, {}, "PROVIDER_UNAVAILABLE");
  }

  const isPractice = body.is_practice || sessionType !== "live";
  const sessionTags = buildSessionTags({ sessionType, isPractice });
  const company = sanitizeShortText(body.company);
  const role = sanitizeShortText(body.role);
  const callType = body.session_call_type ?? null;

  // Enforce Practice Coach interview contract when the client declares interview mode.
  if (callType === "interview") {
    if (!role) {
      return setupInvalid(corsHeaders, "Choose a target role before continuing.", ["role"]);
    }
    if (!body.resume_id) {
      return setupInvalid(corsHeaders, "Resume is required.", ["resume_id"]);
    }
  }

  const resumeOwned = await assertOwnedResume(db, user.id, body.resume_id);
  if (!resumeOwned.ok) {
    return setupInvalid(corsHeaders, resumeOwned.message, ["resume_id"]);
  }
  const jdOwned = await assertOwnedJd(db, user.id, body.jd_id);
  if (!jdOwned.ok) {
    return setupInvalid(corsHeaders, jdOwned.message, ["jd_id"]);
  }
  // May be null when an optional JD is still processing / failed — session continues without it.
  const resolvedJdInput = jdOwned.effectiveJdId;

  const durationMinutes = capDurationMinutes(
    profile?.plan_id ?? "free",
    body.duration_minutes,
  );
  const questionCount = body.question_count;
  const nowIso = new Date().toISOString();
  // Keep session config consistent with FK: drop optional JD when skipped as not-ready.
  const config = buildConfig({
    body: { ...body, jd_id: resolvedJdInput },
    sessionType,
    durationMinutes,
    questionCount,
    company,
    role,
  });
  const practiceContextId = body.practice_context_id ?? null;
  const sourceType = body.source_type ?? (practiceContextId ? "answer_bank" : null);

  if (practiceContextId) {
    const { data: ctxRow, error: ctxErr } = await db
      .from("practice_contexts")
      .select("id, user_id, status")
      .eq("id", practiceContextId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ctxErr) {
      console.error("[start-session] practice_context lookup:", ctxErr.message);
      return json(corsHeaders, 500, {
        error: "Could not start session.",
        code: "SESSION_LOOKUP_FAILED",
      });
    }
    if (!ctxRow) {
      return json(corsHeaders, 404, {
        error: "Practice context not found.",
        code: "PRACTICE_CONTEXT_NOT_FOUND",
      });
    }
    const ctxStatus = String((ctxRow as { status?: string }).status ?? "");
    if (ctxStatus === "consumed" || ctxStatus === "expired") {
      return json(corsHeaders, 409, {
        error: "This practice launch was already used.",
        code: "PRACTICE_CONTEXT_CONSUMED",
      });
    }
  }

  // sessions.document_id / jd_id FK → documents only; keep wizard IDs in config.
  const documentId = await resolveDocumentsFk(db, body.resume_id);
  const jdId = await resolveDocumentsFk(db, resolvedJdInput);

  const { data: started, error: startErr } = await rpcJson(db, "start_owned_session", {
    p_user_id: user.id,
    // sessions.type has no 'practice' value — always map before the RPC.
    p_type: toDbSessionType(sessionType),
    p_title: buildSessionTitle({ sessionType, company }),
    p_document_id: documentId,
    p_jd_id: jdId,
    p_model_used: toDbModelEnum(config.model as string),
    p_tags: sessionTags.length > 0 ? sessionTags : null,
    p_practice_context_id: practiceContextId,
    p_source_type: sourceType,
    p_duration_minutes: durationMinutes,
    p_idempotency_key: idempotencyKey,
  });

  if (startErr) {
    console.error("[start-session] start rpc:", startErr);
    return json(corsHeaders, 500, {
      error: "Could not create session.",
      code: "SESSION_CREATE_FAILED",
    });
  }

  if (!started.ok || started.allowed === false) {
    const reason = String(started.reason ?? "ACCOUNT_RESTRICTED");
    return eligibilityHttp(corsHeaders, started, reason);
  }

  if (!started.session_id) {
    return json(corsHeaders, 500, {
      error: "Could not create session.",
      code: "SESSION_CREATE_FAILED",
    });
  }

  const reusedStatus = String(started.status ?? "").toLowerCase();
  const reusedLife = String(started.lifecycle_status ?? "").toUpperCase();
  if (
    started.reused === true &&
    (reusedStatus === "completed" ||
      reusedStatus === "abandoned" ||
      reusedStatus === "cancelled" ||
      reusedLife === "COMPLETED" ||
      reusedLife === "EXPIRED" ||
      reusedLife === "CANCELLED")
  ) {
    return json(corsHeaders, 409, {
      error: "That practice session already ended. Start a new one.",
      code: "SESSION_NOT_AVAILABLE",
    });
  }

  if (practiceContextId && started.reused !== true) {
    const { data: consumed, error: consumeErr } = await db
      .from("practice_contexts")
      .update({
        status: "consumed",
        consumed_at: nowIso,
      })
      .eq("id", practiceContextId)
      .eq("user_id", user.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (consumeErr) {
      console.error("[start-session] consume context:", consumeErr.message);
    } else if (!consumed) {
      await rpcJson(db, "end_owned_session", {
        p_user_id: user.id,
        p_session_id: started.session_id,
        p_terminal_reason: "CANCELLED",
        p_lifecycle_status: "CANCELLED",
      });
      return json(corsHeaders, 409, {
        error: "This practice launch was already used.",
        code: "PRACTICE_CONTEXT_CONSUMED",
      });
    }
  }

  try {
    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "SESSION_START",
      resourceType: "session",
      resourceId: started.session_id,
      status: "success",
      metadata: {
        reused: Boolean(started.reused),
        sessionType,
        interviewType: config.interview_type,
        questionCount,
        durationMinutes,
      },
    });
  } catch (auditErr) {
    console.warn("[start-session] audit failed:", auditErr);
  }

  return json(corsHeaders, 200, {
    session_id: started.session_id,
    config,
    started_at: started.started_at ?? nowIso,
    expires_at: started.expires_at ?? null,
    reused: Boolean(started.reused),
    status: started.status ?? "active",
    lifecycle_status: started.lifecycle_status ?? "IN_PROGRESS",
  });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected start-session error.";
    console.error("[start-session] Unhandled error:", message);
    try {
      return json(getCorsHeaders(req), 500, {
        error: "Could not start session.",
        code: "INTERNAL_ERROR",
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "Could not start session.", code: "INTERNAL_ERROR" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }
});
