import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("gov paper durable lifecycle contracts", () => {
  const migrationPath =
    "supabase/migrations/20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql";

  it("accepts and reserves atomically after an exact locked balance check", () => {
    const sql = read(migrationPath);
    const enqueue = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.enqueue_gov_paper_job"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.finalize_gov_paper_credits"),
    );
    expect(enqueue).toContain("FOR UPDATE");
    expect(enqueue).toContain("IF v_balance < p_cost");
    expect(enqueue).toContain("deduct_credits_service");
    expect(enqueue).toContain("INSERT INTO public.gov_paper_generation_jobs");
    expect(enqueue.indexOf("IF v_balance < p_cost")).toBeLessThan(
      enqueue.indexOf("deduct_credits_service"),
    );
    expect(enqueue.indexOf("deduct_credits_service")).toBeLessThan(
      enqueue.indexOf("INSERT INTO public.gov_paper_generation_jobs"),
    );
    expect(enqueue).toContain("'idempotent_replay', true");
  });

  it("never releases credits for failed_retryable jobs", () => {
    const sql = read(migrationPath);
    const release = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.release_gov_paper_credits"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.sweep_gov_paper_jobs"),
    );
    expect(release).toContain(
      "v_job.status NOT IN ('failed_permanent', 'cancelled', 'expired')",
    );
    expect(release).toContain("'JOB_NOT_RELEASABLE'");

    const credits = read("supabase/functions/_shared/claimJobCredits.ts");
    const refund = credits.slice(
      credits.indexOf("export async function refundClaimedPaperCredits"),
    );
    expect(refund).toContain("return releasePaperJobCredits(db, jobId, reason)");
    expect(refund).not.toContain("refundCreditsBestEffort");
    expect(refund).not.toContain(".from(");

    const assembly = read("supabase/functions/_shared/govPaperAssembly.ts");
    const retryBranch = assembly.slice(
      assembly.indexOf("if (retryable)"),
      assembly.indexOf("return;", assembly.indexOf("if (retryable)")) + 7,
    );
    expect(retryBranch).not.toContain("refundClaimedPaperCredits");
  });

  it("recovers checking jobs, bounds retries, and schedules a local sweeper", () => {
    const sql = read(migrationPath);
    expect(sql).toContain("'checking_availability'::text");
    expect(sql).toContain("attempt_count >= 3");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("status = 'failed_retryable'");
    expect(sql).toContain("status = 'expired'");
    expect(sql).toContain("sweep-gov-paper-jobs-every-minute");
    expect(sql).toContain("public.release_gov_paper_credits");

    const lease = read("supabase/functions/_shared/govPaperJobLease.ts");
    expect(lease).toContain('"checking_availability"');
    const retryableReclaim = lease.slice(
      lease.indexOf('status: "failed_retryable"'),
      lease.indexOf("reclaimed += 1"),
    );
    expect(retryableReclaim).not.toContain("refundClaimedPaperCredits");
  });

  it("returns a durable create ID before production background assembly", () => {
    const create = read("supabase/functions/create-exam-paper/index.ts");
    expect(create).toContain("createReservedPaperJob(db,");
    expect(create).toContain("scheduleWithWaitUntil(processing)");
    expect(create).toContain("jobId: reserved.jobId");
    expect(create).toContain('code: "JOB_QUEUED"');
  });

  it("persists topic-practice jobs through the same atomic acceptance RPC", () => {
    const topic = read("supabase/functions/generate-topic-practice/index.ts");
    expect(topic).toContain("createReservedPaperJob(db,");
    expect(topic).toContain('jobKind: "topic_practice"');
    expect(topic).toContain("inventorySnapshot");
    expect(topic).toContain('status: "failed_retryable"');
    expect(topic).not.toContain("refund_topic_practice_failed");
  });
});
