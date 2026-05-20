// src/lib/validators/interviewSchemas.ts
//
// Interview/session validation schemas.
//
// SECURITY PURPOSE:
// - Validate interview session payloads before API/Edge Function calls
// - Sanitize questions, answers, notes, and AI feedback
// - Limit payload sizes to prevent abuse
// - Detect obvious prompt-injection attempts
// - Protect mock interviews, live sessions, test submissions, and feedback flows
//
// Use these schemas in:
// - Mock interview setup
// - Live interview sessions
// - Generate-answer flows
// - Generate-question flows
// - AI feedback/debrief flows
// - Mock test submission flows

import { z } from "zod";
import { containsSuspiciousHTML, sanitizeAIOutput, sanitizeDocumentText, sanitizeText } from "@/lib/security";

const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_MEDIUM_TEXT_LENGTH = 2_000;
const MAX_ANSWER_LENGTH = 10_000;
const MAX_AI_RESPONSE_LENGTH = 20_000;
const MAX_NOTES_LENGTH = 10_000;
const MAX_QUESTIONS_PER_REQUEST = 50;
const MAX_TEST_ANSWERS = 200;

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(the\s+)?system\s+prompt/i,
  /disregard\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now/i,
  /act\s+as\s+/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /system\s*:/i,
  /\[system\]/i,
  /\[developer\]/i,
  /reveal\s+(your\s+)?system\s+prompt/i,
  /show\s+(me\s+)?hidden\s+instructions/i,
  /print\s+(the\s+)?instructions/i,
  /exfiltrate/i,
];

function hasPromptInjectionRisk(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function safeTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !containsSuspiciousHTML(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .transform((value) => sanitizeText(value));
}

function optionalSafeTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !containsSuspiciousHTML(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value));
}

function aiInputTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !containsSuspiciousHTML(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .refine((value) => !hasPromptInjectionRisk(value), {
      message: `${fieldName} appears to contain prompt-injection instructions.`,
    })
    .transform((value) => sanitizeDocumentText(value));
}

export const interviewTypeSchema = z.enum([
  "behavioral",
  "technical",
  "case_study",
  "system_design",
  "hr",
  "mixed",
  "custom",
]);

export const interviewDifficultySchema = z.enum(["easy", "medium", "hard", "expert"]);

export const interviewModeSchema = z.enum(["mock", "live", "practice", "test"]);

export const sessionStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "failed",
]);

export const startInterviewSessionSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  mode: interviewModeSchema.default("mock"),

  interviewType: interviewTypeSchema.default("mixed"),

  difficulty: interviewDifficultySchema.default("medium"),

  targetRole: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Target role"),

  companyName: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Company name"),

  jobDescription: z
    .string()
    .trim()
    .max(50_000, "Job description is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),

  resumeId: z.string().uuid("Invalid resume ID.").optional(),

  questionCount: z
    .number()
    .int("Question count must be a whole number.")
    .min(1, "At least one question is required.")
    .max(MAX_QUESTIONS_PER_REQUEST, `Maximum ${MAX_QUESTIONS_PER_REQUEST} questions allowed.`)
    .default(5),
});

export const interviewSessionSchema = z.object({
  id: z.string().uuid("Invalid session ID."),
  userId: z.string().uuid("Invalid user ID."),
  mode: interviewModeSchema,
  interviewType: interviewTypeSchema,
  difficulty: interviewDifficultySchema,
  status: sessionStatusSchema,
  targetRole: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Target role"),
  companyName: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Company name"),
  startedAt: z.string().datetime("Invalid start timestamp.").optional(),
  endedAt: z.string().datetime("Invalid end timestamp.").optional(),
});

export const interviewQuestionSchema = z.object({
  id: z.string().uuid("Invalid question ID.").optional(),

  sessionId: z.string().uuid("Invalid session ID.").optional(),

  question: aiInputTextSchema(MAX_MEDIUM_TEXT_LENGTH, "Question"),

  category: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Category"),

  difficulty: interviewDifficultySchema.default("medium"),

  expectedAnswer: z
    .string()
    .trim()
    .max(MAX_AI_RESPONSE_LENGTH, "Expected answer is too long.")
    .optional()
    .transform((value) => (value ? sanitizeAIOutput(value) : value)),

  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty.")
        .max(80, "Tag is too long.")
        .transform((value) => sanitizeText(value))
    )
    .max(20, "Too many tags.")
    .default([]),
});

export const generateQuestionsRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  interviewType: interviewTypeSchema.default("mixed"),

  difficulty: interviewDifficultySchema.default("medium"),

  targetRole: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Target role"),

  companyName: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Company name"),

  resumeText: z
    .string()
    .trim()
    .max(100_000, "Resume text is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),

  jobDescription: z
    .string()
    .trim()
    .max(100_000, "Job description is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),

  count: z
    .number()
    .int("Question count must be a whole number.")
    .min(1, "At least one question is required.")
    .max(MAX_QUESTIONS_PER_REQUEST, `Maximum ${MAX_QUESTIONS_PER_REQUEST} questions allowed.`)
    .default(5),
});

export const interviewAnswerSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  sessionId: z.string().uuid("Invalid session ID."),

  questionId: z.string().uuid("Invalid question ID."),

  question: aiInputTextSchema(MAX_MEDIUM_TEXT_LENGTH, "Question"),

  answer: aiInputTextSchema(MAX_ANSWER_LENGTH, "Answer"),

  answeredAt: z.string().datetime("Invalid answered timestamp.").optional(),

  durationSeconds: z
    .number()
    .int("Duration must be a whole number.")
    .min(0, "Duration cannot be negative.")
    .max(24 * 60 * 60, "Duration is too long.")
    .optional(),
});

export const generateAnswerFeedbackRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  sessionId: z.string().uuid("Invalid session ID."),

  questionId: z.string().uuid("Invalid question ID."),

  question: aiInputTextSchema(MAX_MEDIUM_TEXT_LENGTH, "Question"),

  answer: aiInputTextSchema(MAX_ANSWER_LENGTH, "Answer"),

  targetRole: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Target role"),

  companyName: optionalSafeTextSchema(MAX_SHORT_TEXT_LENGTH, "Company name"),

  rubric: z
    .string()
    .trim()
    .max(MAX_MEDIUM_TEXT_LENGTH, "Rubric is too long.")
    .optional()
    .transform((value) => (value ? sanitizeDocumentText(value) : value)),
});

export const aiFeedbackScoreSchema = z
  .number()
  .min(0, "Score cannot be below 0.")
  .max(100, "Score cannot exceed 100.");

export const aiFeedbackSchema = z.object({
  overallScore: aiFeedbackScoreSchema.optional(),

  clarityScore: aiFeedbackScoreSchema.optional(),

  relevanceScore: aiFeedbackScoreSchema.optional(),

  structureScore: aiFeedbackScoreSchema.optional(),

  confidenceScore: aiFeedbackScoreSchema.optional(),

  feedback: z
    .string()
    .trim()
    .min(1, "Feedback is required.")
    .max(MAX_AI_RESPONSE_LENGTH, "Feedback is too long.")
    .transform((value) => sanitizeAIOutput(value)),

  strengths: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Strength cannot be empty.")
        .max(MAX_MEDIUM_TEXT_LENGTH, "Strength is too long.")
        .transform((value) => sanitizeAIOutput(value))
    )
    .max(20, "Too many strengths.")
    .default([]),

  improvements: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Improvement cannot be empty.")
        .max(MAX_MEDIUM_TEXT_LENGTH, "Improvement is too long.")
        .transform((value) => sanitizeAIOutput(value))
    )
    .max(20, "Too many improvements.")
    .default([]),

  suggestedAnswer: z
    .string()
    .trim()
    .max(MAX_AI_RESPONSE_LENGTH, "Suggested answer is too long.")
    .optional()
    .transform((value) => (value ? sanitizeAIOutput(value) : value)),
});

export const sessionNotesSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID."),
  userId: z.string().uuid("Invalid user ID."),

  notes: z
    .string()
    .trim()
    .max(MAX_NOTES_LENGTH, "Notes are too long.")
    .refine((value) => !containsSuspiciousHTML(value), {
      message: "Notes contain unsafe HTML.",
    })
    .transform((value) => sanitizeText(value)),
});

export const endInterviewSessionSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
  sessionId: z.string().uuid("Invalid session ID."),

  status: z.enum(["completed", "cancelled", "failed"]).default("completed"),

  endedAt: z.string().datetime("Invalid end timestamp.").optional(),

  notes: z
    .string()
    .trim()
    .max(MAX_NOTES_LENGTH, "Notes are too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),
});

export const mockTestAnswerSchema = z.object({
  questionId: z.string().uuid("Invalid question ID."),

  answer: aiInputTextSchema(MAX_ANSWER_LENGTH, "Answer"),

  selectedOptionId: z.string().uuid("Invalid selected option ID.").optional(),

  timeSpentSeconds: z
    .number()
    .int("Time spent must be a whole number.")
    .min(0, "Time spent cannot be negative.")
    .max(24 * 60 * 60, "Time spent is too long.")
    .optional(),
});

export const submitMockTestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  testId: z.string().uuid("Invalid test ID."),

  sessionId: z.string().uuid("Invalid session ID.").optional(),

  answers: z
    .array(mockTestAnswerSchema)
    .min(1, "At least one answer is required.")
    .max(MAX_TEST_ANSWERS, `Maximum ${MAX_TEST_ANSWERS} answers allowed.`),

  submittedAt: z.string().datetime("Invalid submitted timestamp.").optional(),
});

export const generateDebriefRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  sessionId: z.string().uuid("Invalid session ID."),

  answers: z
    .array(interviewAnswerSchema.omit({ userId: true }))
    .min(1, "At least one answer is required.")
    .max(MAX_TEST_ANSWERS, `Maximum ${MAX_TEST_ANSWERS} answers allowed.`),

  notes: z
    .string()
    .trim()
    .max(MAX_NOTES_LENGTH, "Notes are too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),
});

export const liveTranscriptChunkSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID."),
  userId: z.string().uuid("Invalid user ID."),

  transcript: z
    .string()
    .trim()
    .min(1, "Transcript is required.")
    .max(MAX_ANSWER_LENGTH, "Transcript is too long.")
    .refine((value) => !containsSuspiciousHTML(value), {
      message: "Transcript contains unsafe HTML.",
    })
    .transform((value) => sanitizeDocumentText(value)),

  isFinal: z.boolean().default(false),

  timestamp: z.string().datetime("Invalid transcript timestamp.").optional(),
});

export const interviewValidationLimits = {
  MAX_SHORT_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_ANSWER_LENGTH,
  MAX_AI_RESPONSE_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_QUESTIONS_PER_REQUEST,
  MAX_TEST_ANSWERS,
} as const;

export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type InterviewDifficulty = z.infer<typeof interviewDifficultySchema>;
export type InterviewMode = z.infer<typeof interviewModeSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export type StartInterviewSessionInput = z.infer<typeof startInterviewSessionSchema>;
export type InterviewSessionInput = z.infer<typeof interviewSessionSchema>;
export type InterviewQuestionInput = z.infer<typeof interviewQuestionSchema>;
export type GenerateQuestionsRequestInput = z.infer<typeof generateQuestionsRequestSchema>;
export type InterviewAnswerInput = z.infer<typeof interviewAnswerSchema>;
export type GenerateAnswerFeedbackRequestInput = z.infer<typeof generateAnswerFeedbackRequestSchema>;
export type AIFeedbackInput = z.infer<typeof aiFeedbackSchema>;
export type SessionNotesInput = z.infer<typeof sessionNotesSchema>;
export type EndInterviewSessionInput = z.infer<typeof endInterviewSessionSchema>;
export type MockTestAnswerInput = z.infer<typeof mockTestAnswerSchema>;
export type SubmitMockTestInput = z.infer<typeof submitMockTestSchema>;
export type GenerateDebriefRequestInput = z.infer<typeof generateDebriefRequestSchema>;
export type LiveTranscriptChunkInput = z.infer<typeof liveTranscriptChunkSchema>;
