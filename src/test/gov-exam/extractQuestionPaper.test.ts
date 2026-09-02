import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOcrConfidenceFlags,
  classifyAnswerKeyStatus,
  normalizePdfExtractedQuestions,
  parsePlainTextMcqs,
  validateExtractQuestionPaperPayload,
} from "@/lib/gov-exam/extractQuestionPaper";

const EXAM_ID = "11111111-1111-1111-1111-111111111111";

describe("validateExtractQuestionPaperPayload", () => {
  it("requires examId and a content source", () => {
    const missing = validateExtractQuestionPaperPayload({});
    expect(missing.ok).toBe(false);
    if (missing.ok === false) expect(missing.code).toBe("VALIDATION_ERROR");

    const noContent = validateExtractQuestionPaperPayload({ examId: EXAM_ID });
    expect(noContent.ok).toBe(false);
    if (noContent.ok === false) {
      expect(noContent.message).toMatch(/PDF|OCR|storage path|structured questions/i);
    }
  });

  it("rejects remote download and sourceUrl scrape attempts", () => {
    const dl = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      textPayload: "Q1",
      downloadRemote: true,
    });
    expect(dl.ok).toBe(false);
    if (dl.ok === false) expect(dl.code).toBe("DOWNLOAD_DISABLED");

    const scrape = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      textPayload: "Q1",
      sourceUrl: "https://ssc.gov.in/paper.pdf",
    });
    expect(scrape.ok).toBe(false);
    if (scrape.ok === false) expect(scrape.code).toBe("SCRAPE_FORBIDDEN");
  });

  it("accepts textPayload with license_class and year", () => {
    const ok = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      textPayload: "Sample OCR text of a paper",
      year: 2024,
      licenseClass: "licensed",
      title: "SSC CGL 2024 Tier I",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.mode).toBe("text_payload");
      expect(ok.licenseClass).toBe("licensed");
      expect(ok.year).toBe(2024);
      expect(ok.createPaper).toBe(true);
    }
  });

  it("accepts storagePath and structured questions modes", () => {
    const storage = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      storagePath: "documents/pyq/sample.pdf",
    });
    expect(storage.ok).toBe(true);
    if (storage.ok) expect(storage.mode).toBe("storage_path");

    const structured = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      questions: [{ question_text: "x", options: ["a", "b", "c", "d"], correct_index: 0 }],
    });
    expect(structured.ok).toBe(true);
    if (structured.ok) expect(structured.mode).toBe("structured_questions");
  });

  it("rejects invalid licenseClass and oversized year", () => {
    const lic = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      textPayload: "x",
      licenseClass: "pirated_bank",
    });
    expect(lic.ok).toBe(false);

    const year = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      textPayload: "x",
      year: 1800,
    });
    expect(year.ok).toBe(true);
    if (year.ok) expect(year.year).toBeNull();
  });

  it("accepts minimal valid pdfBase64 prefix", () => {
    const ok = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      pdfBase64: "JVBERi0xLjQK", // "%PDF-1.4" prefix in base64
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.mode).toBe("pdf_base64");
  });

  it("rejects malformed base64 after the prefix", () => {
    const invalid = validateExtractQuestionPaperPayload({
      examId: EXAM_ID,
      pdfBase64: "JVBERi0xLjQK!",
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) expect(invalid.code).toBe("VALIDATION_ERROR");
  });
});

describe("normalizePdfExtractedQuestions", () => {
  it("flattens labelled option objects to strings", () => {
    const out = normalizePdfExtractedQuestions([
      {
        question_text: "2+2?",
        options: [
          { label: "A", text: "3" },
          { label: "B", text: "4" },
          { label: "C", text: "5" },
          { label: "D", text: "6" },
        ],
        correct_answer: "B",
      },
    ]);
    expect(out[0]).toMatchObject({
      question_text: "2+2?",
      options: ["3", "4", "5", "6"],
      correct_answer: "B",
    });
  });
});

describe("buildOcrConfidenceFlags", () => {
  it("flags short stems, missing answers, and option issues", () => {
    const flags = buildOcrConfidenceFlags([
      {
        question_text: "Hi?",
        options: ["a", "a", "", "d"],
      },
      {
        question_text: "Which Article guarantees equality before law in India?",
        options: ["12", "14", "19", "21"],
        correct_answer: "B",
        subject: "Polity",
        topic: "FR",
      },
    ]);
    expect(flags[0].flags).toEqual(
      expect.arrayContaining(["short_stem", "empty_option", "duplicate_options", "missing_answer"]),
    );
    expect(flags[0].score).toBeLessThan(0.7);
    expect(flags[1].flags).toHaveLength(0);
    expect(flags[1].score).toBe(1);
  });
});

describe("classifyAnswerKeyStatus", () => {
  it("flags missing or conflicting keys as needs_review and never guesses", () => {
    expect(
      classifyAnswerKeyStatus({
        raw: [],
        acceptedCount: 0,
        rejected: [],
        confidence: [],
      }),
    ).toBe("none");

    expect(
      classifyAnswerKeyStatus({
        raw: [{ question_text: "2+2?", options: ["1", "2", "3", "4"], correct_answer: "B" }],
        acceptedCount: 1,
        rejected: [],
        confidence: [{ index: 0, flags: [], score: 1 }],
      }),
    ).toBe("mapped");

    expect(
      classifyAnswerKeyStatus({
        raw: [{ question_text: "Hi?", options: ["a", "b", "c", "d"] }],
        acceptedCount: 1,
        rejected: [],
        confidence: [{ index: 0, flags: ["missing_answer"], score: 0.6 }],
      }),
    ).toBe("needs_review");

    expect(
      classifyAnswerKeyStatus({
        raw: [{ question_text: "2+2?", options: ["3", "4", "5", "6"], correct_index: 1, correct_answer: "C" }],
        acceptedCount: 1,
        rejected: [],
        confidence: [{ index: 0, flags: [], score: 1 }],
      }),
    ).toBe("needs_review");
  });
});

describe("parsePlainTextMcqs", () => {
  it("does not guess A when the answer line is missing", () => {
    const parsed = parsePlainTextMcqs(
      [
        "1. What is 2+2?",
        "A) 1",
        "B) 2",
        "C) 3",
        "D) 4",
      ].join("\n"),
    ) as Array<{ correct_answer?: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].correct_answer).toBe("");
    const flags = buildOcrConfidenceFlags(parsed);
    expect(flags[0].flags).toContain("missing_answer");
    expect(
      classifyAnswerKeyStatus({
        raw: parsed,
        acceptedCount: 1,
        rejected: [],
        confidence: flags,
      }),
    ).toBe("needs_review");
  });

  it("maps a clean Answer: B line", () => {
    const parsed = parsePlainTextMcqs(
      [
        "1. What is 2+2?",
        "A) 1",
        "B) 4",
        "C) 3",
        "D) 5",
        "Answer: B",
      ].join("\n"),
    ) as Array<{ correct_answer?: string }>;
    expect(parsed[0].correct_answer).toBe("B");
  });

  it("accepts parenthetical lowercase options and a multi-line stem", () => {
    const parsed = parsePlainTextMcqs(
      [
        "1. Consider the following statements about the Finance Commission.",
        "It is a constitutional body.",
        "(a) 1 only",
        "(b) 2 only",
        "(c) Both 1 and 2",
        "(d) Neither 1 nor 2",
        "Answer: C",
      ].join("\n"),
    ) as Array<{ question_text?: string; options?: string[]; correct_answer?: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question_text).toMatch(/Finance Commission/i);
    expect(parsed[0].options?.[0]).toBe("1 only");
    expect(parsed[0].correct_answer).toBe("C");
  });
});

describe("extract-question-paper answer_key_status default", () => {
  it("defaults omitted status to needs_review when questions were processed", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/extract-question-paper/index.ts"),
      "utf8",
    );
    expect(src).toContain("function defaultAnswerKeyStatus");
    expect(src).toMatch(/questionsProcessed[\s\S]{0,80}needs_review/);
    expect(src).not.toMatch(/answer_key_status:\s*args\.answerKeyStatus\s*\?\?\s*"none"/);
    const parser = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/pdfQuestionExtract.ts"),
      "utf8",
    );
    expect(parser).not.toMatch(/correct_answer:\s*answerLetter\s*\?\?\s*"A"/);
  });
});
