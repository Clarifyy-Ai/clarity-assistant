// src/lib/validators/resumeSchemas.ts
//
// Resume/document validation schemas.
//
// SECURITY PURPOSE:
// - Validate resume uploads before processing
// - Restrict allowed file types
// - Enforce file size limits
// - Sanitize extracted resume/JD text
// - Validate parsed resume structure before storing or sending to AI
//
// Use these schemas in:
// - Resume upload forms
// - JD upload forms
// - Document parsing flows
// - AI resume analysis flows

import { z } from "zod";
import { sanitizeDocumentText, sanitizeFileName, sanitizeText } from "@/lib/security";

const MAX_RESUME_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_JD_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_DOCUMENT_TEXT_LENGTH = 100_000;
const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 5_000;

const ALLOWED_RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".docx", ".txt"];

function getFileExtension(fileName: string): string {
  const normalized = fileName.toLowerCase().trim();
  const lastDotIndex = normalized.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return normalized.slice(lastDotIndex);
}

function isAllowedResumeExtension(fileName: string): boolean {
  return ALLOWED_RESUME_EXTENSIONS.includes(getFileExtension(fileName));
}

function isAllowedResumeMimeType(file: File): boolean {
  return ALLOWED_RESUME_MIME_TYPES.includes(file.type);
}

export const resumeFileSchema = z
  .instanceof(File, { message: "Resume file is required." })
  .refine((file) => file.size > 0, {
    message: "Resume file cannot be empty.",
  })
  .refine((file) => file.size <= MAX_RESUME_FILE_SIZE_BYTES, {
    message: "Resume file must be 5 MB or smaller.",
  })
  .refine((file) => isAllowedResumeMimeType(file) || isAllowedResumeExtension(file.name), {
    message: "Only PDF, DOCX, or TXT resume files are allowed.",
  })
  .transform((file) => file);

export const jobDescriptionFileSchema = z
  .instanceof(File, { message: "Job description file is required." })
  .refine((file) => file.size > 0, {
    message: "Job description file cannot be empty.",
  })
  .refine((file) => file.size <= MAX_JD_FILE_SIZE_BYTES, {
    message: "Job description file must be 3 MB or smaller.",
  })
  .refine((file) => isAllowedResumeMimeType(file) || isAllowedResumeExtension(file.name), {
    message: "Only PDF, DOCX, or TXT job description files are allowed.",
  })
  .transform((file) => file);

export const resumeUploadSchema = z.object({
  file: resumeFileSchema,
  userId: z.string().uuid("Invalid user ID."),
});

export const jobDescriptionUploadSchema = z.object({
  file: jobDescriptionFileSchema,
  userId: z.string().uuid("Invalid user ID."),
});

export const documentMetadataSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "File name is required.")
    .max(255, "File name is too long.")
    .transform((value) => sanitizeFileName(value)),

  fileSize: z
    .number()
    .int("File size must be an integer.")
    .positive("File size must be greater than zero.")
    .max(MAX_RESUME_FILE_SIZE_BYTES, "File size exceeds the maximum allowed limit."),

  mimeType: z
    .string()
    .trim()
    .min(1, "MIME type is required.")
    .max(150, "MIME type is too long.")
    .transform((value) => sanitizeText(value)),

  uploadedAt: z.string().datetime("Invalid upload timestamp.").optional(),
});

export const extractedDocumentTextSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Extracted document text is required.")
    .max(MAX_DOCUMENT_TEXT_LENGTH, "Extracted document text is too long.")
    .transform((value) => sanitizeDocumentText(value)),

  source: z.enum(["resume", "job_description", "question_pdf", "other"]).default("resume"),
});

export const resumeContactInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH, "Name is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  email: z
    .string()
    .trim()
    .email("Invalid email address.")
    .max(254, "Email is too long.")
    .optional()
    .transform((value) => (value ? value.toLowerCase() : value)),

  phone: z
    .string()
    .trim()
    .max(50, "Phone number is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  location: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH, "Location is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  linkedinUrl: z
    .string()
    .trim()
    .url("Invalid LinkedIn URL.")
    .max(500, "LinkedIn URL is too long.")
    .optional(),

  portfolioUrl: z
    .string()
    .trim()
    .url("Invalid portfolio URL.")
    .max(500, "Portfolio URL is too long.")
    .optional(),
});

export const resumeExperienceItemSchema = z.object({
  company: z
    .string()
    .trim()
    .min(1, "Company is required.")
    .max(MAX_SHORT_TEXT_LENGTH, "Company name is too long.")
    .transform((value) => sanitizeText(value)),

  role: z
    .string()
    .trim()
    .min(1, "Role is required.")
    .max(MAX_SHORT_TEXT_LENGTH, "Role is too long.")
    .transform((value) => sanitizeText(value)),

  startDate: z
    .string()
    .trim()
    .max(100, "Start date is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  endDate: z
    .string()
    .trim()
    .max(100, "End date is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  description: z
    .string()
    .trim()
    .max(MAX_SUMMARY_LENGTH, "Experience description is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),
});

export const resumeEducationItemSchema = z.object({
  institution: z
    .string()
    .trim()
    .min(1, "Institution is required.")
    .max(MAX_SHORT_TEXT_LENGTH, "Institution name is too long.")
    .transform((value) => sanitizeText(value)),

  degree: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH, "Degree is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  fieldOfStudy: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH, "Field of study is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  graduationYear: z
    .string()
    .trim()
    .max(20, "Graduation year is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),
});

export const parsedResumeSchema = z.object({
  contactInfo: resumeContactInfoSchema.optional(),

  summary: z
    .string()
    .trim()
    .max(MAX_SUMMARY_LENGTH, "Summary is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),

  skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Skill cannot be empty.")
        .max(100, "Skill is too long.")
        .transform((value) => sanitizeText(value))
    )
    .max(200, "Too many skills.")
    .default([]),

  experience: z.array(resumeExperienceItemSchema).max(100, "Too many experience items.").default([]),

  education: z.array(resumeEducationItemSchema).max(50, "Too many education items.").default([]),

  certifications: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Certification cannot be empty.")
        .max(MAX_SHORT_TEXT_LENGTH, "Certification is too long.")
        .transform((value) => sanitizeText(value))
    )
    .max(100, "Too many certifications.")
    .default([]),

  rawText: z
    .string()
    .trim()
    .max(MAX_DOCUMENT_TEXT_LENGTH, "Raw resume text is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),
});

export const resumeAnalysisRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  resumeText: z
    .string()
    .trim()
    .min(1, "Resume text is required.")
    .max(MAX_DOCUMENT_TEXT_LENGTH, "Resume text is too long.")
    .transform((value) => sanitizeDocumentText(value)),

  jobDescriptionText: z
    .string()
    .trim()
    .max(MAX_DOCUMENT_TEXT_LENGTH, "Job description text is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),

  targetRole: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH, "Target role is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  companyName: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH, "Company name is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),
});

export const resumeSaveSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
  metadata: documentMetadataSchema,
  parsedResume: parsedResumeSchema,
});

export type ResumeUploadInput = z.infer<typeof resumeUploadSchema>;
export type JobDescriptionUploadInput = z.infer<typeof jobDescriptionUploadSchema>;
export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;
export type ExtractedDocumentTextInput = z.infer<typeof extractedDocumentTextSchema>;
export type ResumeContactInfoInput = z.infer<typeof resumeContactInfoSchema>;
export type ResumeExperienceItemInput = z.infer<typeof resumeExperienceItemSchema>;
export type ResumeEducationItemInput = z.infer<typeof resumeEducationItemSchema>;
export type ParsedResumeInput = z.infer<typeof parsedResumeSchema>;
export type ResumeAnalysisRequestInput = z.infer<typeof resumeAnalysisRequestSchema>;
export type ResumeSaveInput = z.infer<typeof resumeSaveSchema>;

export const RESUME_VALIDATION_LIMITS = {
  MAX_RESUME_FILE_SIZE_BYTES,
  MAX_JD_FILE_SIZE_BYTES,
  MAX_DOCUMENT_TEXT_LENGTH,
  ALLOWED_RESUME_MIME_TYPES,
  ALLOWED_RESUME_EXTENSIONS,
} as const;
