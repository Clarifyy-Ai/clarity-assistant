/**
 * Reasoning validators — syllogism uniqueness stub + tiny seating uniqueness.
 */

export type ReasoningValidationResult =
  | { ok: true; solutionCount: number }
  | { ok: false; code: string; message: string; solutionCount?: number };

/** Structured syllogism premises (stub — expand later with full Venn engine). */
export type SyllogismPremise = {
  /** "all" | "some" | "no" | "some_not" */
  quantifier: "all" | "some" | "no" | "some_not";
  subject: string;
  predicate: string;
};

export type SyllogismProblem = {
  premises: SyllogismPremise[];
  /** Candidate conclusions; exactly one should follow in a well-formed MCQ. */
  conclusions: string[];
  /** Index claimed correct by authoring/bank. */
  correct_index: number;
};

/**
 * Syllogism uniqueness stub.
 * Clear API for future full solver; current pilot only rejects obvious
 * duplicate conclusions and out-of-range indices. Does not claim full logic entailment.
 */
export function validateSyllogismUniqueness(
  problem: SyllogismProblem,
): ReasoningValidationResult {
  if (!problem.premises?.length) {
    return {
      ok: false,
      code: "REASONING_SYLLOGISM_INVALID",
      message: "Syllogism requires at least one premise.",
      solutionCount: 0,
    };
  }
  if (!Array.isArray(problem.conclusions) || problem.conclusions.length < 2) {
    return {
      ok: false,
      code: "REASONING_SYLLOGISM_INVALID",
      message: "Need at least 2 conclusion options.",
      solutionCount: 0,
    };
  }
  const norm = problem.conclusions.map((c) =>
    c.trim().toLowerCase().replace(/\s+/g, " "),
  );
  if (new Set(norm).size !== norm.length) {
    return {
      ok: false,
      code: "REASONING_SYLLOGISM_MULTI",
      message: "Duplicate conclusion options — uniqueness failed.",
      solutionCount: 0,
    };
  }
  if (
    !Number.isInteger(problem.correct_index) ||
    problem.correct_index < 0 ||
    problem.correct_index >= problem.conclusions.length
  ) {
    return {
      ok: false,
      code: "ANSWER_VERIFICATION_FAILED",
      message: "correct_index out of range.",
      solutionCount: 0,
    };
  }
  // Stub: treat as uniquely solvable when structure is clean.
  return { ok: true, solutionCount: 1 };
}

export type SeatingPerson = string;
export type SeatingConstraint =
  | { type: "left_of"; a: string; b: string }
  | { type: "right_of"; a: string; b: string }
  | { type: "adjacent"; a: string; b: string }
  | { type: "ends"; person: string }
  | { type: "not_adjacent"; a: string; b: string };

export type LinearSeatingPuzzle = {
  /** Ordered seat count = people.length (tiny: ≤5 for exhaustive search). */
  people: SeatingPerson[];
  constraints: SeatingConstraint[];
};

function satisfies(order: string[], c: SeatingConstraint): boolean {
  const idx = (p: string) => order.indexOf(p);
  switch (c.type) {
    case "left_of": {
      const ia = idx(c.a);
      const ib = idx(c.b);
      return ia >= 0 && ib >= 0 && ia < ib;
    }
    case "right_of": {
      const ia = idx(c.a);
      const ib = idx(c.b);
      return ia >= 0 && ib >= 0 && ia > ib;
    }
    case "adjacent": {
      const ia = idx(c.a);
      const ib = idx(c.b);
      return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
    }
    case "not_adjacent": {
      const ia = idx(c.a);
      const ib = idx(c.b);
      return ia >= 0 && ib >= 0 && Math.abs(ia - ib) !== 1;
    }
    case "ends": {
      const i = idx(c.person);
      return i === 0 || i === order.length - 1;
    }
    default:
      return false;
  }
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) {
      out.push([arr[i], ...p]);
    }
  }
  return out;
}

/**
 * Exhaustive uniqueness check for tiny linear seating puzzles (≤5 people).
 * Rejects no-solution and multi-solution cases.
 */
export function validateLinearSeatingUniqueness(
  puzzle: LinearSeatingPuzzle,
): ReasoningValidationResult {
  const people = puzzle.people.map((p) => p.trim()).filter(Boolean);
  if (people.length < 2 || people.length > 5) {
    return {
      ok: false,
      code: "REASONING_SEATING_UNSUPPORTED",
      message: "Linear seating uniqueness supports 2–5 people only.",
      solutionCount: 0,
    };
  }
  if (new Set(people.map((p) => p.toLowerCase())).size !== people.length) {
    return {
      ok: false,
      code: "REASONING_SEATING_INVALID",
      message: "Duplicate person labels.",
      solutionCount: 0,
    };
  }

  let solutionCount = 0;
  for (const order of permutations(people)) {
    if (puzzle.constraints.every((c) => satisfies(order, c))) {
      solutionCount += 1;
      if (solutionCount > 1) break;
    }
  }

  if (solutionCount === 0) {
    return {
      ok: false,
      code: "REASONING_NO_SOLUTION",
      message: "Seating constraints admit no solution.",
      solutionCount: 0,
    };
  }
  if (solutionCount > 1) {
    return {
      ok: false,
      code: "REASONING_MULTI_SOLUTION",
      message: "Seating constraints admit multiple solutions.",
      solutionCount,
    };
  }
  return { ok: true, solutionCount: 1 };
}
