// Maps exam_papers table values → questions table values
// The select-test-questions function receives exam_type from exam_papers
// and needs to query the questions table, which uses different naming.
const EXAM_TYPE_MAP: Record<string, string> = {
  // exam_papers value → questions table value
  "SSC CGL":    "SSC Exams (CGL/CHSL)",
  "IBPS PO":    "Banking (IBPS/SBI/RBI)",
  "NEET UG":    "NEET UG",
  "JEE Main":   "JEE Main",
  "JEE Advanced": "JEE Advanced",
  "UPSC CSE":   "UPSC CSE",
  "HPCL Engineer": "HPCL Engineer",
  "PSU":        "PSU",
  "APPSC":      "APPSC (Group 1/2/3/4)",
  "TSPSC":      "TSPSC (Group 1/2/3/4)",
  // Frontend uppercase IDs → questions table values
  JEE_MAIN:     "JEE Main",
  JEE_ADV:      "JEE Advanced",
  NEET:         "NEET UG",
  UPSC:         "UPSC CSE",
  SSC_CGL:      "SSC Exams (CGL/CHSL)",
  IBPS_PO:      "Banking (IBPS/SBI/RBI)",
  HPCL_ENGINEER: "HPCL Engineer",
};

/** Convert an exam_papers or frontend exam ID to the questions table exam_type value. */
export function mapExamType(frontendId: string): string {
  return EXAM_TYPE_MAP[frontendId] ?? frontendId;
}

/** Reverse: questions table value → exam_papers value */
const REVERSE: Record<string, string> = {
  "SSC Exams (CGL/CHSL)": "SSC CGL",
  "Banking (IBPS/SBI/RBI)": "IBPS PO",
  "APPSC (Group 1/2/3/4)": "APPSC",
  "TSPSC (Group 1/2/3/4)": "TSPSC",
};

export function reverseMapExamType(dbValue: string): string {
  return REVERSE[dbValue] ?? dbValue;
}
