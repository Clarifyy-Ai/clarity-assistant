/**
 * Client-side exam type normalization (mirrors supabase/functions/_shared/examTypeMap.ts).
 */

const CONFIG_ID_FROM_LABEL: Record<string, string> = {
  "JEE Main": "JEE_MAIN",
  "JEE Advanced": "JEE_ADV",
  "NEET UG": "NEET",
  "UPSC CSE": "UPSC",
  "SSC CGL": "SSC_CGL",
  "SSC Exams (CGL/CHSL)": "SSC_CGL",
  "Banking (IBPS/SBI/RBI)": "IBPS_PO",
  "IBPS PO": "IBPS_PO",
  "HPCL Engineer": "HPCL_ENGINEER",
  PSU: "PSU",
  APPSC: "APPSC_GROUP",
  "APPSC (Group 1/2/3/4)": "APPSC_GROUP",
  TSPSC: "TSPSC_GROUP",
  "TSPSC (Group 1/2/3/4)": "TSPSC_GROUP",
};

/** Known configure wizard exam ids (TestConfigure EXAM_SUBJECTS keys). */
export const EXAM_CONFIG_IDS = [
  "JEE_MAIN",
  "JEE_ADV",
  "NEET",
  "UPSC",
  "SSC_CGL",
  "IBPS_PO",
  "HPCL_ENGINEER",
  "PSU",
  "CUSTOM",
] as const;

export type ExamConfigId = (typeof EXAM_CONFIG_IDS)[number];

const CONFIG_ID_SET = new Set<string>(EXAM_CONFIG_IDS);

/** UI / URL param → TestConfigure `exam_type` id (JEE_MAIN, NEET, …). */
export function resolveExamConfigId(raw: string | null | undefined): string {
  const t = (raw ?? "JEE_MAIN").trim();
  if (CONFIG_ID_SET.has(t)) return t;
  if (CONFIG_ID_FROM_LABEL[t]) return CONFIG_ID_FROM_LABEL[t];
  const upper = t.replace(/\s+/g, "_").toUpperCase();
  if (CONFIG_ID_SET.has(upper)) return upper;
  return "CUSTOM";
}

/** Stored in `questions.exam_type` — matches edge mapExamType output. */
const STORAGE_FROM_CONFIG: Record<string, string> = {
  JEE_MAIN: "JEE Main",
  JEE_ADV: "JEE Advanced",
  JEE_ADVANCED: "JEE Advanced",
  NEET: "NEET UG",
  UPSC: "UPSC CSE",
  SSC_CGL: "SSC Exams (CGL/CHSL)",
  IBPS_PO: "Banking (IBPS/SBI/RBI)",
  HPCL_ENGINEER: "HPCL Engineer",
  PSU: "PSU",
  APPSC_GROUP: "APPSC (Group 1/2/3/4)",
  TSPSC_GROUP: "TSPSC (Group 1/2/3/4)",
  CUSTOM: "CUSTOM",
};

/**
 * DB display strings for admin question filters / editors.
 * Must match `questions.exam_type` values (not frontend IDs like JEE_MAIN).
 */
export const QUESTION_EXAM_TYPE_OPTIONS = [
  "JEE Main",
  "JEE Advanced",
  "NEET UG",
  "UPSC CSE",
  "SSC Exams (CGL/CHSL)",
  "Banking (IBPS/SBI/RBI)",
  "NDA",
  "GENERAL",
] as const;

export function normalizeExamTypeForStorage(configOrRaw: string | null | undefined): string | null {
  if (!configOrRaw || configOrRaw === "CUSTOM" || configOrRaw === "none") return null;
  const id = resolveExamConfigId(configOrRaw);
  return STORAGE_FROM_CONFIG[id] ?? configOrRaw;
}

/** Route param for ExamPapers: JEE_MAIN → papers browser slug */
export function examConfigIdToPapersRoute(configId: string): string {
  return resolveExamConfigId(configId);
}
