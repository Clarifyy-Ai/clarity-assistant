import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("claimJobCredits refund on permanent failure", () => {
  it("releases reserved credits only for terminal failure statuses", () => {
    const migration = read(
      "supabase/migrations/20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql",
    );
    const release = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.release_gov_paper_credits"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.sweep_gov_paper_jobs"),
    );
    expect(release).toContain(
      "v_job.status NOT IN ('failed_permanent', 'cancelled', 'expired')",
    );
    expect(release).not.toMatch(/v_job\.status NOT IN \([^)]*failed_retryable/);
  });

  it("uses RPC-only fail-closed settlement with no application refund fallback", () => {
    const claim = read("supabase/functions/_shared/claimJobCredits.ts");
    const refundFn = claim.slice(claim.indexOf("export async function refundClaimedPaperCredits"));
    expect(refundFn).toContain("return releasePaperJobCredits(db, jobId, reason)");
    expect(refundFn).not.toContain("refundCreditsBestEffort");
    expect(refundFn).not.toContain("claimJobCreditsForRefund");
    expect(refundFn).not.toContain("markJobCreditsReleased");
    expect(refundFn).not.toContain(".from(");
  });

  it("serializes concurrent releases and makes retries return zero", () => {
    const migration = read(
      "supabase/migrations/20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql",
    );
    const release = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.release_gov_paper_credits"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.sweep_gov_paper_jobs"),
    );
    expect(release).toContain("FOR UPDATE");
    expect(release).toContain("IF v_job.credits_released_at IS NOT NULL");
    expect(release).toContain("'already_released', true, 'released', 0");
    expect(release.indexOf("FOR UPDATE")).toBeLessThan(
      release.indexOf("IF v_job.credits_released_at IS NOT NULL"),
    );
    expect(release.indexOf("IF v_job.credits_released_at IS NOT NULL")).toBeLessThan(
      release.indexOf("public.refund_credits"),
    );
  });

  it("disables the legacy non-atomic application claim shim", () => {
    const claim = read("supabase/functions/_shared/claimJobCredits.ts");
    const shim = claim.slice(
      claim.indexOf("export async function claimJobCreditsForRefund"),
      claim.indexOf("export async function refundClaimedPaperCredits"),
    );
    expect(shim).toContain("return 0");
    expect(shim).not.toContain(".update(");
    expect(shim).not.toContain(".select(");
  });

  it("get-paper-generation-job refunds on poll of failed_permanent without retryable release", () => {
    const getJob = read("supabase/functions/get-paper-generation-job/index.ts");
    expect(getJob).toContain("refundClaimedPaperCredits");
    expect(getJob).toContain("finalizePaperJobCredits");
    const releaseBranch = getJob.slice(
      getJob.indexOf('publicStatus === "completed"'),
      getJob.indexOf("return json(req", getJob.indexOf('publicStatus === "completed"')),
    );
    expect(releaseBranch).toContain("refundClaimedPaperCredits");
    expect(releaseBranch).toContain('"failed_permanent"');
    expect(releaseBranch).not.toContain('"failed_retryable"');
  });

  it("enqueue deducts atomically so a failed job can restore the original balance", () => {
    const migration = read(
      "supabase/migrations/20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql",
    );
    const release = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.release_gov_paper_credits"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.sweep_gov_paper_jobs"),
    );
    expect(release).toContain("refund_credits");
    expect(release).toContain("credits_released_at");
    expect(release).toContain("COALESCE((v_refund->>'success')::boolean, false) IS NOT TRUE");
  });
});
