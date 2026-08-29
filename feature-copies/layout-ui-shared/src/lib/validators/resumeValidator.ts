// ─────────────────────────────────────────────────────────────────────────────
// resumeValidator.ts — Validate resume files, job descriptions, and
// interview context data before sending to AI or storing in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import type { ValidationResult } from "./emailValidator";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RESUME_SIZE_MB     = 10;
const MAX_RESUME_SIZE_BYTES  = MAX_RESUME_SIZE_MB * 1024 * 1024;
const MAX_JD_LENGTH          = 10000;  // characters
const MIN_JD_LENGTH          = 50;
const MAX_RESUME_TEXT_LENGTH = 15000;
const MIN_RESUME_TEXT_LENGTH = 100;
const MAX_COMPANY_LENGTH     = 100;
const MAX_ROLE_LENGTH        = 150;
const MAX_QUESTION_LENGTH    = 2000;
const MIN_QUESTION_LENGTH    = 5;
const MAX_ANSWER_LENGTH      = 5000;
const MAX_TAGS               = 10;
const MAX_TAG_LENGTH         = 30;

const SUPPORTED_RESUME_TYPES: Record<string, string> = {
  "application/pdf":         "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain":              "TXT",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResumeValidationResult extends ValidationResult {
  detectedFormat?: string;
  estimatedPages?: number;
  warnings?:       string[];
}

export interface JDValidationResult extends ValidationResult {
  wordCount?:  number;
  warnings?:   string[];
}

export interface InterviewContextData {
  jobTitle?:       string;
  company?:        string;
  jobDescription?: string;
  resumeText?:     string;
  interviewType?:  string;
  targetRole?:     string;
  techStack?:      string[];
  yearsOfExp?:     number;
}

export interface InterviewContextErrors {
  jobTitle?:       string;
  company?:        string;
  jobDescription?: string;
  resumeText?:     string;
  interviewType?:  string;
  yearsOfExp?:     string;
  techStack?:      string;
}

export interface QuestionAnswerPair {
  question: string;
  answer?:  string;
  tags?:    string[];
}

// ─── Resume File ──────────────────────────────────────────────────────────────

/**
 * Validate a resume file before upload.
 * Checks file type, size, and basic integrity.
 *
 * @example
 * const result = validateResumeFile(file);
 * if (!result.valid) toast.error(result.error);
 */
export function validateResumeFile(file: File): ResumeValidationResult {
  if (!file) {
    return { valid: false, error: "Please select a resume file." };
  }

  if (file.size === 0) {
    return { valid: false, error: "Resume file is empty. Please upload a valid document." };
  }

  if (file.size > MAX_RESUME_SIZE_BYTES) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `Resume is too large (${sizeMB}MB). Maximum size is ${MAX_RESUME_SIZE_MB}MB. Try compressing your PDF.`,
    };
  }

  const format = SUPPORTED_RESUME_TYPES[file.type];
  if (!format) {
    // Try extension fallback for browsers that don't report MIME correctly
    const ext = file.name.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      pdf: "PDF", docx: "DOCX", txt: "TXT",
    };

    if (!ext || !extMap[ext]) {
      return {
        valid: false,
        error: "Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
      };
    }

    return {
      valid:           true,
      detectedFormat:  extMap[ext],
      warnings:        ["File type could not be verified. Ensure the file is not corrupted."],
    };
  }

  const warnings: string[] = [];
  const estimatedPages = Math.ceil(file.size / 50000); // rough: 50KB per page

  if (estimatedPages > 3) {
    warnings.push(`Your resume appears to be ${estimatedPages}+ pages. Recruiters prefer 1–2 pages.`);
  }

  if (format !== "PDF") {
    warnings.push("PDF format is recommended for best compatibility with ATS systems.");
  }

  return {
    valid:           true,
    detectedFormat:  format,
    estimatedPages:  Math.min(estimatedPages, 20),
    warnings:        warnings.length ? warnings : undefined,
  };
}

// ─── Resume Text ──────────────────────────────────────────────────────────────

/**
 * Validate extracted resume text content.
 * Called after PDF/DOCX text extraction before sending to AI.
 */
export function validateResumeText(text: string): ResumeValidationResult {
  if (!text?.trim()) {
    return {
      valid: false,
      error: "Could not extract text from resume. The file may be image-based (scanned). Please upload a text-based PDF.",
    };
  }

  if (text.trim().length < MIN_RESUME_TEXT_LENGTH) {
    return {
      valid: false,
      error: "Resume text is too short. Ensure the document contains readable text content.",
    };
  }

  if (text.length > MAX_RESUME_TEXT_LENGTH) {
    return {
      valid:    true,
      warnings: [`Resume is very long (${text.length.toLocaleString()} chars). It will be truncated for AI analysis.`],
    };
  }

  const warnings: string[] = [];

  // Check for common resume sections
  const hasExperience = /experience|employment|work history/i.test(text);
  const hasEducation  = /education|degree|university|college/i.test(text);
  const hasSkills     = /skills|technologies|proficiency/i.test(text);

  if (!hasExperience) warnings.push("No work experience section detected.");
  if (!hasEducation)  warnings.push("No education section detected.");
  if (!hasSkills)     warnings.push("No skills section detected — adding one improves AI context.");

  // Check for contact info (warn if missing, don't block)
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
  if (!hasEmail) warnings.push("No email address found in resume.");

  // Detect likely image-only PDF (very short text with lots of whitespace)
  const nonSpaceRatio = text.replace(/\s/g, "").length / text.length;
  if (nonSpaceRatio < 0.3) {
    return {
      valid: false,
      error: "Resume appears to be a scanned image. Please upload a text-selectable PDF.",
    };
  }

  return {
    valid:    true,
    warnings: warnings.length ? warnings : undefined,
  };
}

// ─── Job Description ──────────────────────────────────────────────────────────

/**
 * Validate a pasted job description.
 */
export function validateJobDescription(jd: string): JDValidationResult {
  if (!jd?.trim()) {
    return { valid: false, error: "Job description is required." };
  }

  const trimmed = jd.trim();

  if (trimmed.length < MIN_JD_LENGTH) {
    return {
      valid: false,
      error: `Job description is too short (${trimmed.length} characters). Please paste the full job description.`,
    };
  }

  if (trimmed.length > MAX_JD_LENGTH) {
    return {
      valid:     true,
      wordCount: countWords(trimmed),
      warnings:  [`Job description is very long (${trimmed.length.toLocaleString()} characters). It will be summarized for AI analysis.`],
    };
  }

  const wordCount = countWords(trimmed);
  const warnings: string[] = [];

  if (wordCount < 50) {
    warnings.push("Job description is brief. More detail helps generate better interview prep.");
  }

  // Detect if it looks like a real JD
  const hasResponsibilities = /responsibilit|duties|you will|you'll|role involves/i.test(trimmed);
  const hasRequirements     = /requirements|qualifications|experience|skills required|must have/i.test(trimmed);

  if (!hasResponsibilities && !hasRequirements) {
    warnings.push("This may not be a job description. Paste the full JD for best results.");
  }

  return {
    valid:     true,
    wordCount,
    warnings:  warnings.length ? warnings : undefined,
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Interview Context ────────────────────────────────────────────────────────

const VALID_INTERVIEW_TYPES = ["behavioral", "technical", "system-design", "coding", "hr", "mixed"];

/**
 * Validate the full interview context object before starting a session.
 */
export function validateInterviewContext(
  data: InterviewContextData
): InterviewContextErrors {
  const errors: InterviewContextErrors = {};

  if (data.jobTitle !== undefined && data.jobTitle.trim()) {
    if (data.jobTitle.trim().length > MAX_ROLE_LENGTH) {
      errors.jobTitle = `Job title must be under ${MAX_ROLE_LENGTH} characters.`;
    }
  }

  if (data.company !== undefined && data.company.trim()) {
    if (data.company.trim().length > MAX_COMPANY_LENGTH) {
      errors.company = `Company name must be under ${MAX_COMPANY_LENGTH} characters.`;
    }
  }

  if (data.jobDescription) {
    const jdResult = validateJobDescription(data.jobDescription);
    if (!jdResult.valid) errors.jobDescription = jdResult.error;
  }

  if (data.resumeText) {
    const resumeResult = validateResumeText(data.resumeText);
    if (!resumeResult.valid) errors.resumeText = resumeResult.error;
  }

  if (data.interviewType && !VALID_INTERVIEW_TYPES.includes(data.interviewType)) {
    errors.interviewType = `Invalid interview type. Choose from: ${VALID_INTERVIEW_TYPES.join(", ")}.`;
  }

  if (data.yearsOfExp !== undefined) {
    if (!Number.isInteger(data.yearsOfExp) || data.yearsOfExp < 0 || data.yearsOfExp > 60) {
      errors.yearsOfExp = "Years of experience must be a whole number between 0 and 60.";
    }
  }

  if (data.techStack !== undefined) {
    if (!Array.isArray(data.techStack)) {
      errors.techStack = "Tech stack must be a list of technologies.";
    } else if (data.techStack.length > 20) {
      errors.techStack = "Tech stack list can have at most 20 items.";
    } else if (data.techStack.some((t) => typeof t !== "string" || t.trim().length === 0 || t.length > 50)) {
      errors.techStack = "Each technology name must be under 50 characters.";
    }
  }

  return errors;
}

// ─── Question & Answer ────────────────────────────────────────────────────────

/**
 * Validate an interview question before sending to AI.
 */
export function validateQuestion(question: string): ValidationResult {
  if (!question?.trim()) {
    return { valid: false, error: "Question cannot be empty." };
  }

  if (question.trim().length < MIN_QUESTION_LENGTH) {
    return { valid: false, error: "Question is too short." };
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      valid: false,
      error: `Question exceeds maximum length of ${MAX_QUESTION_LENGTH} characters.`,
    };
  }

  // Detect if it looks like a question or instruction
  const looksLikeQuestion =
    question.includes("?") ||
    /^(tell|describe|explain|how|what|why|when|where|who|give|walk|share|have you|can you|do you)/i.test(question.trim());

  if (!looksLikeQuestion) {
    return {
      valid:    true,
      warnings: ["This doesn't look like a typical interview question. Please verify."],
    };
  }

  return { valid: true };
}

/**
 * Validate an answer before saving to the answer bank.
 */
export function validateAnswer(answer: string): ValidationResult {
  if (!answer?.trim()) {
    return { valid: false, error: "Answer cannot be empty." };
  }

  if (answer.trim().length < 10) {
    return { valid: false, error: "Answer is too short to be useful." };
  }

  if (answer.length > MAX_ANSWER_LENGTH) {
    return {
      valid: false,
      error: `Answer exceeds maximum length of ${MAX_ANSWER_LENGTH.toLocaleString()} characters.`,
    };
  }

  return { valid: true };
}

/**
 * Validate a question + answer pair for saving to the answer bank.
 */
export function validateQAPair(pair: QuestionAnswerPair): {
  valid: boolean;
  errors: Partial<Record<keyof QuestionAnswerPair, string>>;
} {
  const errors: Partial<Record<keyof QuestionAnswerPair, string>> = {};

  const qResult = validateQuestion(pair.question);
  if (!qResult.valid) errors.question = qResult.error;

  if (pair.answer !== undefined) {
    const aResult = validateAnswer(pair.answer);
    if (!aResult.valid) errors.answer = aResult.error;
  }

  if (pair.tags) {
    if (pair.tags.length > MAX_TAGS) {
      errors.tags = `Maximum ${MAX_TAGS} tags allowed.`;
    } else if (pair.tags.some((t) => typeof t !== "string" || t.trim().length === 0 || t.length > MAX_TAG_LENGTH)) {
      errors.tags = `Each tag must be under ${MAX_TAG_LENGTH} characters.`;
    } else if (pair.tags.some((t) => !/^[a-zA-Z0-9\-_ ]+$/.test(t))) {
      errors.tags = "Tags can only contain letters, numbers, hyphens, and underscores.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── Company & Role ───────────────────────────────────────────────────────────

export function validateCompanyName(name: string): ValidationResult {
  if (!name?.trim()) return { valid: true }; // optional field

  if (name.trim().length > MAX_COMPANY_LENGTH) {
    return { valid: false, error: `Company name must be under ${MAX_COMPANY_LENGTH} characters.` };
  }

  if (/[<>{}[\]]/.test(name)) {
    return { valid: false, error: "Company name contains invalid characters." };
  }

  return { valid: true };
}

export function validateRoleTitle(title: string): ValidationResult {
  if (!title?.trim()) return { valid: true }; // optional field

  if (title.trim().length > MAX_ROLE_LENGTH) {
    return { valid: false, error: `Role title must be under ${MAX_ROLE_LENGTH} characters.` };
  }

  return { valid: true };
}

// ─── STAR Answer ──────────────────────────────────────────────────────────────

export interface STARAnswer {
  situation: string;
  task:      string;
  action:    string;
  result:    string;
}

export interface STARErrors {
  situation?: string;
  task?:      string;
  action?:    string;
  result?:    string;
}

/**
 * Validate each section of a STAR-structured answer.
 */
export function validateSTARAnswer(star: STARAnswer): STARErrors {
  const errors: STARErrors = {};
  const minLen = 20;
  const maxLen = 1000;

  const validate = (
    field: keyof STARAnswer,
    label: string
  ) => {
    const val = star[field]?.trim() ?? "";
    if (!val) {
      errors[field] = `${label} is required.`;
    } else if (val.length < minLen) {
      errors[field] = `${label} is too brief. Add more detail.`;
    } else if (val.length > maxLen) {
      errors[field] = `${label} exceeds ${maxLen} characters.`;
    }
  };

  validate("situation", "Situation");
  validate("task",      "Task");
  validate("action",    "Action");
  validate("result",    "Result");

  return errors;
}
