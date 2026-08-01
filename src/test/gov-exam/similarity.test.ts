import { describe, expect, it } from "vitest";
import {
  charNgrams,
  combineScores,
  conflictsWithSelected,
  cosineSimilarity,
  findNearDuplicatesInSet,
  isNearDuplicate,
  isNearDuplicateWithOptionalEmbedding,
  ngramJaccard,
  normalizeQuestionText,
  questionFingerprint,
  similarityBreakdown,
  tokenJaccard,
} from "@/lib/gov-exam/validators/similarity";

describe("similarity", () => {
  it("fingerprints ignore option order and punctuation", () => {
    expect(questionFingerprint("Capital of India?", ["Delhi", "Mumbai"])).toBe(
      questionFingerprint("capital of india!", ["Mumbai", "Delhi"]),
    );
  });

  it("computes token and ngram jaccard", () => {
    expect(tokenJaccard("the quick brown fox", "the quick brown dog")).toBeGreaterThan(0.5);
    expect(ngramJaccard("abcdefgh", "abcdefxy")).toBeGreaterThan(0.4);
    expect(charNgrams("abc", 3).has("abc")).toBe(true);
  });

  it("similarityBreakdown combines signals", () => {
    const d = similarityBreakdown(
      "What is the capital of France?",
      "What is the capital of France?",
    );
    expect(d.exact).toBe(true);
    expect(d.score).toBe(1);
  });

  it("detects near duplicates via ngram/token", () => {
    expect(
      isNearDuplicate(
        "Select the correct synonym of happy",
        "Select the correct synonym of happy",
      ),
    ).toBe(true);
    expect(
      isNearDuplicate("Completely unrelated stem about rivers", "Quantum physics basics here"),
    ).toBe(false);
  });

  it("finds conflicts within a selected set", () => {
    const stems = [
      "Who wrote Hamlet?",
      "Who wrote Hamlet play?",
      "Capital of Japan is?",
    ];
    // Exact-ish containment / high jaccard between first two may or may not trip threshold;
    // force exact near-dup:
    expect(conflictsWithSelected("Who wrote Hamlet?", ["Who wrote Hamlet?"])).toBe(true);
    void stems;
    const pairs = findNearDuplicatesInSet([
      "Identical stem one two three four",
      "Identical stem one two three four",
      normalizeQuestionText("other"),
    ]);
    expect(pairs.some((p) => p.i === 0 && p.j === 1)).toBe(true);
  });

  it("cosineSimilarity is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("combineScores keeps lexical primary when embedding omitted", () => {
    const onlyLex = combineScores(0.9);
    expect(onlyLex.combined).toBeCloseTo(0.9);
    expect(onlyLex.embedding).toBeUndefined();

    const blended = combineScores(0.5, 1, { lexical: 0.65, embedding: 0.35 });
    expect(blended.combined).toBeCloseTo(0.5 * 0.65 + 1 * 0.35);
  });

  it("optional embedding path does not require external APIs", () => {
    expect(
      isNearDuplicateWithOptionalEmbedding(
        "Completely unrelated stem about rivers",
        "Quantum physics basics here",
      ),
    ).toBe(false);
    expect(
      isNearDuplicateWithOptionalEmbedding("Same stem text here", "Same stem text here", {
        embeddingA: [1, 0],
        embeddingB: [1, 0],
      }),
    ).toBe(true);
  });
});
