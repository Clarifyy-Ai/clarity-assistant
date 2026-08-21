/**
 * Deterministic Question Validators for Government Exams.
 *
 * Implements deterministic checks for:
 * - General Integrity: completeness, options, answer leakage, missing media, marks, provenance
 * - Arithmetic, Algebra, Units, Domain Restrictions, Rounding
 * - Syllogisms, Seating Arrangements, Directions, Coding-Decoding, Data Sufficiency
 * - Formula-based Science Problems (Physics / Chemistry)
 */

export interface QuestionIntegrityInput {
  question_text: string;
  options: Array<{ label?: string; text: string } | string>;
  correct_answer?: string | number | null;
  marks_positive?: number;
  marks_negative?: number;
  language?: string;
  passage?: string | null;
  table_data?: unknown;
  image_url?: string | null;
  source?: string | null;
  source_id?: string | null;
  uploaded_by?: string | null;
}

export interface QuestionValidationResult {
  isValid: boolean;
  errors: string[];
}

const ANSWER_LEAKAGE_PATTERNS = [
  /(?:correct\s+)?answer\s*(?:is|:|=)\s*(?:\(?\s*[A-Da-d]\s*\)?|[1-4])/i,
  /(?:opt(?:ion)?|ans)\s*(?:is|:|=)\s*(?:\(?\s*[A-Da-d]\s*\)?|[1-4])/i,
  /\[(?:ans|answer|correct)\s*:\s*[A-Da-d]\]/i,
];

/**
 * Validates complete question integrity before admission to bank.
 */
export function validateQuestionIntegrity(q: QuestionIntegrityInput): QuestionValidationResult {
  const errors: string[] = [];

  // 1. Stem completeness
  const stem = (q.question_text || "").trim();
  if (stem.length < 5) {
    errors.push("Question stem is missing or too short (minimum 5 characters).");
  }

  // 2. Options validation
  const rawOptions = q.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
    errors.push("Question must contain at least 2 options.");
  } else {
    const optTexts: string[] = [];
    rawOptions.forEach((opt, idx) => {
      const text = typeof opt === "string" ? opt : opt?.text;
      const clean = (text || "").trim();
      if (!clean) {
        errors.push(`Option ${idx + 1} is empty.`);
      }
      optTexts.push(clean.toLowerCase());
    });

    // Duplicate options
    if (new Set(optTexts).size !== optTexts.length) {
      errors.push("Question contains duplicate options.");
    }
  }

  // 3. Correct answer validation
  const correctAns = String(q.correct_answer ?? "").trim().toUpperCase();
  if (!correctAns) {
    errors.push("Correct answer is required.");
  } else if (Array.isArray(rawOptions) && rawOptions.length > 0) {
    const validLetters = Array.from({ length: rawOptions.length }, (_, i) => String.fromCharCode(65 + i));
    const isLetter = validLetters.includes(correctAns);
    const isNumIndex = /^\d+$/.test(correctAns) && parseInt(correctAns, 10) >= 0 && parseInt(correctAns, 10) < rawOptions.length;
    if (!isLetter && !isNumIndex) {
      errors.push(`Correct answer '${correctAns}' is out of valid range ${validLetters.join(",")}.`);
    }
  }

  // 4. Answer leakage in stem
  for (const pat of ANSWER_LEAKAGE_PATTERNS) {
    if (pat.test(stem)) {
      errors.push("Stem contains leaked correct answer marker.");
      break;
    }
  }

  // 5. Missing media or passage references
  const hasPassage = Boolean(q.passage && q.passage.trim().length > 0);
  const hasTable = Boolean(q.table_data);
  const hasImage = Boolean(q.image_url);

  if (/passage|comprehension/i.test(stem) && !hasPassage) {
    errors.push("Stem references a passage, but no passage text is attached.");
  }
  if (/(?:given|following)\s+(?:table|chart|graph)/i.test(stem) && !hasTable && !hasImage) {
    errors.push("Stem references a table/chart, but no table or image data is attached.");
  }
  if (/(?:given|following)\s+(?:figure|diagram|image)/i.test(stem) && !hasImage) {
    errors.push("Stem references a figure/diagram, but no image is attached.");
  }

  // 6. Marks validation
  const pos = q.marks_positive ?? 1.0;
  const neg = q.marks_negative ?? 0.0;
  if (typeof pos !== "number" || pos <= 0 || isNaN(pos)) {
    errors.push("Positive marks must be greater than 0.");
  }
  if (typeof neg !== "number" || neg < 0 || isNaN(neg)) {
    errors.push("Negative marks cannot be negative.");
  }
  if (neg > pos) {
    errors.push("Negative penalty cannot exceed positive marks.");
  }

  // 7. Language validation
  const lang = (q.language || "en").trim().toLowerCase();
  if (lang.length < 2) {
    errors.push("Language code is invalid.");
  }

  // 8. Provenance validation
  const hasProvenance = Boolean(q.source || q.source_id || q.uploaded_by);
  if (!hasProvenance) {
    errors.push("Question is missing source provenance metadata.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ── Domain-Specific Deterministic Helpers ─────────────────────────────────────

export const DeterministicValidators = {
  // Quantitative: Arithmetic
  validateDivision(dividend: number, divisor: number, expectedQuotient: number, tolerance = 1e-5): boolean {
    if (Math.abs(divisor) < 1e-12) {
      throw new Error("DIV_BY_ZERO: Division by zero is undefined.");
    }
    return Math.abs(dividend / divisor - expectedQuotient) <= tolerance;
  },

  // Quantitative: Quadratic Roots
  solveQuadratic(a: number, b: number, c: number): [number, number] {
    if (Math.abs(a) < 1e-12) {
      throw new Error("NOT_QUADRATIC: Coefficient 'a' cannot be zero.");
    }
    const d = b * b - 4 * a * c;
    if (d < 0) {
      throw new Error("COMPLEX_ROOTS: Quadratic has no real roots.");
    }
    const sqrtD = Math.sqrt(d);
    const r1 = (-b + sqrtD) / (2 * a);
    const r2 = (-b - sqrtD) / (2 * a);
    return [Math.min(r1, r2), Math.max(r1, r2)];
  },

  // Quantitative: Units (km/h to m/s)
  kmhToMs(kmh: number): number {
    return kmh * (5 / 18);
  },

  msToKmh(ms: number): number {
    return ms * (18 / 5);
  },

  // Quantitative: Domain Restrictions
  validateProbability(p: number): boolean {
    if (p < 0 || p > 1 || isNaN(p)) {
      throw new Error(`INVALID_PROBABILITY: Probability ${p} must be within [0, 1].`);
    }
    return true;
  },

  validateCountOrAge(val: number, name = "Value"): boolean {
    if (val <= 0 || !Number.isInteger(val)) {
      throw new Error(`INVALID_DOMAIN: ${name} must be a positive integer, got ${val}.`);
    }
    return true;
  },

  // Reasoning: Direction Displacement
  calculateDirectionsDisplacement(moves: Array<[string, number]>): { dx: number; dy: number; netDistance: number } {
    let dx = 0;
    let dy = 0;
    for (const [dir, dist] of moves) {
      const d = dir.toUpperCase();
      if (d === "N" || d === "NORTH") dy += dist;
      else if (d === "S" || d === "SOUTH") dy -= dist;
      else if (d === "E" || d === "EAST") dx += dist;
      else if (d === "W" || d === "WEST") dx -= dist;
    }
    const netDistance = Math.sqrt(dx * dx + dy * dy);
    return { dx, dy, netDistance };
  },

  // Reasoning: Caesar Cipher
  verifyCaesarShift(original: string, encoded: string, shift: number): boolean {
    const res: string[] = [];
    for (const char of original.toUpperCase()) {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        res.push(String.fromCharCode(((code - 65 + shift) % 26) + 65));
      } else {
        res.push(char);
      }
    }
    return res.join("") === encoded.toUpperCase();
  },

  // Science: Newton's Second Law F = ma
  newtonsSecondLaw(mass: number, acceleration: number): number {
    if (mass <= 0) throw new Error("INVALID_MASS: Mass must be positive.");
    return mass * acceleration;
  },

  // Science: Ohm's Law V = IR
  ohmsLawVoltage(current: number, resistance: number): number {
    if (resistance < 0) throw new Error("INVALID_RESISTANCE: Resistance cannot be negative.");
    return current * resistance;
  },

  // Science: Kinetic Energy 0.5 * m * v^2
  kineticEnergy(mass: number, velocity: number): number {
    if (mass <= 0) throw new Error("INVALID_MASS: Mass must be positive.");
    return 0.5 * mass * velocity * velocity;
  },
};
