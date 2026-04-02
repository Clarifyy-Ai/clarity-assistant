// Maps frontend uppercase IDs → database human-readable values
const EXAM_TYPE_MAP: Record<string, string> = {
  JEE_MAIN: "JEE Main",
  JEE_ADV: "JEE Advanced",
  NEET: "NEET UG",
  UPSC: "UPSC CSE",
  SSC_CGL: "SSC CGL",
  IBPS_PO: "IBPS PO",
  HPCL_ENGINEER: "HPCL Engineer",
  PSU: "PSU",
};

/** Convert a frontend exam ID to the DB value. Falls through if already correct or unknown. */
export function mapExamType(frontendId: string): string {
  return EXAM_TYPE_MAP[frontendId] ?? frontendId;
}

/** Reverse: DB value → frontend ID */
const REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(EXAM_TYPE_MAP).map(([k, v]) => [v, k])
);

export function reverseMapExamType(dbValue: string): string {
  return REVERSE[dbValue] ?? dbValue;
}
