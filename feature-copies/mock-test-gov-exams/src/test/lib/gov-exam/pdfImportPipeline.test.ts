import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPdfMagicBase64,
  parsePlainTextMcqs,
  pythonDocumentExtractText,
  pythonExtractLooksScanned,
  userMessageForPdfImportFailure,
  validatePdfImportFile,
  PDF_IMPORT_MAX_BYTES,
} from "@/lib/gov-exam/extractQuestionPaper";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const INDIAN_MCQ_PAPER = [
  "1. The capital of India is",
  "(a) Mumbai",
  "(b) New Delhi",
  "(c) Kolkata",
  "(d) Chennai",
  "Answer: B",
  "",
  "2. Which Article of the Constitution of India deals with equality before law?",
  "(a) Article 12",
  "(b) Article 14",
  "(c) Article 19",
  "(d) Article 21",
  "Ans: (b)",
].join("\n");

describe("PDF import pipeline — supported text", () => {
  it("parses Indian (a)/(b)/(c)/(d) MCQs from extracted text", () => {
    const parsed = parsePlainTextMcqs(INDIAN_MCQ_PAPER) as Array<{
      question_text: string;
      options: string[];
      correct_answer: string;
    }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].question_text).toMatch(/capital of India/i);
    expect(parsed[0].options).toEqual(["Mumbai", "New Delhi", "Kolkata", "Chennai"]);
    expect(parsed[0].correct_answer).toBe("B");
    expect(parsed[1].correct_answer).toBe("B");
  });

  it("reads Python document_extract extracted_text (not only full_text)", () => {
    expect(
      pythonDocumentExtractText({
        extracted_text: INDIAN_MCQ_PAPER,
        full_text: "",
      }),
    ).toBe(INDIAN_MCQ_PAPER);
    expect(pythonDocumentExtractText({ data: { extracted_text: INDIAN_MCQ_PAPER } })).toBe(
      INDIAN_MCQ_PAPER,
    );
    expect(pythonDocumentExtractText({ full_text: "legacy" })).toBe("legacy");
  });
});

describe("PDF import pipeline — validation before charge", () => {
  it("accepts %PDF magic bytes and rejects malformed payloads", () => {
    expect(isPdfMagicBase64(btoa("%PDF-1.4\n%"))).toBe(true);
    expect(isPdfMagicBase64(btoa("not a pdf"))).toBe(false);
    expect(isPdfMagicBase64("!!!!")).toBe(false);
    expect(isPdfMagicBase64("")).toBe(false);
  });

  it("rejects oversized, empty, and non-PDF files without implying a refund", () => {
    expect(validatePdfImportFile({ name: "paper.pdf", type: "", size: 12_000 })).toEqual({
      ok: true,
    });
    expect(
      validatePdfImportFile({ name: "paper.pdf", type: "application/octet-stream", size: 12_000 }),
    ).toEqual({ ok: true });

    const oversized = validatePdfImportFile({
      name: "paper.pdf",
      type: "application/pdf",
      size: PDF_IMPORT_MAX_BYTES + 1,
    });
    expect(oversized.ok).toBe(false);
    if (oversized.ok === false) {
      expect(oversized.code).toBe("PDF_TOO_LARGE");
      expect(oversized.message).not.toMatch(/refunded/i);
    }

    const empty = validatePdfImportFile({ name: "paper.pdf", type: "application/pdf", size: 0 });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(empty.code).toBe("EMPTY_PDF");

    const wrong = validatePdfImportFile({ name: "notes.docx", type: "", size: 100 });
    expect(wrong.ok).toBe(false);
    if (wrong.ok === false) expect(wrong.code).toBe("INVALID_PDF");
  });
});

describe("PDF import pipeline — scanned, zero-question, retry copy", () => {
  it("flags scanned/image PDFs when OCR extracted no text", () => {
    expect(
      pythonExtractLooksScanned({
        extracted_text: "",
        warnings: ["NO_TEXT_EXTRACTED", "OCR_UNAVAILABLE"],
      }),
    ).toBe(true);
    expect(
      pythonExtractLooksScanned({
        extracted_text: INDIAN_MCQ_PAPER,
        warnings: ["NO_TEXT_EXTRACTED"],
      }),
    ).toBe(false);
  });

  it("returns zero questions for prose with no MCQ options", () => {
    const parsed = parsePlainTextMcqs(
      "This booklet contains instructions for candidates. Do not open until told.",
    );
    expect(parsed).toHaveLength(0);
    const msg = userMessageForPdfImportFailure("ZERO_QUESTIONS", true);
    expect(msg).toMatch(/No MCQ questions/i);
    expect(msg).toMatch(/Credits refunded/);
  });

  it("separates validation copy (no refund) from parser/runtime copy (refund)", () => {
    expect(userMessageForPdfImportFailure("INVALID_PDF", false)).not.toMatch(/refunded/i);
    expect(userMessageForPdfImportFailure("PDF_TOO_LARGE", false)).not.toMatch(/refunded/i);
    expect(userMessageForPdfImportFailure("SCANNED_PDF", true)).toMatch(/Credits refunded/);
    expect(userMessageForPdfImportFailure("AI_ERROR", true)).toBe(
      "PDF parsing failed. Credits refunded.",
    );
    expect(userMessageForPdfImportFailure("PARSER_TIMEOUT", true)).toMatch(/timed out/i);
  });
});

describe("PDF import edge + client contracts", () => {
  it("validates magic bytes before deducting credits and refunds every post-charge failure", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/parse-question-pdf/index.ts"),
      "utf8",
    );
    expect(src.indexOf("if (!isPdfMagicBase64")).toBeGreaterThan(-1);
    expect(src.indexOf("if (!isPdfMagicBase64")).toBeLessThan(src.indexOf("await deductCreditsAtomic"));
    expect(src.indexOf("if (!pdf.ok)")).toBeLessThan(src.indexOf("await deductCreditsAtomic"));
    expect(src).toContain("pythonDocumentExtractText");
    expect(src).toContain("EXTRACT_DEADLINE_MS");
    expect(src).toContain("PYTHON_EXTRACT_TIMEOUT_MS");
    expect(src).toContain("ZERO_QUESTIONS");
    expect(src).toContain("SCANNED_PDF");
    expect(src).toContain("refundOnce");
    expect(src).toMatch(/failHttp[\s\S]{0,200}refundOnce/);
    expect(src).not.toContain("fakeQuestions");
  });

  it("exposes retry for the last selected PDF", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/UploadQuestions.tsx"),
      "utf8",
    );
    expect(page).toContain("lastFileRef");
    expect(page).toContain("Retry");
    expect(page).toContain("validatePdfImportFile");
    expect(page).toContain("Max 15 MB");
    expect(page).toContain("accept=\".pdf,application/pdf\"");
  });
});
