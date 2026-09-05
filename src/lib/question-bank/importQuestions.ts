import { questionFingerprint } from "@/lib/gov-exam/validators/similarity";
import { LICENSE_TYPES, normalizeLicense, type LicenseType } from "@/lib/content/license";

export const QUESTION_TYPES = [
  "MCQ",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "SCENARIO",
  "BEHAVIORAL",
  "TECHNICAL",
  "CODING",
  "CASE_STUDY",
] as const;

export type BankQuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type BankDifficulty = (typeof DIFFICULTIES)[number];

export type ImportIssueCode =
  | "missing_question"
  | "missing_category"
  | "invalid_difficulty"
  | "invalid_license"
  | "invalid_answer"
  | "malformed"
  | "duplicate"
  | "missing_licensing_metadata";

export type QuestionImportRecord = {
  question: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer?: string;
  category?: string;
  topic?: string;
  difficulty?: string;
  question_type?: string;
  explanation?: string;
  source?: string;
  license?: string;
  tags?: string;
  marks?: string | number;
  negative_marks?: string | number;
  time_limit?: string | number;
};

export type ValidatedQuestion = {
  question_text: string;
  question_type: BankQuestionType;
  options: Array<{ label: string; text: string }>;
  correct_answer: string;
  category: string;
  subject: string;
  topic: string;
  difficulty: BankDifficulty;
  explanation: string | null;
  source: string;
  license_type: LicenseType;
  copyright_status: string;
  tags: string[];
  marks_positive: number;
  marks_negative: number;
  time_limit_seconds: number | null;
  fingerprint: string;
};

export type ImportRowResult = {
  index: number;
  status: "imported" | "duplicate" | "invalid" | "missing_licensing_metadata";
  code?: ImportIssueCode;
  message?: string;
  record?: ValidatedQuestion;
};

export type ImportReport = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  missingLicensingMetadata: number;
  rows: ImportRowResult[];
  records: ValidatedQuestion[];
};

const TYPE_SET = new Set<string>(QUESTION_TYPES);
const DIFF_SET = new Set<string>(DIFFICULTIES);

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeType(value: string): BankQuestionType {
  const raw = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (raw === "TRUEFALSE" || raw === "TRUE_FALSE" || raw === "T/F") return "TRUE_FALSE";
  if (raw === "MULTI_SELECT" || raw === "MULTIPLESELECT") return "MULTIPLE_SELECT";
  if (raw === "SHORT" || raw === "SHORTANSWER") return "SHORT_ANSWER";
  if (raw === "CASESTUDY") return "CASE_STUDY";
  return TYPE_SET.has(raw) ? (raw as BankQuestionType) : "MCQ";
}

function optionsFromRow(row: QuestionImportRecord): Array<{ label: string; text: string }> {
  const pairs: Array<[string, string]> = [
    ["A", asText(row.option_a)],
    ["B", asText(row.option_b)],
    ["C", asText(row.option_c)],
    ["D", asText(row.option_d)],
  ];
  return pairs.filter(([, text]) => text.length > 0).map(([label, text]) => ({ label, text }));
}

export function mapRawImportRow(raw: Record<string, unknown>): QuestionImportRecord {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      if (raw[key] != null && String(raw[key]).trim()) return raw[key];
    }
    return "";
  };
  return {
    question: asText(pick("question", "Question", "question_text", "Question_Text")),
    option_a: asText(pick("option_a", "Option_A", "A")),
    option_b: asText(pick("option_b", "Option_B", "B")),
    option_c: asText(pick("option_c", "Option_C", "C")),
    option_d: asText(pick("option_d", "Option_D", "D")),
    correct_answer: asText(pick("correct_answer", "Correct_Answer", "answer")),
    category: asText(pick("category", "Category", "subject", "Subject")),
    topic: asText(pick("topic", "Topic")),
    difficulty: asText(pick("difficulty", "Difficulty")),
    question_type: asText(pick("question_type", "Question_Type", "type")),
    explanation: asText(pick("explanation", "Explanation")),
    source: asText(pick("source", "Source")),
    license: asText(pick("license", "License", "license_type")),
    tags: asText(pick("tags", "Tags")),
    marks: pick("marks", "Marks", "marks_positive") as string | number,
    negative_marks: pick("negative_marks", "Negative_Marks", "marks_negative") as string | number,
    time_limit: pick("time_limit", "Time_Limit") as string | number,
  };
}

export function validateImportRow(
  row: QuestionImportRecord,
  existingFingerprints: Set<string>,
): ImportRowResult & { record?: ValidatedQuestion } {
  const question = asText(row.question);
  if (!question) {
    return { index: 0, status: "invalid", code: "missing_question", message: "Question text is required." };
  }
  const category = asText(row.category);
  if (!category) {
    return { index: 0, status: "invalid", code: "missing_category", message: "Category is required." };
  }

  const difficultyRaw = asText(row.difficulty).toUpperCase() || "MEDIUM";
  if (!DIFF_SET.has(difficultyRaw)) {
    return {
      index: 0,
      status: "invalid",
      code: "invalid_difficulty",
      message: `Invalid difficulty "${row.difficulty}". Use EASY, MEDIUM, or HARD.`,
    };
  }

  if (!asText(row.license)) {
    return {
      index: 0,
      status: "missing_licensing_metadata",
      code: "missing_licensing_metadata",
      message: "License is required (ORIGINAL, USER_OWNED, PUBLIC_DOMAIN, LICENSED, INTERNAL).",
    };
  }

  const license = normalizeLicense(row.license);
  if (!(LICENSE_TYPES as readonly string[]).includes(license)) {
    return { index: 0, status: "invalid", code: "invalid_license", message: "Invalid license type." };
  }

  const questionType = normalizeType(asText(row.question_type) || "MCQ");
  const options = optionsFromRow(row);
  let correct = asText(row.correct_answer).toUpperCase();

  if (questionType === "MCQ" || questionType === "TRUE_FALSE") {
    if (!correct) {
      return { index: 0, status: "invalid", code: "invalid_answer", message: "Correct answer is required." };
    }
    const labels = options.map((o) => o.label);
    if (options.length >= 2 && !labels.includes(correct) && !["TRUE", "FALSE", "A", "B"].includes(correct)) {
      return {
        index: 0,
        status: "invalid",
        code: "invalid_answer",
        message: `Correct answer "${row.correct_answer}" is not one of the options.`,
      };
    }
    if (questionType === "TRUE_FALSE") {
      if (["TRUE", "T", "YES"].includes(correct)) correct = "A";
      if (["FALSE", "F", "NO"].includes(correct)) correct = "B";
    }
  }

  if (questionType === "MCQ" && options.length < 2) {
    return { index: 0, status: "invalid", code: "malformed", message: "MCQ records need at least options A and B." };
  }

  if (questionType === "TRUE_FALSE" && options.length < 2) {
    options.push(
      { label: "A", text: "True" },
      { label: "B", text: "False" },
    );
  }

  const fingerprint = questionFingerprint(
    question,
    options.map((o) => o.text),
  );
  if (existingFingerprints.has(fingerprint)) {
    return { index: 0, status: "duplicate", code: "duplicate", message: "Duplicate question." };
  }

  const record: ValidatedQuestion = {
    question_text: question,
    question_type: questionType,
    options,
    correct_answer: correct || "A",
    category,
    subject: category,
    topic: asText(row.topic) || category,
    difficulty: difficultyRaw as BankDifficulty,
    explanation: asText(row.explanation) || null,
    source: asText(row.source) || "USER_UPLOAD",
    license_type: license,
    copyright_status: license,
    tags: parseTags(row.tags),
    marks_positive: Number(row.marks) > 0 ? Number(row.marks) : 4,
    marks_negative: Number(row.negative_marks) >= 0 ? Number(row.negative_marks) : 1,
    time_limit_seconds: Number(row.time_limit) > 0 ? Number(row.time_limit) : null,
    fingerprint,
  };

  return { index: 0, status: "imported", record };
}

export function buildImportReport(
  rows: QuestionImportRecord[],
  existingFingerprints: string[] = [],
): ImportReport {
  const fingerprints = new Set(existingFingerprints.map((f) => f.trim()).filter(Boolean));
  const results: ImportRowResult[] = [];
  const records: ValidatedQuestion[] = [];

  rows.forEach((row, index) => {
    const result = validateImportRow(row, fingerprints);
    result.index = index + 1;
    if (result.status === "imported" && result.record) {
      fingerprints.add(result.record.fingerprint);
      records.push(result.record);
    }
    results.push(result);
  });

  return {
    total: rows.length,
    imported: results.filter((r) => r.status === "imported").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    missingLicensingMetadata: results.filter((r) => r.status === "missing_licensing_metadata").length,
    rows: results,
    records,
  };
}

export function formatImportReport(report: ImportReport): string {
  return [
    `Total records: ${report.total}`,
    "",
    `Imported: ${report.imported}`,
    `Duplicates: ${report.duplicates}`,
    `Invalid: ${report.invalid}`,
    `Missing licensing metadata: ${report.missingLicensingMetadata}`,
  ].join("\n");
}

export function parseCsvText(text: string): Record<string, unknown>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function toBankInsert(record: ValidatedQuestion, userId: string) {
  return {
    question_text: record.question_text,
    question_type: record.question_type,
    options: record.options,
    correct_answer: record.correct_answer,
    explanation: record.explanation,
    subject: record.subject,
    topic: record.topic,
    category: record.category,
    difficulty: record.difficulty,
    exam_type: "CLARIFY_ORIGINAL",
    source: record.source === "ORIGINAL" ? "ORIGINAL" : "USER_UPLOAD",
    marks_positive: record.marks_positive,
    marks_negative: record.marks_negative,
    time_limit_seconds: record.time_limit_seconds,
    tags: record.tags,
    license_type: record.license_type,
    copyright_status: record.copyright_status,
    content_owner: userId,
    created_by: userId,
    uploaded_by: userId,
    is_public: false,
    publish_status: "draft",
  };
}
