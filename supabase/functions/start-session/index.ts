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

import { authenticateRequest } from "../_shared/auth.ts";
import { bannedResponse, isUserBanned } from "../_shared/banCheck.ts";

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
import {
  capDurationMinutes,
  FREE_TIER_DAILY_SESSION_LIMIT,
  isFreePlan,
} from "../_shared/freeTier.ts";

const FUNCTION_NAME = "start-session";

const SESSION_LOOKBACK_HOURS = 24;

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
    .default("gemini-1-5-flash"),

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
});

type StartSessionRequest = z.infer<typeof startSessionSchema>;

type SessionType = (typeof allowedSessionTypes)[number];

type ExistingSessionRow = {
  id: string;
  created_at: string;
  status: string;
};

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
    "gemini-flash": "gemini-1-5-flash",
    "gemini-pro": "gemini-1-5-pro",
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

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);

  if (corsResponse) {
    return corsResponse;
  }

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

    return withCorsHeaders(req, auth.error);
  }

  const { user } = auth.context;

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

  if (await isUserBanned(db, user.id)) {
    return withCorsHeaders(req, bannedResponse(corsHeaders));
  }

  // ── Free-tier enforcement ──
  const { data: profile } = await db
    .from("profiles")
    .select("plan_id, credits")
    .eq("id", user.id)
    .single();

  if (!profile?.plan_id || profile.plan_id === "free") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", today.toISOString());

    if ((count ?? 0) >= FREE_TIER_DAILY_SESSION_LIMIT) {
      return json(corsHeaders, 403, {
        error: "Daily session limit reached",
        code: "FREE_TIER_SESSION_LIMIT",
        message:
          `Free plan allows ${FREE_TIER_DAILY_SESSION_LIMIT} sessions per day (5 min each). Upgrade to Pro for longer sessions.`,
        upgrade_url: "/pricing",
      });
    }

    if ((profile?.credits ?? 0) <= 0) {
      return json(corsHeaders, 403, {
        error: "No credits remaining",
        code: "NO_CREDITS",
        message:
          "You have no credits remaining. Upgrade to Pro for 1,400 credits/month.",
        upgrade_url: "/pricing",
      });
    }
  }

  const sessionType = toDbSessionType(toSessionType(body));
  const isPractice = body.is_practice || sessionType !== "live";
  const sessionTags = buildSessionTags({ sessionType, isPractice });
  const company = sanitizeShortText(body.company);
  const role = sanitizeShortText(body.role);
  const durationMinutes = capDurationMinutes(
    profile?.plan_id ?? "free",
    body.duration_minutes,
  );
  const questionCount = body.question_count;

  const nowIso = new Date().toISOString();
  const sinceIso = new Date(
    Date.now() - SESSION_LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString();

  const config = buildConfig({
    body,
    sessionType,
    durationMinutes,
    questionCount,
    company,
    role,
  });

  try {
    await db
      .from("sessions")
      .update({
        status: "abandoned",
        ended_at: nowIso,
      })
      .eq("user_id", user.id)
      .eq("type", sessionType)
      .in("status", ["pending", "active"])
      .lt("created_at", sinceIso);

    const { data: existingData, error: lookupError } = await db
      .from("sessions")
      .select("id, created_at, status")
      .eq("user_id", user.id)
      .eq("type", sessionType)
      .in("status", ["pending", "active"])
      .gte("created_at", sinceIso)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("[start-session] Lookup error:", lookupError.message);

      return json(corsHeaders, 500, {
        error: "Could not start session.",
        code: "SESSION_LOOKUP_FAILED",
      });
    }

    const existing = existingData as ExistingSessionRow | null;

    if (existing?.id) {
      const activePatch =
        existing.status === "active"
          ? {
              status: "active",
            }
          : {
              status: "active",
              started_at: nowIso,
            };

      const { error: activationError } = await db
        .from("sessions")
        .update(activePatch)
        .eq("id", existing.id)
        .eq("user_id", user.id);

      if (activationError) {
        console.error(
          "[start-session] Reuse activation error:",
          activationError.message
        );

        return json(corsHeaders, 500, {
          error: "Could not start session.",
          code: "SESSION_ACTIVATION_FAILED",
        });
      }

      await logAuditEventFromRequest({
        req,
        userId: user.id,
        action: "SESSION_START",
        resourceType: "session",
        resourceId: existing.id,
        status: "success",
        metadata: {
          reused: true,
          sessionType,
          interviewType: config.interview_type,
          questionCount,
          durationMinutes,
        },
      });

      return json(corsHeaders, 200, {
        session_id: existing.id,
        config,
        started_at: nowIso,
        reused: true,
      });
    }

    const { data: createdData, error: insertError } = await db
      .from("sessions")
      .insert({
        user_id: user.id,
        type: sessionType,
        status: "active",
        model_used: toDbModelEnum(config.model as string),
        title: buildSessionTitle({
          sessionType,
          company,
        }),
        document_id: body.resume_id ?? null,
        jd_id: body.jd_id ?? null,
        started_at: nowIso,
        ended_at: null,
        updated_at: nowIso,
        tags: sessionTags.length > 0 ? sessionTags : null,
      })
      .select("id")
      .single();

    if (insertError || !createdData) {
      console.error(
        "[start-session] Insert error:",
        insertError?.message,
        insertError?.code,
        insertError?.details,
      );

      return json(corsHeaders, 500, {
        error: "Could not create session.",
        code: "SESSION_CREATE_FAILED",
      });
    }

    const created = createdData as CreatedSessionRow;

    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "SESSION_START",
      resourceType: "session",
      resourceId: created.id,
      status: "success",
      metadata: {
        reused: false,
        sessionType,
        interviewType: config.interview_type,
        questionCount,
        durationMinutes,
      },
    });

    return json(corsHeaders, 200, {
      session_id: created.id,
      config,
      started_at: nowIso,
      reused: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected start-session error.";

    console.error("[start-session] Unhandled error:", message);

    await logAuditEventFromRequest({
      req,
      userId: user.id,
      action: "SESSION_START",
      resourceType: "session",
      resourceId: null,
      status: "failure",
      metadata: {
        reason: message,
        sessionType,
      },
    });

    return json(corsHeaders, 500, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
    });
  }
});
//
// Production hardening included:
// - CORS handling
// - POST-only method enforcement
// - centralized JWT authentication
