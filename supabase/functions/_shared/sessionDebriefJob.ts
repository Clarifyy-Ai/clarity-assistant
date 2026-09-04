/**
 * Durable session debrief jobs: enqueue, claim, complete, cancel, two-phase credits.
 * Generation itself stays in generate-debrief/index.ts (hybrid MATRIX path).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isUniqueViolation } from "./postgresErrors.ts";
import { refundCreditsBestEffort } from "./supabase.ts";

export const SESSION_DEBRIEF_JOB_STALE_MS = 180_000;
export const SESSION_DEBRIEF_AI_TIMEOUT_MS = 90_000;

export type SessionDebriefJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type SessionDebriefJobRow = {
  id: string;
  user_id: string;
  session_id: string;
  status: SessionDebriefJobStatus;
  progress_stage: string | null;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  idempotency_key: string;
  credit_reservation: string | null;
  credits_reserved: number;
  credits_finalized_at: string | null;
  credits_released_at: string | null;
  debrief_id: string | null;
  model: string | null;
  source: string | null;
  attempt_count: number;
  cancel_requested_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type SessionDebriefJobClient = {
  jobId: string;
  status: SessionDebriefJobStatus;
  progressStage: string | null;
  async: boolean;
  accepted?: boolean;
  persisted: boolean;
  cached?: boolean;
  id?: string;
  debriefId?: string | null;
  sessionId?: string | null;
  source?: string | null;
  model?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  creditsReleased?: boolean;
};

const TERMINAL = new Set<SessionDebriefJobStatus>(["completed", "failed", "cancelled"]);

export function isTerminalSessionDebriefStatus(
  status: string | null | undefined,
): boolean {
  return TERMINAL.has(String(status ?? "") as SessionDebriefJobStatus);
}

export const isTerminal = isTerminalSessionDebriefStatus;

export function scheduleWaitUntil(task: Promise<unknown>): boolean {
  try {
    const er = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(
        task.catch((err) => {
          console.error("[generate-debrief] background:", err);
        }),
      );
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function toSessionDebriefJobClient(
  row: SessionDebriefJobRow,
  extras?: { cached?: boolean },
): SessionDebriefJobClient {
  const completed = row.status === "completed" && Boolean(row.debrief_id);
  return {
    jobId: row.id,
    status: row.status,
    progressStage: row.progress_stage,
    async: !completed,
    accepted: row.status === "queued" || row.status === "processing",
    persisted: completed,
    cached: extras?.cached === true,
    id: row.debrief_id ?? undefined,
    debriefId: row.debrief_id,
    sessionId: row.session_id,
    source: row.source,
    model: row.model,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryable: row.retryable,
    creditsReleased: Boolean(row.credits_released_at),
  };
}

export const toClient = toSessionDebriefJobClient;

export async function loadSessionDebriefJob(
  admin: SupabaseClient,
  jobId: string,
  userId?: string,
): Promise<SessionDebriefJobRow | null> {
  let q = admin.from("session_debrief_jobs").select("*").eq("id", jobId);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q.maybeSingle();
  return (data as SessionDebriefJobRow | null) ?? null;
}

export const load = loadSessionDebriefJob;

export async function loadSessionDebriefJobByIdempotency(
  admin: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<SessionDebriefJobRow | null> {
  const { data } = await admin
    .from("session_debrief_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return (data as SessionDebriefJobRow | null) ?? null;
}

export async function loadInFlightSessionDebriefJob(
  admin: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<SessionDebriefJobRow | null> {
  const { data } = await admin
    .from("session_debrief_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SessionDebriefJobRow | null) ?? null;
}

export async function insertSessionDebriefJob(
  admin: SupabaseClient,
  input: {
    userId: string;
    sessionId: string;
    model?: string | null;
    idempotencyKey: string;
  },
): Promise<{ row: SessionDebriefJobRow | null; replay: boolean }> {
  const existing = await loadSessionDebriefJobByIdempotency(
    admin,
    input.userId,
    input.idempotencyKey,
  );
  if (existing) return { row: existing, replay: true };

  const inflight = await loadInFlightSessionDebriefJob(
    admin,
    input.userId,
    input.sessionId,
  );
  if (inflight) return { row: inflight, replay: true };

  const { data, error } = await admin
    .from("session_debrief_jobs")
    .insert({
      user_id: input.userId,
      session_id: input.sessionId,
      status: "queued",
      progress_stage: "queued",
      idempotency_key: input.idempotencyKey,
      retryable: true,
      model: input.model || null,
    })
    .select("*")
    .maybeSingle();

  if (data) return { row: data as SessionDebriefJobRow, replay: false };

  if (isUniqueViolation(error)) {
    const replayed =
      (await loadSessionDebriefJobByIdempotency(admin, input.userId, input.idempotencyKey)) ??
      (await loadInFlightSessionDebriefJob(admin, input.userId, input.sessionId));
    if (replayed) return { row: replayed, replay: true };
  }

  console.error("[generate-debrief] job insert failed", error?.message);
  return { row: null, replay: false };
}

export const insert = insertSessionDebriefJob;

export async function patchSessionDebriefJob(
  admin: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("session_debrief_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

export const patch = patchSessionDebriefJob;

export async function claimSessionDebriefJob(
  admin: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<SessionDebriefJobRow | null> {
  const current = await loadSessionDebriefJob(admin, jobId, userId);
  if (!current) return null;
  if (current.cancel_requested_at) return current;
  if (current.status === "processing") return current;
  if (current.status !== "queued") return current;

  const now = new Date().toISOString();
  const { data } = await admin
    .from("session_debrief_jobs")
    .update({
      status: "processing",
      progress_stage: "generating",
      attempt_count: Number(current.attempt_count ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .eq("status", "queued")
    .is("cancel_requested_at", null)
    .select("*")
    .maybeSingle();

  if (data) return data as SessionDebriefJobRow;
  return loadSessionDebriefJob(admin, jobId, userId);
}

export const claim = claimSessionDebriefJob;

export function isStaleSessionDebriefJob(row: SessionDebriefJobRow, now = Date.now()): boolean {
  if (row.status !== "queued" && row.status !== "processing") return false;
  const updated = Date.parse(row.updated_at || row.created_at);
  if (!Number.isFinite(updated)) return false;
  return now - updated > SESSION_DEBRIEF_JOB_STALE_MS;
}

export const isStale = isStaleSessionDebriefJob;

export async function reserveSessionDebriefCredits(
  admin: SupabaseClient,
  jobId: string,
  userId: string,
  cost: number,
  idempotencyKey: string,
): Promise<{
  success: boolean;
  alreadyReserved?: boolean;
  alreadyFinalized?: boolean;
  reserved?: number;
  balanceAfter?: number;
  denial?: Record<string, unknown>;
}> {
  const { data, error } = await admin.rpc("reserve_session_debrief_credits", {
    p_job_id: jobId,
    p_user_id: userId,
    p_cost: cost,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.warn("[generate-debrief] reserve:", error.message);
    return { success: false, denial: { code: "CREDIT_RESERVE_FAILED", error: error.message } };
  }
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (rec.success === false) return { success: false, denial: rec };
  return {
    success: true,
    alreadyReserved: rec.already_reserved === true,
    alreadyFinalized: rec.already_finalized === true,
    reserved: Number(rec.reserved) || cost,
    balanceAfter: rec.balance_after != null ? Number(rec.balance_after) : undefined,
  };
}

export const reserve = reserveSessionDebriefCredits;

export async function finalizeSessionDebriefCredits(
  admin: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await admin.rpc("finalize_session_debrief_credits", { p_job_id: jobId });
  if (error) {
    console.warn("[generate-debrief] finalize credits:", error.message);
  }
}

export const finalize = finalizeSessionDebriefCredits;

export async function releaseSessionDebriefCredits(
  admin: SupabaseClient,
  job: Pick<SessionDebriefJobRow, "id" | "user_id" | "credits_reserved" | "credits_released_at" | "credits_finalized_at">,
  reason: string,
): Promise<number> {
  if (job.credits_finalized_at || job.credits_released_at) return 0;
  const { data, error } = await admin.rpc("release_session_debrief_credits", {
    p_job_id: job.id,
    p_reason: reason,
  });
  if (!error && data && typeof data === "object") {
    const rec = data as { success?: boolean; released?: number; already_released?: boolean };
    if (rec.success !== false) return Math.max(0, Number(rec.released) || 0);
  }

  const amount = Math.max(0, Number(job.credits_reserved) || 0);
  if (amount <= 0) {
    await patchSessionDebriefJob(admin, job.id, { credits_released_at: new Date().toISOString() });
    return 0;
  }
  const { data: claimed } = await admin
    .from("session_debrief_jobs")
    .update({
      credits_reserved: 0,
      credits_released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .is("credits_released_at", null)
    .is("credits_finalized_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed?.id) return 0;
  await refundCreditsBestEffort(
    {
      userId: job.user_id,
      cost: amount,
      reason,
      idempotencyKey: `session-debrief-refund:${job.id}`,
    },
    { job_id: job.id, reason },
  );
  return amount;
}

export const release = releaseSessionDebriefCredits;

export async function failSessionDebriefJob(
  admin: SupabaseClient,
  job: SessionDebriefJobRow,
  input: { code: string; message: string; retryable?: boolean },
): Promise<SessionDebriefJobRow> {
  const now = new Date().toISOString();
  await releaseSessionDebriefCredits(admin, job, `refund_session_debrief:${job.id}:${input.code}`);
  await patchSessionDebriefJob(admin, job.id, {
    status: "failed",
    progress_stage: "failed",
    error_code: input.code,
    error_message: input.message,
    retryable: input.retryable !== false,
    completed_at: now,
  });
  return {
    ...job,
    status: "failed",
    progress_stage: "failed",
    error_code: input.code,
    error_message: input.message,
    retryable: input.retryable !== false,
    completed_at: now,
    credits_released_at: now,
    credits_reserved: 0,
  };
}

export const fail = failSessionDebriefJob;

export async function completeSessionDebriefJob(
  admin: SupabaseClient,
  job: SessionDebriefJobRow,
  input: {
    debriefId: string;
    source: string;
  },
): Promise<SessionDebriefJobRow> {
  const now = new Date().toISOString();
  await patchSessionDebriefJob(admin, job.id, {
    status: "completed",
    progress_stage: "completed",
    debrief_id: input.debriefId,
    source: input.source,
    error_code: null,
    error_message: null,
    retryable: false,
    completed_at: now,
  });
  await finalizeSessionDebriefCredits(admin, job.id);
  return {
    ...job,
    status: "completed",
    progress_stage: "completed",
    debrief_id: input.debriefId,
    source: input.source,
    error_code: null,
    error_message: null,
    retryable: false,
    completed_at: now,
    credits_finalized_at: now,
  };
}

export const complete = completeSessionDebriefJob;

export async function cancelSessionDebriefJob(
  admin: SupabaseClient,
  job: SessionDebriefJobRow,
): Promise<SessionDebriefJobRow> {
  if (isTerminalSessionDebriefStatus(job.status)) return job;
  const now = new Date().toISOString();
  await patchSessionDebriefJob(admin, job.id, {
    cancel_requested_at: now,
    status: "cancelled",
    progress_stage: "cancelled",
    error_code: "CANCELLED",
    error_message: "Debrief generation was cancelled. Credits were not charged.",
    retryable: true,
    completed_at: now,
  });
  await releaseSessionDebriefCredits(admin, job, `refund_session_debrief:${job.id}:cancelled`);
  return {
    ...job,
    status: "cancelled",
    progress_stage: "cancelled",
    error_code: "CANCELLED",
    error_message: "Debrief generation was cancelled. Credits were not charged.",
    retryable: true,
    cancel_requested_at: now,
    completed_at: now,
    credits_released_at: now,
    credits_reserved: 0,
  };
}

export const cancel = cancelSessionDebriefJob;

export async function requeueFailedSessionDebriefJob(
  admin: SupabaseClient,
  job: SessionDebriefJobRow,
): Promise<SessionDebriefJobRow | null> {
  if (job.status !== "failed" && job.status !== "cancelled") return job;
  const now = new Date().toISOString();
  const { data } = await admin
    .from("session_debrief_jobs")
    .update({
      status: "queued",
      progress_stage: "queued",
      error_code: null,
      error_message: null,
      retryable: true,
      credits_released_at: null,
      credits_finalized_at: null,
      credits_reserved: 0,
      cancel_requested_at: null,
      completed_at: null,
      debrief_id: null,
      source: null,
      updated_at: now,
    })
    .eq("id", job.id)
    .in("status", ["failed", "cancelled"])
    .select("*")
    .maybeSingle();
  return (data as SessionDebriefJobRow | null) ?? null;
}

export const requeue = requeueFailedSessionDebriefJob;

export function userFacingSessionDebriefError(code: string | null | undefined, fallback?: string): string {
  switch (String(code ?? "").toUpperCase()) {
    case "INSUFFICIENT_CREDITS":
      return fallback && /need|available/i.test(fallback)
        ? fallback
        : "Not enough credits to generate this debrief.";
    case "AI_TIMEOUT":
    case "JOB_TIMEOUT":
      return "Debrief generation timed out. Your credits were not charged. Please retry.";
    case "AI_PROVIDER_UNAVAILABLE":
    case "PROVIDER_UNAVAILABLE":
      return "Debrief generation is temporarily unavailable. Your credits were not charged.";
    case "AI_INVALID_OUTPUT":
      return "The AI response could not be used. Your credits were not charged. Please retry.";
    case "DATABASE_FAILURE":
    case "DATABASE_UNAVAILABLE":
      return "Debrief was generated, but we couldn't save it. Please retry.";
    case "NOT_SCORED":
    case "NOT_ELIGIBLE_NO_ANSWERS":
      return "No answers or transcript were recorded for this session, so a debrief cannot be generated.";
    case "NOT_ELIGIBLE_NO_QUESTIONS":
      return "No questions were recorded for this session, so a debrief cannot be generated.";
    case "SESSION_INCOMPLETE":
      return "This session is not complete yet, so a debrief cannot be generated.";
    case "DEBRIEF_AI_REQUIRED":
      return "Debrief generation requires AI evaluation. Your credits were not charged. Please retry.";
    case "CANCELLED":
      return "Debrief generation was cancelled. Credits were not charged.";
    case "DEBRIEF_ALREADY_PROCESSING":
    case "DUPLICATE_REQUEST":
      return "A debrief is already being generated for this session.";
    case "CAPABILITY_REQUIRED":
      return "Debrief generation is not available for your account right now. Check your credits or try again later.";
    default:
      return fallback || "Failed to generate debrief. Please retry.";
  }
}
