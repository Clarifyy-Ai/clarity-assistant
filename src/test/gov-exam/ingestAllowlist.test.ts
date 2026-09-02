import { describe, expect, it } from "vitest";
import {
  assertOfficialExamUrl,
  isOfficialDocumentUrlAllowed,
  isOfficialExamUrlAllowed,
  OFFICIAL_EXAM_DOMAIN_ALLOWLIST,
} from "@/lib/gov-exam/officialDomainAllowlist";
import { validateIngestQuestionsPayload } from "@/lib/gov-exam/ingestJsonQuestions";

describe("official domain allowlist", () => {
  it("includes core recruiting-body hosts", () => {
    expect(OFFICIAL_EXAM_DOMAIN_ALLOWLIST).toContain("ssc.gov.in");
    expect(OFFICIAL_EXAM_DOMAIN_ALLOWLIST).toContain("upsc.gov.in");
    expect(OFFICIAL_EXAM_DOMAIN_ALLOWLIST).toContain("ibps.in");
    expect(OFFICIAL_EXAM_DOMAIN_ALLOWLIST).toContain("rrbcdg.gov.in");
  });

  it("allows https official hosts and www subdomains", () => {
    expect(isOfficialExamUrlAllowed("https://ssc.gov.in/")).toBe(true);
    expect(isOfficialExamUrlAllowed("https://www.upsc.gov.in/examinations")).toBe(
      true,
    );
    expect(isOfficialExamUrlAllowed("https://www.ibps.in/")).toBe(true);
    expect(isOfficialExamUrlAllowed("https://www.rrbcdg.gov.in/")).toBe(true);
  });

  it("rejects http, unknown hosts, and coaching banks", () => {
    expect(isOfficialExamUrlAllowed("http://ssc.gov.in/")).toBe(false);
    expect(isOfficialExamUrlAllowed("https://evil.example.com/")).toBe(false);
    expect(isOfficialExamUrlAllowed("https://testbook.com/pyq")).toBe(false);
    expect(isOfficialExamUrlAllowed("not-a-url")).toBe(false);
  });

  it("assertOfficialExamUrl returns structured errors", () => {
    const bad = assertOfficialExamUrl("https://coaching.example/bank.pdf");
    expect(bad.ok).toBe(false);
    if (bad.ok === false) {
      expect(bad.code).toBe("FORBIDDEN_HOST");
    }
    const good = assertOfficialExamUrl("https://nta.ac.in/Downloads");
    expect(good.ok).toBe(true);
  });

  it("allows known official document CDN hosts", () => {
    expect(
      isOfficialDocumentUrlAllowed("https://documents.upsc.gov.in/paper.pdf"),
    ).toBe(true);
    expect(
      isOfficialDocumentUrlAllowed("https://cdnbbsr.s3waas.gov.in/file.pdf"),
    ).toBe(true);
  });
});

describe("ingest JSON question validation", () => {
  const valid = {
    question_text: "Which Article deals with equality before law?",
    options: ["Article 12", "Article 14", "Article 19", "Article 21"],
    correct_index: 1,
    subject: "Polity",
    topic: "Fundamental Rights",
  };

  it("accepts a valid single-correct MCQ batch", () => {
    const result = validateIngestQuestionsPayload([valid]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].correct_letter).toBe("B");
      expect(result.rejected).toHaveLength(0);
    }
  });

  it("accepts correct_answer letter form", () => {
    const result = validateIngestQuestionsPayload([
      {
        question_text: "Capital of India?",
        options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"],
        correct_answer: "B",
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions[0].correct_index).toBe(1);
    }
  });

  it("normalizes {label,text} option objects instead of [object Object]", () => {
    const result = validateIngestQuestionsPayload([
      {
        question_text: "Capital of India?",
        options: [
          { label: "A", text: "Mumbai" },
          { label: "B", text: "New Delhi" },
          { label: "C", text: "Kolkata" },
          { label: "D", text: "Chennai" },
        ],
        correct_answer: "B",
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions[0].options).toEqual([
        "Mumbai",
        "New Delhi",
        "Kolkata",
        "Chennai",
      ]);
    }
  });

  it("rejects empty / non-array payloads", () => {
    expect(validateIngestQuestionsPayload([]).ok).toBe(false);
    expect(validateIngestQuestionsPayload(null).ok).toBe(false);
    const empty = validateIngestQuestionsPayload([]);
    if (empty.ok === false) expect(empty.code).toBe("EMPTY_QUESTIONS");
  });

  it("rejects duplicate options and bad answers", () => {
    const result = validateIngestQuestionsPayload(
      [
        {
          question_text: "Bad options",
          options: ["A", "A", "B", "C"],
          correct_index: 0,
        },
        {
          question_text: "Out of range answer",
          options: ["A", "B", "C", "D"],
          correct_index: 9,
        },
        valid,
      ],
      { requireAllValid: false },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions).toHaveLength(1);
      expect(result.rejected.length).toBe(2);
    }
  });

  it("fails closed when requireAllValid and any item fails", () => {
    const result = validateIngestQuestionsPayload(
      [
        valid,
        {
          question_text: "x",
          options: ["A", "B"],
          correct_index: 0,
        },
      ],
      { requireAllValid: true },
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("PARTIAL_VALIDATION_FAILED");
    }
  });
});
