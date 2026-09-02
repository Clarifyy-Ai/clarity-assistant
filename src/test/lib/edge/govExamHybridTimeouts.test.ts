import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("gov exam hybrid timeout contracts", () => {
  it("pythonGovExamClient bounds every signedFetch including process-job", () => {
    const src = read("supabase/functions/_shared/pythonGovExamClient.ts");
    expect(src).toContain("export const DEFAULT_TIMEOUT_MS");
    expect(src).toContain("export const PROCESS_JOB_TIMEOUT_MS");
    expect(src).toContain("controller.abort()");
    expect(src).toContain('code: aborted ? "PYTHON_TIMEOUT"');
    expect(src).toContain("retryable: res.status >= 500 || res.status === 429");
    const signedFetch = src.slice(src.indexOf("async function signedFetch"));
    const callers = [
      "pythonGovAvailability",
      "pythonGovSelect",
      "pythonGovProcessJob",
      "pythonGovValidateQuestions",
    ];
    for (const name of callers) {
      const block = src.slice(src.indexOf(`export async function ${name}`));
      expect(block).toContain("timeoutMs:");
    }
    expect(signedFetch).toContain("opts.timeoutMs");
  });

  it("pythonClient pythonFetch always applies a request timeout", () => {
    const src = read("supabase/functions/_shared/pythonClient.ts");
    expect(src).toContain("PYTHON_REQUEST_TIMEOUT_MS");
    expect(src).toContain("ctrl.abort()");
    expect(src).toContain("timeoutMs");
    expect(src).toContain("callPythonProcess");
  });

  it("rejects loopback PYTHON_SERVICE_URL in production", () => {
    const src = read("supabase/functions/_shared/pythonClient.ts");
    expect(src).toContain("sanitizeInternalServiceUrl");
    expect(src).toContain("isLoopbackServiceHost");
    expect(src).toContain("isEdgeProduction");
    const gov = read("supabase/functions/_shared/pythonGovExamClient.ts");
    expect(gov).toContain("sanitizeInternalServiceUrl");
  });

  it("create-exam-paper bounds auth and profile lookups", () => {
    const src = read("supabase/functions/create-exam-paper/index.ts");
    expect(src).toContain("withTimeout");
    expect(src).toContain("AUTH_LOOKUP_TIMEOUT_MS");
    expect(src).toContain("PROFILE_LOOKUP_TIMEOUT_MS");
    expect(src).toContain('"AUTH_TIMEOUT"');
    expect(src).toContain('"PROFILE_LOOKUP_TIMEOUT"');
  });

  it("availability fail-opens Python 5xx/timeout and bounds profile lookup", () => {
    const src = read("supabase/functions/check-exam-paper-availability/index.ts");
    expect(src).toContain("withTimeout");
    expect(src).toContain("AUTH_LOOKUP_TIMEOUT_MS");
    expect(src).toContain("PROFILE_LOOKUP_TIMEOUT_MS");
    expect(src).toContain("availability_python_skipped");
    expect(src).toContain("pythonGovAvailability");
  });

  it("process-paper-generation-job bounds JWT/admin lookup", () => {
    const src = read("supabase/functions/process-paper-generation-job/index.ts");
    expect(src).toContain("withTimeout(authenticateRequest(req), AUTH_LOOKUP_TIMEOUT_MS)");
    expect(src).toContain("withTimeout(isAdmin(userId), AUTH_LOOKUP_TIMEOUT_MS)");
    expect(src).toContain('"AUTH_TIMEOUT"');
  });

  it("generate-topic-practice and assembler bound profile lookups", () => {
    const topic = read("supabase/functions/generate-topic-practice/index.ts");
    const assembly = read("supabase/functions/_shared/govPaperAssembly.ts");
    expect(topic).toContain("AUTH_LOOKUP_TIMEOUT_MS");
    expect(topic).toContain("PROFILE_LOOKUP_TIMEOUT_MS");
    expect(assembly).toContain("PROFILE_LOOKUP_TIMEOUT_MS");
    expect(assembly).toContain("skipping AI fill");
  });

  it("does not use a Python typeahead search endpoint", () => {
    const pythonRoutes = read("scraper/app/routes/gov_exams.py");
    expect(pythonRoutes).not.toContain("/search");
    const searchEdge = read("supabase/functions/search-exams/index.ts");
    expect(searchEdge).not.toContain("pythonGov");
    expect(searchEdge).not.toContain("pythonFetch");
  });
});
