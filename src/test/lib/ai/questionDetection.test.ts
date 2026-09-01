import { describe, it, expect } from "vitest";
import {
  detectQuestion,
  hintIdempotencyKey,
  questionFingerprint,
  beginAutoHintIfIdle,
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

  it("emits idempotency keys accepted by edge regex (no spaces)", () => {
    const key = hintIdempotencyKey(
      "1d872c16-f7ff-4c03-b6e5-b20c093d08e9",
      "tell me what is testing and how many types are there",
    );
    expect(key).toMatch(/^[A-Za-z0-9._:-]{16,150}$/);
    expect(key.includes(" ")).toBe(false);
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

  it("claims auto-hint once per fingerprint while in flight", () => {
    const inflight = { current: new Set<string>() };
    const fp = questionFingerprint("Why this role?");
    expect(beginAutoHintIfIdle(inflight, fp)).toBe(true);
    expect(beginAutoHintIfIdle(inflight, fp)).toBe(false);
    expect(beginAutoHintIfIdle(inflight, "")).toBe(false);
    const other = questionFingerprint("What are your strengths?");
    expect(beginAutoHintIfIdle(inflight, other)).toBe(true);
    expect(beginAutoHintIfIdle(inflight, fp)).toBe(false);
  });
});
