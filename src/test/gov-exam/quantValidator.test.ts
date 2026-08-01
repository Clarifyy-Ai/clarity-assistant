import { describe, expect, it } from "vitest";
import {
  evalSimpleArithmetic,
  hasDivByZeroParams,
  validateQuantTemplate,
  verifyUniqueMcqAnswer,
} from "@/lib/gov-exam/validators/quantValidator";

describe("quantValidator", () => {
  it("rejects div-by-zero style params", () => {
    expect(hasDivByZeroParams({ a: 10, b: 0 })).toBe(true);
    expect(hasDivByZeroParams({ a: 10, divisor: 0 })).toBe(true);
    expect(hasDivByZeroParams({ a: 10, b: 2 })).toBe(false);
  });

  it("evaluates simple arithmetic templates", () => {
    expect(evalSimpleArithmetic("a/b", { a: 10, b: 2 })).toBe(5);
    expect(evalSimpleArithmetic("a/b", { a: 10, b: 0 })).toBeNull();
    expect(evalSimpleArithmetic("3+4")).toBe(7);
    expect(evalSimpleArithmetic("a*b", { a: 3, b: 4 })).toBe(12);
  });

  it("verifies unique MCQ answers", () => {
    expect(
      verifyUniqueMcqAnswer({ options: ["1", "2", "3", "4"], correct_index: 1 }).ok,
    ).toBe(true);
    expect(
      verifyUniqueMcqAnswer({ options: ["2", "2", "3"], correct_index: 0 }).ok,
    ).toBe(false);
  });

  it("validates quant template end-to-end", () => {
    const ok = validateQuantTemplate({
      params: { a: 12, b: 3 },
      expression: "a/b",
      options: ["2", "3", "4", "5"],
      correct_index: 2,
    });
    expect(ok).toEqual({ ok: true });

    const bad = validateQuantTemplate({
      params: { a: 12, b: 0 },
      expression: "a/b",
      options: ["2", "3", "4", "5"],
      correct_index: 0,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("QUANT_DIV_BY_ZERO");
  });
});
