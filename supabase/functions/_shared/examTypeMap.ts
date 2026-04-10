/**
 * EXAM TYPE MAPPING
 *
 * Direction: exam_papers.exam_type  OR  frontend uppercase ID
 *            ──────────────────────────────────────────────▶
 *            questions.exam_type (what is stored in the DB)
 *
 * The select-test-questions edge function receives exam_type from the
 * exam_papers table (e.g. "SSC CGL") or a frontend ID (e.g. "SSC_CGL").
 * It must translate that value to the exact string in questions.exam_type
 * BEFORE querying the questions table.
 */

// exam_papers.exam_type  OR  frontend ID  →  questions.exam_type
const EXAM_TYPE_MAP: Record<string, string> = {
  // ── Exact exam_papers DB values ────────────────────────────────────────
  "SSC CGL":        "SSC Exams (CGL/CHSL)",
  "IBPS PO":        "Banking (IBPS/SBI/RBI)",
  "NEET UG":        "NEET UG",
  "JEE Main":       "JEE Main",
  "JEE Advanced":   "JEE Advanced",
  "UPSC CSE":       "UPSC CSE",
  "HPCL Engineer":  "HPCL Engineer",
  "PSU":            "PSU",
  "APPSC":          "APPSC (Group 1/2/3/4)",
  "TSPSC":          "TSPSC (Group 1/2/3/4)",

  // ── Frontend uppercase IDs (sent from URL params / UI) ─────────────────
  JEE_MAIN:         "JEE Main",
  JEE_ADV:          "JEE Advanced",
  NEET:             "NEET UG",
  UPSC:             "UPSC CSE",
  SSC_CGL:          "SSC Exams (CGL/CHSL)",
  IBPS_PO:          "Banking (IBPS/SBI/RBI)",
  HPCL_ENGINEER:    "HPCL Engineer",
  APPSC_GROUP:      "APPSC (Group 1/2/3/4)",
  TSPSC_GROUP:      "TSPSC (Group 1/2/3/4)",

  // ── Passthrough (same in both tables) ─────────────────────────────────
  "NEET":           "NEET UG",
  "JEE":            "JEE Main",
};

/**
 * Convert an exam_papers value or frontend exam ID →  questions.exam_type.
 * Returns the original value unchanged when no mapping is found so that
 * custom / unmapped exam types still work.
 */
export function mapExamType(input: string): string {
  const trimmed = input.trim();
  return EXAM_TYPE_MAP[trimmed] ?? trimmed;
}

// ── Reverse map: questions.exam_type  →  exam_papers.exam_type ───────────
const REVERSE_EXAM_TYPE_MAP: Record<string, string> = {
  "SSC Exams (CGL/CHSL)":   "SSC CGL",
  "Banking (IBPS/SBI/RBI)": "IBPS PO",
  "APPSC (Group 1/2/3/4)":  "APPSC",
  "TSPSC (Group 1/2/3/4)":  "TSPSC",
  "JEE Main":               "JEE Main",
  "JEE Advanced":           "JEE Advanced",
  "NEET UG":                "NEET UG",
  "UPSC CSE":               "UPSC CSE",
  "HPCL Engineer":          "HPCL Engineer",
  "PSU":                    "PSU",
};

/**
 * Convert a questions.exam_type value back to the exam_papers.exam_type value.
 * Used when displaying question source labels in the UI.
 */
export function reverseMapExamType(dbValue: string): string {
  return REVERSE_EXAM_TYPE_MAP[dbValue.trim()] ?? dbValue;
}

/** All known exam_papers.exam_type string values */
export const KNOWN_EXAM_PAPER_TYPES = Object.keys(EXAM_TYPE_MAP).filter(
  (k) => !k.includes("_") && /[a-z]/.test(k), // only mixed-case "SSC CGL" style keys
);
