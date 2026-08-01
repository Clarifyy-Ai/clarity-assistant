/**
 * Quantitative aptitude validators — deterministic, bank/template safe.
 */

export type QuantValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type QuantArithmeticTemplate = {
  /** Operands used by the template (e.g. dividend / divisor). */
  params: Record<string, number>;
  /** Human-readable expression for audit, e.g. "a / b". */
  expression?: string;
  options: string[];
  correct_index: number;
  /** Expected numeric answer when expression is simple arithmetic. */
  expected?: number;
};

/** True if any named divisor-like param is zero (or near-zero float). */
export function hasDivByZeroParams(
  params: Record<string, number>,
  divisorKeys: string[] = ["b", "divisor", "den", "denominator", "div"],
): boolean {
  for (const key of divisorKeys) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const v = params[key];
      if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return true;
    }
  }
  // Also catch any key containing "div" / "den" with zero value
  for (const [k, v] of Object.entries(params)) {
    if (/div|den|quo/i.test(k) && (!Number.isFinite(v) || Math.abs(v) < 1e-12)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a very small arithmetic subset: a±b, a*b, a/b with numeric literals or params.
 * Returns null if expression is not in the supported subset.
 */
export function evalSimpleArithmetic(
  expression: string,
  params: Record<string, number> = {},
): number | null {
  const expr = expression.replace(/\s+/g, "");
  const resolve = (tok: string): number | null => {
    if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
    if (Object.prototype.hasOwnProperty.call(params, tok)) {
      const v = params[tok];
      return Number.isFinite(v) ? v : null;
    }
    return null;
  };

  const m = expr.match(/^(-?\w+)([+\-*/])(-?\w+)$/);
  if (!m) return null;
  const left = resolve(m[1]);
  const right = resolve(m[3]);
  if (left == null || right == null) return null;
  switch (m[2]) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (Math.abs(right) < 1e-12) return null;
      return left / right;
    default:
      return null;
  }
}

/** Options must be unique after numeric/string normalize; correct_index must be unique match. */
export function verifyUniqueMcqAnswer(input: {
  options: string[];
  correct_index: number;
}): QuantValidationResult {
  if (!Array.isArray(input.options) || input.options.length < 2) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Need at least 2 options." };
  }
  const norm = input.options.map((o) => {
    const t = String(o ?? "").trim().toLowerCase();
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) && t !== "" ? `n:${n}` : `s:${t}`;
  });
  if (norm.some((x) => x === "s:")) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Empty option." };
  }
  if (new Set(norm).size !== norm.length) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Duplicate options." };
  }
  if (
    !Number.isInteger(input.correct_index) ||
    input.correct_index < 0 ||
    input.correct_index >= input.options.length
  ) {
    return {
      ok: false,
      code: "ANSWER_VERIFICATION_FAILED",
      message: "correct_index out of range.",
    };
  }
  // Exactly one option equals the designated correct option value
  const correctNorm = norm[input.correct_index];
  const matches = norm.filter((x) => x === correctNorm).length;
  if (matches !== 1) {
    return {
      ok: false,
      code: "ANSWER_VERIFICATION_FAILED",
      message: "Correct answer is not unique among options.",
    };
  }
  return { ok: true };
}

/**
 * Template check: reject div-by-zero params; if expression present, verify
 * computed value matches the option at correct_index (numeric tolerance).
 */
export function validateQuantTemplate(
  template: QuantArithmeticTemplate,
): QuantValidationResult {
  if (hasDivByZeroParams(template.params)) {
    return {
      ok: false,
      code: "QUANT_DIV_BY_ZERO",
      message: "Template parameters include division by zero.",
    };
  }

  const uniq = verifyUniqueMcqAnswer(template);
  if (!uniq.ok) return uniq;

  if (template.expression) {
    const computed = evalSimpleArithmetic(template.expression, template.params);
    if (computed == null) {
      return {
        ok: false,
        code: "QUANT_EXPRESSION_INVALID",
        message: "Unsupported or invalid arithmetic expression (possible div-by-zero).",
      };
    }
    const expected = template.expected ?? computed;
    if (Math.abs(expected - computed) > 1e-6) {
      return {
        ok: false,
        code: "ANSWER_VERIFICATION_FAILED",
        message: "Template expected does not match computed expression.",
      };
    }
    const opt = template.options[template.correct_index];
    const optNum = Number(String(opt).replace(/,/g, "").trim());
    if (!Number.isFinite(optNum) || Math.abs(optNum - computed) > 1e-6) {
      return {
        ok: false,
        code: "ANSWER_VERIFICATION_FAILED",
        message: "correct_index option does not match computed arithmetic result.",
      };
    }
  }

  return { ok: true };
}
