import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

const INGEST_ADMIN_EDGES = [
  "hybrid-health",
  "hybrid-ping",
  "ai-key-check",
  "collect-exam-papers",
  "extract-question-paper",
  "run-daily-exam-scrape",
  "process-sprint-transcript",
] as const;

describe("ingest-admin fetchEdge allowlists", () => {
  const fetchEdge = read("src/lib/network/fetchEdge.ts");

  it("allows admin ingest edges in private mode (non-AI diagnostics)", () => {
    for (const fn of INGEST_ADMIN_EDGES.filter((f) => f !== "process-sprint-transcript")) {
      expect(fetchEdge).toContain(`"${fn}"`);
    }
    expect(fetchEdge).toMatch(/PRIVATE_MODE_ALLOWLIST[\s\S]*?"hybrid-health"/);
    expect(fetchEdge).toMatch(/PRIVATE_MODE_ALLOWLIST[\s\S]*?"collect-exam-papers"/);
  });

  it("does not allow ai-hub-router in private mode (cloud AI stays blocked)", () => {
    const privateBlock = fetchEdge.match(
      /const PRIVATE_MODE_ALLOWLIST = new Set\(\[([\s\S]*?)\]\);/,
    )?.[1];
    expect(privateBlock).toBeTruthy();
    expect(privateBlock).not.toContain('"ai-hub-router"');
  });

  it("skips credit refresh for ingest-admin operational edges", () => {
    for (const fn of INGEST_ADMIN_EDGES) {
      expect(fetchEdge).toMatch(new RegExp(`CREDIT_REFRESH_SKIP[\\s\\S]*?"${fn}"`));
    }
  });
});

describe("ingest-admin scraper client JWT paths", () => {
  const client = read("src/lib/scraper/client.ts");

  it("documents JWT vs HMAC vs ingest-key separation", () => {
    expect(client).toContain("Bearer JWT");
    expect(client).toContain("DOCUMENT_INTELLIGENCE_AUTH_SECRET");
    expect(client).toContain("INGEST_API_KEY");
  });

  it("exposes scrape/sources and paper-factory/exams", () => {
    expect(client).toContain('"/scrape/sources"');
    expect(client).toContain('"/paper-factory/exams"');
    expect(client).toContain("paperFactoryExams");
  });

  it("exposes paper-factory plan, generate, and processJob JWT methods", () => {
    expect(client).toContain('"/paper-factory/plan"');
    expect(client).toContain('"/paper-factory/generate"');
    expect(client).toContain("paperFactoryPlan");
    expect(client).toContain("paperFactoryGenerate");
    expect(client).toContain("paperFactoryProcessJob");
    expect(client).toContain("/paper-factory/jobs/");
  });

  it("does not put HMAC internal paths in the browser client", () => {
    expect(client).not.toContain("/internal/operations");
    expect(client).not.toContain("/internal/gov-exams");
    expect(client).not.toContain("X-Internal-Signature");
    expect(client).not.toContain("DOCUMENT_INTELLIGENCE_AUTH_SECRET =");
  });
});

describe("hybrid-health HMAC probe (no secret leak)", () => {
  const hybridHealth = read("supabase/functions/hybrid-health/index.ts");

  it("probes signed internal route and exposes hmac_ok boolean only", () => {
    expect(hybridHealth).toContain("/internal/gov-exams/health");
    expect(hybridHealth).toContain("hmac_ok: hmacOk");
    expect(hybridHealth).toContain("Does NOT expose");
    expect(hybridHealth).not.toMatch(/DOCUMENT_INTELLIGENCE_AUTH_SECRET.*JSON\.stringify\(body\)/);
  });

  it("probes supported operations, alerts, and metrics without dumping payloads", () => {
    expect(hybridHealth).toContain("/internal/operations/supported");
    expect(hybridHealth).toContain('"/alerts"');
    expect(hybridHealth).toContain('"/metrics"');
    expect(hybridHealth).toContain("supported: pythonSupported");
    expect(hybridHealth).toContain("alerts: pythonAlerts");
    expect(hybridHealth).toContain("metrics: pythonMetrics");
    expect(hybridHealth).toContain("Counts only");
    expect(hybridHealth).not.toMatch(/DOCUMENT_INTELLIGENCE_AUTH_SECRET.*JSON\.stringify\(body\)/);
    expect(hybridHealth).not.toMatch(/json:\s*supported\.json/);
    expect(hybridHealth).not.toMatch(/json:\s*metrics\.json/);
  });
});

describe("edge ingest JSON MCQ options", () => {
  it("normalizes labeled option objects the same way as the client validator", () => {
    const edge = read("supabase/functions/_shared/ingestJsonQuestions.ts");
    expect(edge).toContain("normalizeMcqOptions");
    expect(edge).toContain("normalizeMcqOptions(q.options, 6)");
    expect(edge).not.toMatch(/q\.options\.map\(\(o\) => String\(o \?\? ""\)\.trim\(\)\)/);
  });
});

describe("parse-document document_classify wiring", () => {
  const parseDocument = read("supabase/functions/parse-document/index.ts");

  it("classifies extracted text via document_classify and fail-closes high-confidence UNRELATED", () => {
    expect(parseDocument).toContain('operation: "document_classify"');
    expect(parseDocument).toContain("DOCUMENT_UNRELATED");
    expect(parseDocument).toContain("UNRELATED_REJECT_CONFIDENCE");
    expect(parseDocument).toContain("classifyOrReject");
  });
});
