import { describe, expect, it } from "vitest";
import {
  validateLinearSeatingUniqueness,
  validateSyllogismUniqueness,
} from "@/lib/gov-exam/validators/reasoningValidator";

describe("reasoningValidator syllogism stub", () => {
  it("exposes clear uniqueness API and rejects duplicate conclusions", () => {
    const ok = validateSyllogismUniqueness({
      premises: [{ quantifier: "all", subject: "dogs", predicate: "animals" }],
      conclusions: ["All dogs are animals", "Some cats are dogs"],
      correct_index: 0,
    });
    expect(ok).toEqual({ ok: true, solutionCount: 1 });

    const dup = validateSyllogismUniqueness({
      premises: [{ quantifier: "all", subject: "dogs", predicate: "animals" }],
      conclusions: ["Same", "same"],
      correct_index: 0,
    });
    expect(dup.ok).toBe(false);
    if (dup.ok === false) expect(dup.code).toBe("REASONING_SYLLOGISM_MULTI");
  });
});

describe("reasoningValidator seating uniqueness", () => {
  it("accepts uniquely solvable tiny puzzles", () => {
    const r = validateLinearSeatingUniqueness({
      people: ["A", "B", "C"],
      constraints: [
        { type: "left_of", a: "A", b: "B" },
        { type: "left_of", a: "B", b: "C" },
      ],
    });
    expect(r).toEqual({ ok: true, solutionCount: 1 });
  });

  it("rejects no-solution puzzles", () => {
    const r = validateLinearSeatingUniqueness({
      people: ["A", "B"],
      constraints: [
        { type: "left_of", a: "A", b: "B" },
        { type: "left_of", a: "B", b: "A" },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("REASONING_NO_SOLUTION");
  });

  it("rejects multi-solution puzzles", () => {
    const r = validateLinearSeatingUniqueness({
      people: ["A", "B", "C"],
      constraints: [{ type: "adjacent", a: "A", b: "B" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.code).toBe("REASONING_MULTI_SOLUTION");
      expect((r.solutionCount ?? 0) > 1).toBe(true);
    }
  });
});
