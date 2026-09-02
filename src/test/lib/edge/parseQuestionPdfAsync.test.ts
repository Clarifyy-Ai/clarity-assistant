import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("parse-question-pdf async contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/parse-question-pdf/index.ts"),
    "utf8",
  );

  it("queues heavy PDFs with 202, waitUntil, and a durable job", () => {
    expect(src).toContain("scheduleWaitUntil");
    expect(src).toContain("EdgeRuntime");
    expect(src).toContain("waitUntil");
    expect(src).toContain("accepted: true");
    expect(src).toContain('status: "queued"');
    expect(src).toContain("PDF queued. Credits reserved until parsing finishes.");
    expect(src).toMatch(/status\s*=\s*202|,\s*202,\s*req/);
    expect(src).toContain("source_ingestion_jobs");
    expect(src).toContain("ASYNC_PDF_B64_CHARS");
    expect(src).toContain("isPythonConfigured");
  });

  it("refunds credits exactly once on extract failure and never invents questions", () => {
    expect(src).toContain("refundCredits");
    expect(src).toContain("refundOnce");
    expect(src).toContain("parse-question-pdf-refund:");
    expect(src).toContain("PDF parsing failed. Credits refunded.");
    expect(src).toContain("PARSER_TIMEOUT");
    expect(src).toContain("ZERO_QUESTIONS");
    expect(src).toContain("SCANNED_PDF");
    expect(src).not.toContain("fakeQuestions");
    expect(src).not.toContain("placeholder questions");
  });

  it("rejects invalid PDFs before charging and bounds extract with a deadline", () => {
    expect(src).toContain("isPdfMagicBase64");
    expect(src).toContain("pythonDocumentExtractText");
    expect(src).toContain("EXTRACT_DEADLINE_MS");
    expect(src).toContain("PYTHON_EXTRACT_TIMEOUT_MS");
    expect(src.indexOf("if (!pdf.ok)")).toBeLessThan(src.indexOf("await deductCreditsAtomic"));
  });

  it("frontend polls 202 and shows background parsing copy", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/UploadQuestions.tsx"),
      "utf8",
    );
    const poller = fs.readFileSync(
      path.join(root, "src/lib/gov-exam/parseQuestionPdfJob.ts"),
      "utf8",
    );
    expect(page).toContain("Parsing in background");
    expect(page).toContain("pollParseQuestionPdfJob");
    expect(page).toContain("response.status === 202");
    expect(page).toContain("response.status === 504");
    expect(page).toContain("lastFileRef");
    expect(page).toContain("Retry");
    expect(poller).toContain("parse-question-pdf?jobId=");
  });

  it("keeps a synchronous 200 path for small PDFs", () => {
    expect(src).toContain("heavyPdf");
    expect(src).toMatch(/count:\s*questions\.length/);
    expect(src).toMatch(/,\s*200,\s*req/);
  });
});
