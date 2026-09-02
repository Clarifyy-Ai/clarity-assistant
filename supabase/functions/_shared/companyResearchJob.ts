/**
 * Durable company-brief jobs: enqueue, claim, complete, cancel, two-phase credits.
 * Generation itself stays in company-research/index.ts (hybrid MATRIX path).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isUniqueViolation } from "./postgresErrors.ts";
import { refundCreditsBestEffort } from "./supabase.ts";

export const COMPANY_BRIEF_JOB_STALE_MS = 180_000;
export const COMPANY_BRIEF_AI_TIMEOUT_MS = 90_000;

export type CompanyBriefJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type CompanyBriefJobRow = {
  id: string;
  user_id: string;
  company_name: string;
  company_name_normalized: string;
  role_title: string | null;
  force: boolean;
  status: CompanyBriefJobStatus;
  progress_stage: string | null;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  idempotency_key: string;
  credit_reservation: string | null;
  credits_reserved: number;
  credits_finalized_at: string | null;
  credits_released_at: string | null;
  research_id: string | null;
  brief: Record<string, unknown> | null;
  source: string | null;
  attempt_count: number;
  cancel_requested_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CompanyBriefJobClient = {
  jobId: string;
  status: CompanyBriefJobStatus;
  progressStage: string | null;
  async: boolean;
  accepted?: boolean;
  persisted: boolean;
  cached?: boolean;
  id?: string;
  researchId?: string | null;
  brief?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  source?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  creditsReleased?: boolean;
};

const TERMINAL = new Set<CompanyBriefJobStatus>(["completed", "failed", "cancelled"]);

export function isTerminalCompanyBriefStatus(
  status: string | null | undefined,
): boolean {
  return TERMINAL.has(String(status ?? "") as CompanyBriefJobStatus);
}

export function scheduleWaitUntil(task: Promise<unknown>): boolean {
  try {
    const er = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(
        task.catch((err) => {
          console.error("[company-research] background:", err);
        }),
      );
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function toCompanyBriefJobClient(
  row: CompanyBriefJobRow,
  extras?: { cached?: boolean },
): CompanyBriefJobClient {
  const completed = row.status === "completed" && row.brief && typeof row.brief === "object";
  return {
    jobId: row.id,
    status: row.status,
    progressStage: row.progress_stage,
    async: !completed,
    accepted: row.status === "queued" || row.status === "processing",
    persisted: Boolean(completed && row.research_id),
    cached: extras?.cached === true,
    id: row.research_id ?? undefined,
    researchId: row.research_id,
    brief: completed ? row.brief : null,
    data: completed ? row.brief : null,
    source: row.source,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryable: row.retryable,
    creditsReleased: Boolean(row.credits_released_at),
  };
}

export async function loadCompanyBriefJob(
  admin: SupabaseClient,
  jobId: string,
  userId?: string,
): Promise<CompanyBriefJobRow | null> {
  let q = admin.from("company_research_jobs").select("*").eq("id", jobId);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q.maybeSingle();
  return (data as CompanyBriefJobRow | null) ?? null;
}

export async function loadCompanyBriefJobByIdempotency(
  admin: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<CompanyBriefJobRow | null> {
  const { data } = await admin
    .from("company_research_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return (data as CompanyBriefJobRow | null) ?? null;
}

export async function loadInFlightCompanyBriefJob(
  admin: SupabaseClient,
  userId: string,
  normalized: string,
): Promise<CompanyBriefJobRow | null> {
  const { data } = await admin
    .from("company_research_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("company_name_normalized", normalized)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CompanyBriefJobRow | null) ?? null;
}

export async function insertCompanyBriefJob(
  admin: SupabaseClient,
  input: {
    userId: string;
    company: string;
    normalized: string;
    role: string;
    force: boolean;
    idempotencyKey: string;
  },
): Promise<{ row: CompanyBriefJobRow | null; replay: boolean }> {
  const existing = await loadCompanyBriefJobByIdempotency(
    admin,
    input.userId,
    input.idempotencyKey,
  );
  if (existing) return { row: existing, replay: true };

  const inflight = await loadInFlightCompanyBriefJob(
    admin,
    input.userId,
    input.normalized,
  );
  if (inflight) return { row: inflight, replay: true };

  const { data, error } = await admin
    .from("company_research_jobs")
    .insert({
      user_id: input.userId,
      company_name: input.company,
      company_name_normalized: input.normalized,
      role_title: input.role || null,
      force: input.force,
      status: "queued",
      progress_stage: "queued",
      idempotency_key: input.idempotencyKey,
      retryable: true,
    })
    .select("*")
    .maybeSingle();

  if (data) return { row: data as CompanyBriefJobRow, replay: false };

  if (isUniqueViolation(error)) {
    const replayed =
      (await loadCompanyBriefJobByIdempotency(admin, input.userId, input.idempotencyKey)) ??
      (await loadInFlightCompanyBriefJob(admin, input.userId, input.normalized));
    if (replayed) return { row: replayed, replay: true };
  }

  console.error("[company-research] job insert failed", error?.message);
  return { row: null, replay: false };
}

export async function patchCompanyBriefJob(
  admin: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("company_research_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function claimCompanyBriefJob(
  admin: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<CompanyBriefJobRow | null> {
  const current = await loadCompanyBriefJob(admin, jobId, userId);
  if (!current) return null;
  if (current.cancel_requested_at) return current;
  if (current.status === "processing") return current;
  if (current.status !== "queued") return current;

  const now = new Date().toISOString();
  const { data } = await admin
    .from("company_research_jobs")
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

  if (data) return data as CompanyBriefJobRow;
  return loadCompanyBriefJob(admin, jobId, userId);
}

export function isStaleCompanyBriefJob(row: CompanyBriefJobRow, now = Date.now()): boolean {
  if (row.status !== "queued" && row.status !== "processing") return false;
  const updated = Date.parse(row.updated_at || row.created_at);
  if (!Number.isFinite(updated)) return false;
  return now - updated > COMPANY_BRIEF_JOB_STALE_MS;
}

export async function reserveCompanyBriefCredits(
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
  const { data, error } = await admin.rpc("reserve_company_research_credits", {
    p_job_id: jobId,
    p_user_id: userId,
    p_cost: cost,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.warn("[company-research] reserve:", error.message);
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

export async function finalizeCompanyBriefCredits(
  admin: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await admin.rpc("finalize_company_research_credits", { p_job_id: jobId });
  if (error) {
    console.warn("[company-research] finalize credits:", error.message);
  }
}

export async function releaseCompanyBriefCredits(
  admin: SupabaseClient,
  job: Pick<CompanyBriefJobRow, "id" | "user_id" | "credits_reserved" | "credits_released_at" | "credits_finalized_at">,
  reason: string,
): Promise<number> {
  if (job.credits_finalized_at || job.credits_released_at) return 0;
  const { data, error } = await admin.rpc("release_company_research_credits", {
    p_job_id: job.id,
    p_reason: reason,
  });
  if (!error && data && typeof data === "object") {
    const rec = data as { success?: boolean; released?: number; already_released?: boolean };
    if (rec.success !== false) return Math.max(0, Number(rec.released) || 0);
  }

  const amount = Math.max(0, Number(job.credits_reserved) || 0);
  if (amount <= 0) {
    await patchCompanyBriefJob(admin, job.id, { credits_released_at: new Date().toISOString() });
    return 0;
  }
  const { data: claimed } = await admin
    .from("company_research_jobs")
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
      idempotencyKey: `company-research-refund:${job.id}`,
    },
    { job_id: job.id, reason },
  );
  return amount;
}

export async function failCompanyBriefJob(
  admin: SupabaseClient,
  job: CompanyBriefJobRow,
  input: { code: string; message: string; retryable?: boolean },
): Promise<CompanyBriefJobRow> {
  const now = new Date().toISOString();
  await releaseCompanyBriefCredits(admin, job, `refund_company_research:${job.id}:${input.code}`);
  await patchCompanyBriefJob(admin, job.id, {
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

export async function completeCompanyBriefJob(
  admin: SupabaseClient,
  job: CompanyBriefJobRow,
  input: {
    researchId: string;
    brief: Record<string, unknown>;
    source: string;
  },
): Promise<CompanyBriefJobRow> {
  const now = new Date().toISOString();
  await patchCompanyBriefJob(admin, job.id, {
    status: "completed",
    progress_stage: "completed",
    research_id: input.researchId,
    brief: input.brief,
    source: input.source,
    error_code: null,
    error_message: null,
    retryable: false,
    completed_at: now,
  });
  await finalizeCompanyBriefCredits(admin, job.id);
  return {
    ...job,
    status: "completed",
    progress_stage: "completed",
    research_id: input.researchId,
    brief: input.brief,
    source: input.source,
    error_code: null,
    error_message: null,
    retryable: false,
    completed_at: now,
    credits_finalized_at: now,
  };
}

export async function cancelCompanyBriefJob(
  admin: SupabaseClient,
  job: CompanyBriefJobRow,
): Promise<CompanyBriefJobRow> {
  if (isTerminalCompanyBriefStatus(job.status)) return job;
  const now = new Date().toISOString();
  await patchCompanyBriefJob(admin, job.id, {
    cancel_requested_at: now,
    status: "cancelled",
    progress_stage: "cancelled",
    error_code: "CANCELLED",
    error_message: "Brief generation was cancelled. Credits were not charged.",
    retryable: true,
    completed_at: now,
  });
  await releaseCompanyBriefCredits(admin, job, `refund_company_research:${job.id}:cancelled`);
  return {
    ...job,
    status: "cancelled",
    progress_stage: "cancelled",
    error_code: "CANCELLED",
    error_message: "Brief generation was cancelled. Credits were not charged.",
    retryable: true,
    cancel_requested_at: now,
    completed_at: now,
    credits_released_at: now,
    credits_reserved: 0,
  };
}

export async function requeueFailedCompanyBriefJob(
  admin: SupabaseClient,
  job: CompanyBriefJobRow,
): Promise<CompanyBriefJobRow | null> {
  if (job.status !== "failed" && job.status !== "cancelled") return job;
  const now = new Date().toISOString();
  const { data } = await admin
    .from("company_research_jobs")
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
      brief: null,
      research_id: null,
      source: null,
      updated_at: now,
    })
    .eq("id", job.id)
    .in("status", ["failed", "cancelled"])
    .select("*")
    .maybeSingle();
  return (data as CompanyBriefJobRow | null) ?? null;
}

export function userFacingCompanyBriefError(code: string | null | undefined, fallback?: string): string {
  switch (String(code ?? "").toUpperCase()) {
    case "INSUFFICIENT_CREDITS":
      return fallback && /need|available/i.test(fallback)
        ? fallback
        : "Not enough credits to generate this brief.";
    case "AI_TIMEOUT":
    case "JOB_TIMEOUT":
      return "Brief generation timed out. Your credits were not charged. Please retry.";
    case "AI_PROVIDER_UNAVAILABLE":
    case "PROVIDER_UNAVAILABLE":
      return "Company research is temporarily unavailable. Your credits were not charged.";
    case "AI_INVALID_OUTPUT":
      return "The AI response could not be used. Your credits were not charged. Please retry.";
    case "DATABASE_FAILURE":
    case "DATABASE_UNAVAILABLE":
      return "Research was generated, but we couldn't save it. Please retry.";
    case "CANCELLED":
      return "Brief generation was cancelled. Credits were not charged.";
    case "CAPABILITY_REQUIRED":
      return "Company research requires a Pro plan or higher.";
    default:
      return fallback || "Failed to generate brief. Please retry.";
  }
}
