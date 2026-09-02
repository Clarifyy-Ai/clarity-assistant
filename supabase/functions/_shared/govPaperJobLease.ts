/**
 * Lease / claim helpers for durable gov_paper_generation_jobs processing.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { refundClaimedPaperCredits } from "./claimJobCredits.ts";
import { isPythonPaperFactoryGenerator } from "./govGeneratorRouting.ts";

export const PAPER_JOB_LEASE_MS = 180_000;
export const PAPER_JOB_MAX_ATTEMPTS = 3;
/** Queued jobs with no worker claim past this age are failed (worker unavailable). */
export const PAPER_JOB_QUEUED_TTL_MS = 10 * 60 * 1000;
/** In-flight jobs past this runtime are terminalized (success path should finish sooner). */
export const PAPER_JOB_MAX_RUNTIME_MS = 20 * 60 * 1000;

export const PAPER_JOB_TERMINAL = new Set([
  "completed",
  "failed",
  "failed_permanent",
  "cancelled",
  "expired",
]);

/** Statuses that should never be auto-claimed as fresh work. */
export const PAPER_JOB_HARD_TERMINAL = new Set([
  ...PAPER_JOB_TERMINAL,
  "failed_retryable",
]);

export const PAPER_JOB_IN_FLIGHT = new Set([
  "queued",
  "leased",
  "checking_availability",
  "selecting",
  "generating",
  "validating",
  "assembling",
  "retrieving_sources",
  "analyzing_pattern",
  "planning_blueprint",
  "building_blueprint",
  "selecting_questions",
  "generating_questions",
  "generating_missing_slots",
  "validating_questions",
  "checking_similarity",
  "validating_paper",
  "blueprint",
  "select",
  "optional_ai_fill",
  "assemble",
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
    .filter("status", "not.in", `(${[...PAPER_JOB_HARD_TERMINAL].join(",")})`);

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
    .filter("status", "not.in", `(${[...PAPER_JOB_HARD_TERMINAL].join(",")})`)
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

  // Auto-claim: in-flight + retryable failures (lease expired / requeued).
  // Explicit jobId also allows legacy "failed" rows.
  const claimableStatuses = opts.jobId
    ? [...PAPER_JOB_IN_FLIGHT, "failed", "failed_retryable"]
    : [...PAPER_JOB_IN_FLIGHT, "failed_retryable"];

  let pick = db
    .from("gov_paper_generation_jobs")
    .select(
      "id, user_id, exam_id, stage_id, pattern_version_id, syllabus_version_id, mode, language, request_json, status, progress_stage, attempt_count, retryable, credits_charged, random_seed, mock_test_id, generated_paper_id, lease_expires_at, worker_id, started_at",
    )
    .in("status", claimableStatuses)
    .eq("retryable", true)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(opts.jobId ? 1 : 20);

  if (opts.jobId) pick = pick.eq("id", opts.jobId);
  if (opts.userId) pick = pick.eq("user_id", opts.userId);

  const { data: candidates, error: pickErr } = await pick;
  if (pickErr) {
    return { ok: false, reason: "error", message: pickErr.message };
  }
  const rows = Array.isArray(candidates) ? candidates : candidates ? [candidates] : [];
  // Edge assembler must never claim jobs routed to the Python paper factory.
  const candidate = rows.find((row) => {
    const generator = String(
      (row.request_json as Record<string, unknown> | null)?.generator ?? "",
    );
    return !isPythonPaperFactoryGenerator(generator);
  });
  if (!candidate?.id) {
    if (opts.jobId && rows.length > 0) {
      const generator = String(
        (rows[0].request_json as Record<string, unknown> | null)?.generator ?? "",
      );
      if (isPythonPaperFactoryGenerator(generator)) {
        return { ok: false, reason: "not_claimable", message: "PYTHON_FACTORY_OWNED" };
      }
    }
    return { ok: false, reason: opts.jobId ? "not_found" : "not_claimable" };
  }

  const priorAttempts = Number(candidate.attempt_count) || 0;
  if (priorAttempts >= maxAttempts) {
    await db
      .from("gov_paper_generation_jobs")
      .update({
        status: "failed_permanent",
        progress_stage: "failed_permanent",
        retryable: false,
        error_code: "MAX_ATTEMPTS",
        error_message: `Exceeded max attempts (${maxAttempts})`,
        completed_at: nowIso,
        updated_at: nowIso,
        lease_expires_at: null,
        worker_id: null,
      })
      .eq("id", candidate.id)
      .filter("status", "not.in", "(completed,cancelled,expired,failed_permanent)");
    if (candidate.user_id) {
      await refundClaimedPaperCredits(
        db,
        String(candidate.id),
        String(candidate.user_id),
        "refund_paper_gen_max_attempts",
      );
    }
    return { ok: false, reason: "max_attempts" };
  }

  const nextAttempt = priorAttempts + 1;
  const leaseUntil = leaseExpiryIso(Date.now(), leaseMs);
  const resumeStatus =
    candidate.status === "queued" ||
    candidate.status === "failed" ||
    candidate.status === "failed_retryable"
      ? "leased"
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

/**
 * Release a job accidentally claimed by Edge back to the Python factory queue.
 * Restores attempt_count so split-brain claims do not burn retries.
 */
export async function releasePaperJobForPythonFactory(
  db: ServiceDb,
  jobId: string,
  workerId: string,
  priorAttemptCount: number,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("gov_paper_generation_jobs")
    .update({
      status: "queued",
      progress_stage: "queued",
      worker_id: null,
      lease_expires_at: null,
      attempt_count: Math.max(0, priorAttemptCount),
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .filter("status", "not.in", "(completed,cancelled,failed_permanent,expired)")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[govPaperJobLease] releasePythonFactory:", error.message);
    return false;
  }
  return Boolean(data?.id);
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

/**
 * Reclaim lease-expired in-flight jobs. Marks failed_permanent after max attempts;
 * otherwise clears the lease so a worker can claim again.
 */
export async function reclaimExpiredPaperJobs(
  db: ServiceDb,
  opts: { limit?: number; maxAttempts?: number } = {},
): Promise<{ reclaimed: number; permanentlyFailed: number }> {
  const limit = opts.limit ?? 20;
  const maxAttempts = opts.maxAttempts ?? PAPER_JOB_MAX_ATTEMPTS;
  const nowIso = new Date().toISOString();
  let reclaimed = 0;
  let permanentlyFailed = 0;

  const { data: rows, error } = await db
    .from("gov_paper_generation_jobs")
    .select("id, user_id, attempt_count, credits_charged, status")
    .in("status", [...PAPER_JOB_IN_FLIGHT])
    .lt("lease_expires_at", nowIso)
    .order("lease_expires_at", { ascending: true })
    .limit(limit);

  if (error || !rows?.length) {
    return { reclaimed: 0, permanentlyFailed: 0 };
  }

  for (const row of rows) {
    const attempts = Number(row.attempt_count) || 0;
    if (attempts >= maxAttempts) {
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "failed_permanent",
          progress_stage: "failed_permanent",
          retryable: false,
          error_code: "GENERATION_TIMEOUT",
          error_message: "Generation worker lease expired too many times.",
          completed_at: nowIso,
          updated_at: nowIso,
          worker_id: null,
          lease_expires_at: null,
        })
        .eq("id", row.id)
        .in("status", [...PAPER_JOB_IN_FLIGHT]);
      if (row.user_id) {
        await refundClaimedPaperCredits(
          db,
          String(row.id),
          String(row.user_id),
          "refund_paper_gen_lease_timeout",
        );
      }
      permanentlyFailed += 1;
    } else {
      await db
        .from("gov_paper_generation_jobs")
        .update({
          status: "failed_retryable",
          progress_stage: "failed_retryable",
          retryable: true,
          error_code: "WORKER_LEASE_EXPIRED",
          error_message: "Generation worker lost its lease. Retry is available.",
          worker_id: null,
          lease_expires_at: null,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .in("status", [...PAPER_JOB_IN_FLIGHT]);
      reclaimed += 1;
    }
  }

  return { reclaimed, permanentlyFailed };
}

const PAPER_JOB_NON_TERMINAL = new Set([
  ...PAPER_JOB_IN_FLIGHT,
  "failed",
]);

/**
 * Per-job reconcile on poll: expire queued orphans, runtime timeouts, and stale leases
 * so clients never spin on a row that will only be fixed by cron.
 */
export async function reconcileStuckPaperJob(
  db: ServiceDb,
  jobId: string,
): Promise<boolean> {
  const { data: job, error } = await db
    .from("gov_paper_generation_jobs")
    .select(
      "id, user_id, status, attempt_count, created_at, started_at, lease_expires_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) return false;

  const status = String(job.status ?? "");
  if (PAPER_JOB_HARD_TERMINAL.has(status) || status === "completed") {
    return false;
  }

  const now = Date.now();
  const createdMs = Date.parse(String(job.created_at ?? ""));
  const startedMs = Date.parse(String(job.started_at ?? job.created_at ?? ""));
  const leaseMs = job.lease_expires_at
    ? Date.parse(String(job.lease_expires_at))
    : 0;
  const leaseExpired = Number.isFinite(leaseMs) && leaseMs > 0 && leaseMs < now;
  const attempts = Number(job.attempt_count) || 0;
  const nowIso = new Date().toISOString();

  let patch: Record<string, unknown> | null = null;

  if (status === "queued" && Number.isFinite(createdMs) && now - createdMs >= PAPER_JOB_QUEUED_TTL_MS) {
    patch = {
      status: "failed_retryable",
      progress_stage: "failed_retryable",
      retryable: true,
      error_code: "WORKER_UNAVAILABLE",
      error_message:
        "Paper generation could not start — the generator is unavailable. Retry when service is restored.",
      worker_id: null,
      lease_expires_at: null,
      updated_at: nowIso,
    };
  } else if (
    PAPER_JOB_IN_FLIGHT.has(status) &&
    status !== "queued" &&
    Number.isFinite(startedMs) &&
    now - startedMs >= PAPER_JOB_MAX_RUNTIME_MS
  ) {
    if (attempts >= PAPER_JOB_MAX_ATTEMPTS) {
      patch = {
        status: "expired",
        progress_stage: "expired",
        retryable: false,
        error_code: "JOB_EXPIRED",
        error_message: "Paper generation exceeded the maximum allowed time.",
        worker_id: null,
        lease_expires_at: null,
        completed_at: nowIso,
        updated_at: nowIso,
      };
    } else {
      patch = {
        status: "failed_retryable",
        progress_stage: "failed_retryable",
        retryable: true,
        error_code: "GENERATION_TIMEOUT",
        error_message: "Paper generation timed out. Retry is available.",
        worker_id: null,
        lease_expires_at: null,
        updated_at: nowIso,
      };
    }
  } else if (
    PAPER_JOB_IN_FLIGHT.has(status) &&
    status !== "queued" &&
    leaseExpired
  ) {
    if (attempts >= PAPER_JOB_MAX_ATTEMPTS) {
      patch = {
        status: "failed_permanent",
        progress_stage: "failed_permanent",
        retryable: false,
        error_code: "GENERATION_TIMEOUT",
        error_message: "Generation worker lease expired too many times.",
        worker_id: null,
        lease_expires_at: null,
        completed_at: nowIso,
        updated_at: nowIso,
      };
    } else {
      patch = {
        status: "failed_retryable",
        progress_stage: "failed_retryable",
        retryable: true,
        error_code: "WORKER_LEASE_EXPIRED",
        error_message: "Generation worker lost its lease. Retry is available.",
        worker_id: null,
        lease_expires_at: null,
        updated_at: nowIso,
      };
    }
  }

  if (!patch) return false;

  const { data: updated, error: updateErr } = await db
    .from("gov_paper_generation_jobs")
    .update(patch)
    .eq("id", jobId)
    .in("status", [...PAPER_JOB_NON_TERMINAL])
    .select("id")
    .maybeSingle();

  if (updateErr) {
    console.error("[govPaperJobLease] reconcileStuckPaperJob:", updateErr.message);
    return false;
  }

  const terminalized =
    patch.status === "failed_permanent" ||
    patch.status === "cancelled" ||
    patch.status === "expired";
  if (updated?.id && job.user_id && terminalized) {
    await refundClaimedPaperCredits(
      db,
      jobId,
      String(job.user_id),
      `refund_paper_reconcile:${String(patch.error_code ?? "reconcile")}`,
    );
  }

  return Boolean(updated?.id);
}
