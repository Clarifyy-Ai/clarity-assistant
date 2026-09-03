import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("generate-debrief async job contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/generate-debrief/index.ts"),
    "utf8",
  );
  const jobSrc = fs.readFileSync(
    path.join(root, "supabase/functions/_shared/sessionDebriefJob.ts"),
    "utf8",
  );
  const clientSrc = fs.readFileSync(
    path.join(root, "src/lib/debrief/debriefJob.ts"),
    "utf8",
  );
  const pageSrc = fs.readFileSync(
    path.join(root, "src/pages/app/debrief/DebriefDetail.tsx"),
    "utf8",
  );

  it("returns a job id immediately via 202 / waitUntil instead of blocking on AI", () => {
    expect(src).toContain("scheduleWaitUntil");
    expect(jobSrc).toContain("EdgeRuntime");
    expect(jobSrc).toContain("waitUntil");
    expect(src).toContain("kickProcess");
    expect(src).toContain("jobAcceptedResponse");
    expect(src).toMatch(/json\(getCorsHeaders\(req\),\s*isTerminalSessionDebriefStatus\(job.status\) \? 200 : 202/);
    expect(src).toContain("accepted: true");
    expect(src).toContain("async: true");
    expect(src).toContain("Credits reserved until generation finishes");
    expect(jobSrc).toContain("session_debrief_jobs");
  });

  it("reserves credits on enqueue and releases them once on provider failure/cancel", () => {
    expect(src).toContain("reserveSessionDebriefCredits");
    expect(jobSrc).toContain("releaseSessionDebriefCredits");
    expect(jobSrc).toContain("finalizeSessionDebriefCredits");
    expect(jobSrc).toContain("release_session_debrief_credits");
    expect(src).toContain("failSessionDebriefJob");
    expect(src).toContain("cancelSessionDebriefJob");
    expect(src).toContain('action === "retry"');
    expect(src).toContain('action === "cancel"');
    expect(src).toContain("creditCost: 0");
  });

  it("keeps hybrid MATRIX generation on the process path, not the HTTP accept path", () => {
    expect(src).toContain("executeHybridOperation");
    expect(src).toMatch(/operation:\s*"session_debrief"/);
    expect(src).toContain("generateDebriefText");
    expect(src).toContain("getAiFeaturePolicy");
    expect(src).toContain("skipSecondaryOnQuota");
    expect(src).toContain("processSessionDebriefJob");
    expect(src).toContain("runDebriefHybrid");
    expect(src).toContain("kickProcess(req, user.id, planId, job.id)");
  });

  it("client polls with backoff, cancel, retry, and duplicate-click idempotency", () => {
    expect(clientSrc).toContain("pollSessionDebriefJobUntilTerminal");
    expect(clientSrc).toContain("cancelSessionDebriefJob");
    expect(clientSrc).toContain("retrySessionDebriefJob");
    expect(clientSrc).toContain("x-idempotency-key");
    expect(clientSrc).toContain("START_TIMEOUT_MS");
    expect(pageSrc).toContain("generateSessionDebrief");
    expect(pageSrc).toContain("Cancel generation");
    expect(pageSrc).toContain("generateInFlightRef");
  });
});
