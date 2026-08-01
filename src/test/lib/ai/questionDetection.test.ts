import { describe, it, expect } from "vitest";
import {
  detectQuestion,
  hintIdempotencyKey,
  questionFingerprint,
} from "@/lib/ai/questionDetection";

describe("questionDetection", () => {
  it("normalizes fingerprints for near-duplicate questions", () => {
    const a = questionFingerprint("Tell me about a time you led a team?");
    const b = questionFingerprint("  tell me about a time you led a team?! ");
    expect(a).toBe(b);
  });

  it("builds stable hint idempotency keys", () => {
    const q = "What is your greatest strength?";
    expect(hintIdempotencyKey("sess-1", q)).toBe(
      hintIdempotencyKey("sess-1", "what is your greatest strength?"),
    );
    expect(hintIdempotencyKey("sess-1", q)).not.toBe(
      hintIdempotencyKey("sess-2", q),
    );
  });

  it("returns explicit questions with fingerprint", async () => {
    const detected = await detectQuestion({
      transcript: "",
      explicitQuestionText: "Why this role?",
    });
    expect(detected?.source).toBe("explicit");
    expect(detected?.fingerprint).toBe(questionFingerprint("Why this role?"));
  });

  it("skips already-seen fingerprints", async () => {
    const seen = new Set([questionFingerprint("Why this role?")]);
    const detected = await detectQuestion({
      transcript: "Why this role? What are your strengths?",
      seenFingerprints: seen,
    });
    expect(detected?.questionText).toMatch(/strengths/i);
  });
});
