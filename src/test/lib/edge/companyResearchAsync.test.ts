import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("company-research async job contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/company-research/index.ts"),
    "utf8",
  );
  const jobSrc = fs.readFileSync(
    path.join(root, "supabase/functions/_shared/companyResearchJob.ts"),
    "utf8",
  );
  const clientSrc = fs.readFileSync(
    path.join(root, "src/lib/company/companyResearchJob.ts"),
    "utf8",
  );
  const pageSrc = fs.readFileSync(
    path.join(root, "src/pages/app/company-research/CompanyProfile.tsx"),
    "utf8",
  );

  it("returns a job id immediately via 202 / waitUntil instead of blocking on AI", () => {
    expect(src).toContain("scheduleWaitUntil");
    expect(jobSrc).toContain("EdgeRuntime");
    expect(jobSrc).toContain("waitUntil");
    expect(src).toContain("kickProcess");
    expect(src).toContain("jobAcceptedResponse");
    expect(src).toMatch(/:\s*202,|status:\s*202|,\s*202,\s*req/);
    expect(src).toContain("accepted: true");
    expect(src).toContain("async: true");
    expect(src).toContain("Credits reserved until generation finishes");
    expect(jobSrc).toContain("company_research_jobs");
  });

  it("reserves credits on enqueue and releases them once on provider failure/cancel", () => {
    expect(src).toContain("reserveCompanyBriefCredits");
    expect(jobSrc).toContain("releaseCompanyBriefCredits");
    expect(jobSrc).toContain("finalizeCompanyBriefCredits");
    expect(jobSrc).toContain("release_company_research_credits");
    expect(src).toContain("failCompanyBriefJob");
    expect(src).toContain("cancelCompanyBriefJob");
    expect(src).toContain("action === \"retry\"");
    expect(src).toContain("action === \"cancel\"");
    expect(src).toContain("creditCost: 0");
  });

  it("keeps hybrid MATRIX generation on the process path, not the HTTP accept path", () => {
    expect(src).toContain("executeHybridOperation");
    expect(src).toMatch(/operation:\s*"company_research"/);
    expect(src).toContain("generateBriefWithAi");
    expect(src).toContain("getAiFeaturePolicy");
    expect(src).toContain("skipSecondaryOnQuota");
    const runPythonBlock = src.slice(
      src.indexOf("runPython:"),
      src.indexOf("runDeterministic:"),
    );
    expect(runPythonBlock).not.toContain("generateBriefWithAi");
    expect(src).toContain("kickProcess(req, auth, job.id)");
  });

  it("client polls with backoff, cancel, retry, and duplicate-click idempotency", () => {
    expect(clientSrc).toContain("pollCompanyResearchJobUntilTerminal");
    expect(clientSrc).toContain("cancelCompanyResearchJob");
    expect(clientSrc).toContain("retryCompanyResearchJob");
    expect(clientSrc).toContain("x-idempotency-key");
    expect(clientSrc).toContain("START_TIMEOUT_MS");
    expect(pageSrc).toContain("generateCompanyBrief");
    expect(pageSrc).toContain("Cancel generation");
    expect(pageSrc).toContain("inFlightRef");
  });
});
