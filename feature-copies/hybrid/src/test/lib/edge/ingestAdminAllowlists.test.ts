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
});

describe("hybrid-health HMAC probe (no secret leak)", () => {
  const hybridHealth = read("supabase/functions/hybrid-health/index.ts");

  it("probes signed internal route and exposes hmac_ok boolean only", () => {
    expect(hybridHealth).toContain("/internal/gov-exams/health");
    expect(hybridHealth).toContain("hmac_ok: hmacOk");
    expect(hybridHealth).toContain("Does NOT expose");
    expect(hybridHealth).not.toMatch(/DOCUMENT_INTELLIGENCE_AUTH_SECRET.*JSON\.stringify\(body\)/);
  });
});
