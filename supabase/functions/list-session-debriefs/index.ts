/**
 * list-session-debriefs — typed Debrief list access + eligibility + jobs.
 * Prefer this over client-only PostgREST when deployed; client falls back if unreachable.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, resolveUserPlanId } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import {
  hasCapability,
  requireCapabilityForFunction,
} from "../_shared/requireCapability.ts";
import { DEBRIEF_SESSION_DB_TYPES } from "../_shared/debriefSessionTypes.ts";

const INTERVIEW_TYPES = new Set<string>([...DEBRIEF_SESSION_DB_TYPES, "practice"]);

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function isEligible(session: {
  status?: string | null;
  type?: string | null;
  questions_asked?: number | null;
  overall_score?: number | null;
  hasAnswers?: boolean;
  hasTranscript?: boolean;
}): boolean {
  if (session.status != null && session.status !== "completed") return false;
  if (session.type != null && !INTERVIEW_TYPES.has(session.type)) return false;
  const asked = session.questions_asked ?? 0;
  return (
    asked > 0 ||
    session.overall_score != null ||
    Boolean(session.hasAnswers) ||
    Boolean(session.hasTranscript)
  );
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST" && req.method !== "GET") {
    return json(req, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const db = createServiceClient();
  const correlationId = crypto.randomUUID();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("list-session-debriefs", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const planId = await resolveUserPlanId(user.id);
    const capabilityGate = await requireCapabilityForFunction(
      planId,
      "generate-debrief",
      req,
    );
    if (capabilityGate) {
      const canView = hasCapability(planId, "detailed_debrief");
      if (!canView) {
        return json(req, {
          correlationId,
          access: {
            canViewDebrief: false,
            canGenerateDebrief: false,
            canRetryDebrief: false,
            plan: planId,
            reasonCode: "FEATURE_NOT_AVAILABLE_FOR_PLAN",
          },
          sessionEligibility: {
            totalCompletedSessions: 0,
            eligibleSessions: 0,
            ineligibleSessions: 0,
          },
          debriefs: [],
          processingJobs: [],
          failedJobs: [],
          pendingEligible: [],
          nextCursor: null,
        });
      }
      // Kill-switch / transient capability issues — still allow viewing saved debriefs.
    }

    const canGenerate = hasCapability(planId, "detailed_debrief");

    const [
      { data: debriefRows, error: debriefErr },
      { data: sessionRows, error: sessionErr },
      { data: jobRows, error: jobErr },
      { data: failedJobRows, error: failedJobErr },
    ] = await Promise.all([
      db
        .from("session_debriefs")
        .select("id, created_at, overall_grade, priority_focus, session_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("sessions")
        .select("id, type, title, overall_score, created_at, questions_asked, status")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .in("type", [...DEBRIEF_SESSION_DB_TYPES])
        .order("created_at", { ascending: false })
        .limit(150),
      db
        .from("session_debrief_jobs")
        .select("id, session_id, status, progress_stage, created_at, updated_at")
        .eq("user_id", user.id)
        .in("status", ["queued", "processing"])
        .order("updated_at", { ascending: false })
        .limit(50),
      db
        .from("session_debrief_jobs")
        .select("id, session_id, status, error_code, error_message, retryable, updated_at")
        .eq("user_id", user.id)
        .eq("status", "failed")
        .eq("retryable", true)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    if (debriefErr || sessionErr) {
      return json(
        req,
        {
          correlationId,
          error: "TEMPORARY_BACKEND_FAILURE",
          code: "TEMPORARY_BACKEND_FAILURE",
          message: "We couldn’t load your Debriefs",
          access: {
            canViewDebrief: true,
            canGenerateDebrief: canGenerate,
            canRetryDebrief: canGenerate,
            plan: planId,
            reasonCode: "TEMPORARY_BACKEND_FAILURE",
          },
        },
        503,
      );
    }

    const sessions = sessionRows ?? [];
    const ids = sessions.map((s) => s.id as string);
    let answerIds = new Set<string>();
    let transcriptIds = new Set<string>();
    if (ids.length > 0) {
      const [{ data: answers }, { data: transcripts }] = await Promise.all([
        db.from("session_answers").select("session_id").in("session_id", ids),
        db.from("session_transcripts").select("session_id").in("session_id", ids),
      ]);
      answerIds = new Set(
        (answers ?? []).map((r) => r.session_id as string).filter(Boolean),
      );
      transcriptIds = new Set(
        (transcripts ?? []).map((r) => r.session_id as string).filter(Boolean),
      );
    }

    const annotated = sessions.map((s) => ({
      id: s.id as string,
      type: (s.type as string | null) ?? null,
      title: (s.title as string | null) ?? null,
      overall_score: (s.overall_score as number | null) ?? null,
      created_at: s.created_at as string,
      questions_asked: (s.questions_asked as number | null) ?? null,
      status: (s.status as string | null) ?? null,
      hasAnswers: answerIds.has(s.id as string),
      hasTranscript: transcriptIds.has(s.id as string),
    }));

    const eligible = annotated.filter(isEligible);
    const covered = new Set(
      (debriefRows ?? [])
        .map((d) => d.session_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );
    const processingJobs = (jobErr ? [] : jobRows ?? [])
      .filter((j) => j.status === "queued" || j.status === "processing")
      .map((j) => ({
        jobId: j.id as string,
        sessionId: j.session_id as string,
        status: j.status as "queued" | "processing",
        updatedAt: (j.updated_at ?? j.created_at) as string,
        createdAt: (j.created_at as string | null) ?? null,
        progressStage: (j.progress_stage as string | null) ?? null,
      }));
    const processingSessionIds = new Set(processingJobs.map((j) => j.sessionId));
    const failedJobs = (failedJobErr ? [] : failedJobRows ?? [])
      .filter((j) => j.status === "failed" && j.retryable === true)
      .map((j) => ({
        jobId: j.id as string,
        sessionId: j.session_id as string,
        updatedAt: (j.updated_at as string) ?? new Date(0).toISOString(),
        errorCode: (j.error_code as string | null) ?? null,
        errorMessage: (j.error_message as string | null) ?? null,
      }))
      .filter((j) => Boolean(j.sessionId) && !processingSessionIds.has(j.sessionId));
    const failedSessionIds = new Set(failedJobs.map((j) => j.sessionId));
    const pendingEligible = eligible
      .filter(
        (s) =>
          !covered.has(s.id) &&
          !processingSessionIds.has(s.id) &&
          !failedSessionIds.has(s.id),
      )
      .slice(0, 50);

    return json(req, {
      correlationId,
      access: {
        canViewDebrief: true,
        canGenerateDebrief: canGenerate,
        canRetryDebrief: canGenerate,
        plan: planId,
        reasonCode: null,
      },
      sessionEligibility: {
        totalCompletedSessions: annotated.length,
        eligibleSessions: eligible.length,
        ineligibleSessions: Math.max(0, annotated.length - eligible.length),
      },
      debriefs: debriefRows ?? [],
      processingJobs,
      failedJobs,
      pendingEligible,
      nextCursor: null,
    });
  } catch (err) {
    console.error("[list-session-debriefs]", err);
    return json(
      req,
      {
        correlationId,
        error: "TEMPORARY_BACKEND_FAILURE",
        code: "TEMPORARY_BACKEND_FAILURE",
        message: "We couldn’t load your Debriefs",
      },
      500,
    );
  }
});
