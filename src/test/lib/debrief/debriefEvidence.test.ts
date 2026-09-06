import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDebriefEvidenceCorpus,
  classifyDebriefEligibility,
  validateDebriefEvidence,
} from "@/lib/debrief/debriefEvidence";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("validateDebriefEvidence", () => {
  const corpus = buildDebriefEvidenceCorpus({
    answers: [
      {
        id: "ans-1",
        question_index: 0,
        question_text: "Tell me about a conflict at work.",
        transcript:
          "I mediated a dispute between two engineers by scheduling a retro and documenting the outcome.",
      },
    ],
    transcripts: [],
  });

  it("accepts real excerpts from the corpus", () => {
    const issues = validateDebriefEvidence({
      corpus,
      answerIds: new Set(["ans-1"]),
      questionIndices: new Set([0]),
      transcriptEvidenceQuotes: [
        "I mediated a dispute between two engineers by scheduling a retro",
      ],
      referencedAnswerIds: ["ans-1"],
      referencedQuestionIndices: [0],
      hasVerifiedFillers: false,
      hasVerifiedWpm: false,
    });
    expect(issues).toEqual([]);
  });

  it("rejects fabricated quotes", () => {
    const issues = validateDebriefEvidence({
      corpus,
      answerIds: new Set(["ans-1"]),
      questionIndices: new Set([0]),
      transcriptEvidenceQuotes: [
        "I single-handedly rewrote the entire platform overnight with zero bugs",
      ],
      hasVerifiedFillers: false,
      hasVerifiedWpm: false,
    });
    expect(issues.some((i) => i.code === "EVIDENCE_QUOTE_MISMATCH")).toBe(true);
  });

  it("treats unknown question indices as non-fatal", () => {
    const issues = validateDebriefEvidence({
      corpus,
      answerIds: new Set(["ans-1"]),
      questionIndices: new Set([0]),
      transcriptEvidenceQuotes: [],
      referencedAnswerIds: ["missing"],
      referencedQuestionIndices: [99],
      hasVerifiedFillers: false,
      hasVerifiedWpm: false,
    });
    expect(issues.some((i) => i.code === "EVIDENCE_ANSWER_UNKNOWN")).toBe(false);
    expect(issues.some((i) => i.code === "EVIDENCE_QUESTION_UNKNOWN")).toBe(false);
  });

  it("accepts 1-based question indices (Q1 → index 1)", () => {
    const issues = validateDebriefEvidence({
      corpus,
      answerIds: new Set(["ans-1"]),
      questionIndices: new Set([0]),
      transcriptEvidenceQuotes: [],
      referencedQuestionIndices: [1],
      hasVerifiedFillers: false,
      hasVerifiedWpm: false,
    });
    expect(issues.some((i) => i.code === "EVIDENCE_QUESTION_UNKNOWN")).toBe(false);
  });

  it("accepts paraphrased quotes with punctuation differences", () => {
    const issues = validateDebriefEvidence({
      corpus,
      answerIds: new Set(["ans-1"]),
      questionIndices: new Set([0]),
      transcriptEvidenceQuotes: [
        "I mediated a dispute between two engineers, scheduling a retro and documenting the outcome",
      ],
      hasVerifiedFillers: false,
      hasVerifiedWpm: false,
    });
    expect(issues).toEqual([]);
  });

  it("rejects unverified filler claims", () => {
    const issues = validateDebriefEvidence({
      corpus,
      answerIds: new Set(["ans-1"]),
      questionIndices: new Set([0]),
      transcriptEvidenceQuotes: [],
      hasVerifiedFillers: false,
      hasVerifiedWpm: false,
      aiClaimsFillers: true,
    });
    expect(issues.some((i) => i.code === "UNSUPPORTED_AUDIO_METRIC")).toBe(true);
  });
});

describe("classifyDebriefEligibility", () => {
  it("flags incomplete sessions", () => {
    expect(
      classifyDebriefEligibility({
        status: "active",
        hasQuestions: true,
        hasMeaningfulAnswers: true,
        hasTranscript: false,
      }),
    ).toBe("SESSION_INCOMPLETE");
  });

  it("flags incomplete sessions when status is null but lifecycle is active", () => {
    expect(
      classifyDebriefEligibility({
        status: null,
        lifecycle_status: "active",
        hasQuestions: true,
        hasMeaningfulAnswers: true,
        hasTranscript: false,
      }),
    ).toBe("SESSION_INCOMPLETE");
  });

  it("maps empty evidence to NOT_SCORED when questions exist", () => {
    expect(
      classifyDebriefEligibility({
        status: "completed",
        hasQuestions: true,
        hasMeaningfulAnswers: false,
        hasTranscript: false,
      }),
    ).toBe("NOT_SCORED");
  });

  it("maps zero questions to NOT_ELIGIBLE_NO_QUESTIONS", () => {
    expect(
      classifyDebriefEligibility({
        status: "completed",
        hasQuestions: false,
        hasMeaningfulAnswers: false,
        hasTranscript: false,
      }),
    ).toBe("NOT_ELIGIBLE_NO_QUESTIONS");
  });
});

describe("normalizeDebrief / UI genuine contracts", () => {
  it("generate-debrief does not invent grade C or skill-gap defaults", () => {
    const source = fs.readFileSync(
      path.join(root, "supabase/functions/generate-debrief/index.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\|\|\s*"C"/);
    expect(source).toContain("if (!hasCurrent || !hasTarget) return null");
    expect(source).toContain('Total filler words: ${fillers ?? "N/A"}');
  });

  it("Debrief analytics radar source must not use ?? 0 for scores", () => {
    const panels = fs.readFileSync(
      path.join(root, "src/components/debrief/DebriefAnalyticsPanels.tsx"),
      "utf8",
    );
    expect(panels).not.toMatch(/scores\[d\.key\]\s*\?\?\s*0/);
    expect(panels).toContain("canShowRadar");
    expect(panels).toContain(
      "Communication audio metrics were not available for this session.",
    );
  });
});
