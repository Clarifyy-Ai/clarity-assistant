/**
 * Lease / claim helpers for durable gov_paper_generation_jobs processing.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { refundCredits } from "./supabase.ts";

export const PAPER_JOB_LEASE_MS = 90_000;
export const PAPER_JOB_MAX_ATTEMPTS = 3;

export const PAPER_JOB_TERMINAL = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

export const PAPER_JOB_IN_FLIGHT = new Set([
  "queued",
  "retrieving_sources",
  "analyzing_pattern",
  "planning_blueprint",
  "selecting_questions",
  "generating_questions",
  "validating_questions",
  "checking_similarity",
  "assembling",
]);

export type ServiceDb = SupabaseClient;

export function newWorkerId(prefix = "worker"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

export function leaseExpiryIso(fromMs = Date.now(), leaseMs = PAPER_JOB_LEASE_MS): string {
  return new Date(fromMs + leaseMs).toISOString();
}

/** Idempotent status patch — never overwrites terminal rows. */
export async function setJobIfActive(
  db: ServiceDb,
  jobId: string,
  patch: Record<string, unknown>,
  opts?: { workerId?: string },
): Promise<boolean> {
  let q = db
    .from("gov_paper_generation_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .filter("status", "not.in", `(${[...PAPER_JOB_TERMINAL].join(",")})`);

  if (opts?.workerId) {
    q = q.eq("worker_id", opts.workerId);
  }

  const { data, error } = await q.select("id").maybeSingle();
  if (error) {
    console.error("[govPaperJobLease] setJobIfActive:", error.message);
    return false;
  }
  return Boolean(data?.id);
}

export async function heartbeatJobLease(
  db: ServiceDb,
  jobId: string,
  workerId: string,
  leaseMs = PAPER_JOB_LEASE_MS,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("gov_paper_generation_jobs")
    .update({
      heartbeat_at: now,
      lease_expires_at: leaseExpiryIso(Date.now(), leaseMs),
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .filter("status", "not.in", `(${[...PAPER_JOB_TERMINAL].join(",")})`)
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[govPaperJobLease] heartbeat:", error.message);
    return false;
  }
  return Boolean(data?.id);
}

export async function isJobCancelled(db: ServiceDb, jobId: string): Promise<boolean> {
  const { data } = await db
    .from("gov_paper_generation_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  return data?.status === "cancelled" || data?.status === "expired";
}

export type ClaimResult =
  | { ok: true; job: Record<string, unknown>; workerId: string; attemptCount: number }
  | { ok: false; reason: "not_found" | "not_claimable" | "max_attempts" | "error"; message?: string };

/**
 * Atomically claim a queued (or lease-expired in-flight) job.
 * Pass jobId to target a specific row; omit to claim the oldest claimable job.
 */
export async function claimPaperGenerationJob(
  db: ServiceDb,
  opts: {
    jobId?: string;
    workerId?: string;
    userId?: string;
    leaseMs?: number;
    maxAttempts?: number;
  } = {},
): Promise<ClaimResult> {
  const workerId = opts.workerId ?? newWorkerId("paper");
  const leaseMs = opts.leaseMs ?? PAPER_JOB_LEASE_MS;
  const maxAttempts = opts.maxAttempts ?? PAPER_JOB_MAX_ATTEMPTS;
  const nowIso = new Date().toISOString();

  // Auto-claim: in-flight only. Explicit jobId also allows retryable failed rows.
  const claimableStatuses = opts.jobId
    ? [...PAPER_JOB_IN_FLIGHT, "failed"]
    : [...PAPER_JOB_IN_FLIGHT];

  let pick = db
    .from("gov_paper_generation_jobs")
    .select(
      "id, user_id, exam_id, stage_id, pattern_version_id, syllabus_version_id, mode, language, request_json, status, progress_stage, attempt_count, retryable, credits_charged, random_seed, mock_test_id, generated_paper_id, lease_expires_at, worker_id, started_at",
    )
    .in("status", claimableStatuses)
    .eq("retryable", true)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(1);

  if (opts.jobId) pick = pick.eq("id", opts.jobId);
  if (opts.userId) pick = pick.eq("user_id", opts.userId);

  const { data: candidates, error: pickErr } = await pick;
  if (pickErr) {
    return { ok: false, reason: "error", message: pickErr.message };
  }
  const candidate = Array.isArray(candidates) ? candidates[0] : candidates;
  if (!candidate?.id) {
    return { ok: false, reason: opts.jobId ? "not_found" : "not_claimable" };
  }

  const priorAttempts = Number(candidate.attempt_count) || 0;
  if (priorAttempts >= maxAttempts) {
    const creditsCharged = Math.max(0, Number(candidate.credits_charged) || 0);
    await db
      .from("gov_paper_generation_jobs")
      .update({
        status: "failed",
        progress_stage: "failed",
        retryable: false,
        error_code: "MAX_ATTEMPTS",
        error_message: `Exceeded max attempts (${maxAttempts})`,
        completed_at: nowIso,
        updated_at: nowIso,
        lease_expires_at: null,
        worker_id: null,
        credits_charged: 0,
      })
      .eq("id", candidate.id)
      .filter("status", "not.in", "(completed,cancelled,expired)");
    if (creditsCharged > 0 && candidate.user_id) {
      await refundCredits({
        userId: String(candidate.user_id),
        cost: creditsCharged,
        reason: "refund_paper_gen_max_attempts",
      }).catch(() => {});
    }
    return { ok: false, reason: "max_attempts" };
  }

  const nextAttempt = priorAttempts + 1;
  const leaseUntil = leaseExpiryIso(Date.now(), leaseMs);
  const resumeStatus =
    candidate.status === "queued" || candidate.status === "failed"
      ? "analyzing_pattern"
      : String(candidate.status);

  // Optimistic claim: only if still claimable (same lease window / still non-terminal).
  const { data: claimed, error: claimErr } = await db
    .from("gov_paper_generation_jobs")
    .update({
      worker_id: workerId,
      lease_expires_at: leaseUntil,
      heartbeat_at: nowIso,
      attempt_count: nextAttempt,
      status: resumeStatus,
      progress_stage: resumeStatus,
      started_at: candidate.started_at ?? nowIso,
      updated_at: nowIso,
      completed_at: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", candidate.id)
    .eq("retryable", true)
    .in("status", claimableStatuses)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .select(
      "id, user_id, exam_id, stage_id, pattern_version_id, syllabus_version_id, mode, language, request_json, status, attempt_count, retryable, credits_charged, random_seed, mock_test_id, generated_paper_id, blueprint_json",
    )
    .maybeSingle();
  if (claimErr) {
    return { ok: false, reason: "error", message: claimErr.message };
  }
  if (!claimed?.id) {
    return { ok: false, reason: "not_claimable" };
  }

  return {
    ok: true,
    job: claimed as Record<string, unknown>,
    workerId,
    attemptCount: nextAttempt,
  };
}

/** Clear lease fields on terminal cancel / complete. */
export async function clearJobLease(
  db: ServiceDb,
  jobId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db
    .from("gov_paper_generation_jobs")
    .update({
      ...extra,
      worker_id: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}
