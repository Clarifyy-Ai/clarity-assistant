import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDocumentExtractPayload,
  extractPdfTextBasic,
  looksBinary,
  tryDeterministicTextExtract,
} from "../../../../supabase/functions/_shared/documentTextExtract.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("documentTextExtract", () => {
  it("extracts printable text from a minimal text-based PDF", () => {
    const pdfBody = [
      "%PDF-1.4",
      "1 0 obj",
      "<<>>",
      "endobj",
      "2 0 obj",
      "<< /Length 44 >>",
      "stream",
      "BT (Hello from cover letter body text here.) Tj ET",
      "endstream",
      "endobj",
      "xref",
      "trailer",
      "%%EOF",
    ].join("\n");
    const bytes = new TextEncoder().encode(pdfBody);
    const text = extractPdfTextBasic(bytes);
    expect(text).toContain("Hello from cover letter body text here");
    const payload = buildDocumentExtractPayload(text!);
    expect(payload?.full_text).toContain("Hello from cover letter");
  });

  it("extracts plain text documents", () => {
    const content =
      "Senior Software Engineer role at Acme Corp. Responsibilities include building APIs.";
    const bytes = new TextEncoder().encode(content);
    const result = tryDeterministicTextExtract(bytes, "text/plain");
    expect(result?.full_text).toBe(content);
    expect(result?.summary).toBe(content.slice(0, 400));
  });

  it("rejects binary content masquerading as text", () => {
    const bytes = new Uint8Array([0, 1, 2, 0, 4, 5, 0, 7, 0, 0, 0, 0, 0, 0]);
    expect(looksBinary(bytes)).toBe(true);
    expect(tryDeterministicTextExtract(bytes, "text/plain")).toBeNull();
  });

  it("rejects payloads shorter than minimum extract length", () => {
    const bytes = new TextEncoder().encode("short");
    expect(buildDocumentExtractPayload("short")).toBeNull();
    expect(tryDeterministicTextExtract(bytes, "text/plain")).toBeNull();
  });

  it("returns null for unsupported MIME types", () => {
    const bytes = new TextEncoder().encode("not a zip file really");
    expect(
      tryDeterministicTextExtract(
        bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBeNull();
  });
});

describe("parse-document source contracts (BUG-005)", () => {
  const parseDocument = read("supabase/functions/parse-document/index.ts");
  const useDocuments = read("src/hooks/useDocuments.ts");
  const classify = read("scraper/app/engines/document_classify.py");

  it("resolves MIME from bytes for JD and cover letter paths", () => {
    expect(parseDocument).toContain("resolveUploadMime(mimeType, {");
    expect(parseDocument).toContain("mimeType: resolvedMime.mimeType");
    expect(parseDocument).not.toMatch(/mimeType: mimeCheck\.mimeType,\s*\n\s*documentKind: "job_description"/);
  });

  it("uses bounded Gemini helper instead of raw fetch", () => {
    expect(parseDocument).toContain("geminiGenerateWithPdf");
    expect(parseDocument).not.toContain("GEMINI_BASE");
    expect(parseDocument).not.toContain("inline_data");
  });

  it("tries deterministic extraction before Python and after hybrid failure", () => {
    expect(parseDocument).toContain("tryDeterministicTextExtract");
    expect(parseDocument).toContain('source: "deterministic"');
    expect(parseDocument).toContain("extractPdfTextBasic");
  });

  it("gives cover letter uploads the same 90s parse timeout as resume/JD", () => {
    const coverLetterBlock = useDocuments.slice(
      useDocuments.indexOf("uploadCoverLetter"),
      useDocuments.indexOf("uploadPortfolio"),
    );
    expect(coverLetterBlock).toContain("timeoutMs: 90_000");
    expect(coverLetterBlock).toContain("getMimeType(file.name)");
    expect(coverLetterBlock).not.toMatch(
      /ext === "pdf"\s*\?\s*"application\/pdf"/,
    );
  });

  it("classifies cover letters via personal-document hint", () => {
    expect(classify).toContain('"cover_letter"');
    expect(classify).toContain("category_hint_personal_document");
  });

  it("does not call unmetered client Gemini for JD or cover letter parse", () => {
    expect(useDocuments).not.toContain("callGemini");
    expect(useDocuments).toContain("clearSessionAiContext");
  });

  it("splits empty vs oversized and never uses BAD_REQUEST for those", () => {
    const errors = read("supabase/functions/_shared/documentErrors.ts");
    expect(errors).toContain('code: "INVALID_FILE"');
    expect(errors).toContain('code: "FILE_TOO_LARGE"');
    const sizeHelper = parseDocument.slice(
      parseDocument.indexOf("function sizeFailureResponse"),
      parseDocument.indexOf("async function extractWithGemini"),
    );
    expect(sizeHelper).toContain("fileByteLengthFailure");
    expect(sizeHelper).not.toContain("BAD_REQUEST");
    expect(parseDocument).not.toMatch(/byteLength[\s\S]{0,80}BAD_REQUEST/);
  });

  it("refunds after DOCUMENT_UNRELATED classify reject", () => {
    expect(parseDocument).toContain("refundIfCharged");
    expect(parseDocument).toContain("parse-doc-unrelated-ref");
    expect(parseDocument).toContain('documentErrorMessage("DOCUMENT_UNRELATED")');
  });

  it("resolves storage prefix from document type instead of cover-letters only", () => {
    expect(parseDocument).toContain("storagePrefixForDocument");
    expect(parseDocument).toContain("portfolios");
    expect(parseDocument).not.toMatch(
      /const storagePrefix = `\$\{userId\}\/cover-letters`/,
    );
  });
});

describe("library poll and resume parse contracts", () => {
  const library = read("src/pages/app/library/DocumentLibrary.tsx");
  const parseResume = read("supabase/functions/parse-resume/index.ts");
  const mockSession = read("src/pages/app/mock/MockSession.tsx");

  it("does not fall back to sync parse after a durable job times out", () => {
    expect(library).toContain('error_code === "PARSER_TIMEOUT"');
    expect(library).toContain("if (!created?.jobId && shouldFallbackToSyncParse(err))");
  });

  it("parse-resume classifies empty vs oversized via fileByteLengthFailure", () => {
    expect(parseResume).toContain("fileByteLengthFailure");
    expect(parseResume).toContain("mapHybridDocumentCode");
    expect(parseResume).toContain("return hybrid.response");
  });

  it("mock interviews load cover letter via buildResumeContextForAI", () => {
    expect(mockSession).toContain("buildResumeContextForAI");
  });
});
