// supabase/functions/_shared/validators.ts
//
// Shared backend validation utilities for Supabase Edge Functions.
//
// SECURITY PURPOSE:
// - Validate request bodies before business logic runs
// - Reject malformed/oversized/untrusted payloads
// - Protect AI endpoints from prompt-injection-style inputs
// - Protect payment endpoints from malformed/idempotency-missing requests
// - Return consistent 422 validation responses
//
// IMPORTANT:
// Frontend validation improves UX.
// Backend validation is the actual security boundary.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { parseJsonBody, validationErrorResponse } from "./errors.ts";

const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_MEDIUM_TEXT_LENGTH = 2_000;
const MAX_LONG_TEXT_LENGTH = 10_000;
const MAX_DOCUMENT_TEXT_LENGTH = 100_000;
const MAX_AI_RESPONSE_LENGTH = 20_000;
const MAX_REQUEST_BODY_BYTES = 512 * 1024; // 512 KB
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

const SUSPICIOUS_HTML_PATTERNS = [
  /<script/i,
  /<\/script/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /onclick\s*=/i,
  /srcdoc\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<svg/i,
  /<math/i,
];

function hasSuspiciousHtml(value: string): boolean {
  return SUSPICIOUS_HTML_PATTERNS.some((pattern) => pattern.test(value));
}

function hasPromptInjectionRisk(value: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function safeText(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !hasSuspiciousHtml(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .transform((value) => sanitizeText(value));
}

function optionalSafeText(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !hasSuspiciousHtml(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value));
}

function aiInputText(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !hasSuspiciousHtml(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .refine((value) => !hasPromptInjectionRisk(value), {
      message: `${fieldName} appears to contain prompt-injection instructions.`,
    })
    .transform((value) => sanitizeText(value));
}

function optionalAiInputText(maxLength: number, fieldName: string) {
  return z
    .string()
    .trim()
    .max(maxLength, `${fieldName} is too long.`)
    .refine((value) => !hasSuspiciousHtml(value), {
      message: `${fieldName} contains unsafe HTML.`,
    })
    .refine((value) => !hasPromptInjectionRisk(value), {
      message: `${fieldName} appears to contain prompt-injection instructions.`,
    })
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value));
}

export const uuidSchema = z.string().uuid("Invalid UUID.");

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Idempotency key must be at least 16 characters.")
  .max(150, "Idempotency key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key contains invalid characters.");

export const interviewTypeSchema = z.enum([
  "behavioral",
  "technical",
  "case_study",
  "system_design",
  "hr",
  "mixed",
  "custom",
]);

export const interviewDifficultySchema = z.enum([
  "easy",
  "medium",
  "hard",
  "expert",
]);

export const interviewModeSchema = z.enum([
  "mock",
  "live",
  "practice",
  "test",
]);

export const billingPlanIdSchema = z.enum([
  "starter_monthly",
  "starter_yearly",
  "pro_monthly",
  "pro_yearly",
  "elite_monthly",
  "elite_yearly",
]);

export const creditPackIdSchema = z.enum([
  "credits_10",
  "credits_50",
  "credits_150",
  "credits_500",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Session / Interview Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const startSessionSchema = z.object({
  mode: interviewModeSchema.default("mock"),
  interviewType: interviewTypeSchema.default("mixed"),
  difficulty: interviewDifficultySchema.default("medium"),
  targetRole: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Target role"),
  companyName: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Company name"),
  resumeId: uuidSchema.optional(),
  jobDescription: optionalAiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Job description"),
  questionCount: z
    .number()
    .int("Question count must be a whole number.")
    .min(1, "At least one question is required.")
    .max(MAX_QUESTIONS_PER_REQUEST, `Maximum ${MAX_QUESTIONS_PER_REQUEST} questions allowed.`)
    .default(5),
});

export const endSessionSchema = z.object({
  sessionId: uuidSchema,
  status: z.enum(["completed", "cancelled", "failed"]).default("completed"),
  notes: optionalSafeText(MAX_LONG_TEXT_LENGTH, "Notes"),
});

export const generateQuestionsSchema = z.object({
  interviewType: interviewTypeSchema.default("mixed"),
  difficulty: interviewDifficultySchema.default("medium"),
  targetRole: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Target role"),
  companyName: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Company name"),
  resumeText: optionalAiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Resume text"),
  jobDescription: optionalAiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Job description"),
  count: z
    .number()
    .int("Question count must be a whole number.")
    .min(1, "At least one question is required.")
    .max(MAX_QUESTIONS_PER_REQUEST, `Maximum ${MAX_QUESTIONS_PER_REQUEST} questions allowed.`)
    .default(5),
});

export const generateAnswerSchema = z.object({
  sessionId: uuidSchema,
  questionId: uuidSchema.optional(),
  question: aiInputText(MAX_MEDIUM_TEXT_LENGTH, "Question"),
  answer: aiInputText(MAX_LONG_TEXT_LENGTH, "Answer"),
  targetRole: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Target role"),
  companyName: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Company name"),
});

export const generateHintSchema = z.object({
  sessionId: uuidSchema.optional(),
  questionId: uuidSchema.optional(),
  question: aiInputText(MAX_MEDIUM_TEXT_LENGTH, "Question"),
  context: optionalAiInputText(MAX_LONG_TEXT_LENGTH, "Context"),
});

export const generateDebriefSchema = z.object({
  sessionId: uuidSchema,
  notes: optionalSafeText(MAX_LONG_TEXT_LENGTH, "Notes"),
  answers: z
    .array(
      z.object({
        questionId: uuidSchema.optional(),
        question: aiInputText(MAX_MEDIUM_TEXT_LENGTH, "Question"),
        answer: aiInputText(MAX_LONG_TEXT_LENGTH, "Answer"),
      })
    )
    .min(1, "At least one answer is required.")
    .max(MAX_TEST_ANSWERS, `Maximum ${MAX_TEST_ANSWERS} answers allowed.`),
});

export const submitTestSchema = z.object({
  testId: uuidSchema,
  sessionId: uuidSchema.optional(),
  answers: z
    .array(
      z.object({
        questionId: uuidSchema,
        answer: aiInputText(MAX_LONG_TEXT_LENGTH, "Answer"),
        selectedOptionId: uuidSchema.optional(),
        timeSpentSeconds: z
          .number()
          .int("Time spent must be a whole number.")
          .min(0, "Time spent cannot be negative.")
          .max(24 * 60 * 60, "Time spent is too long.")
          .optional(),
      })
    )
    .min(1, "At least one answer is required.")
    .max(MAX_TEST_ANSWERS, `Maximum ${MAX_TEST_ANSWERS} answers allowed.`),
});

export const transcriptChunkSchema = z.object({
  sessionId: uuidSchema,
  transcript: aiInputText(MAX_LONG_TEXT_LENGTH, "Transcript"),
  isFinal: z.boolean().default(false),
  timestamp: z.string().datetime("Invalid timestamp.").optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Resume / Document Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const parseResumeSchema = z.object({
  documentId: uuidSchema.optional(),
  fileName: optionalSafeText(255, "File name"),
  resumeText: aiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Resume text"),
  targetRole: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Target role"),
  companyName: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Company name"),
});

export const parseQuestionPdfSchema = z.object({
  documentId: uuidSchema.optional(),
  fileName: optionalSafeText(255, "File name"),
  text: aiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Document text"),
});

// ─────────────────────────────────────────────────────────────────────────────
// AI / Chat Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const aiCoachChatSchema = z.object({
  sessionId: uuidSchema.optional(),
  message: aiInputText(MAX_LONG_TEXT_LENGTH, "Message"),
  context: optionalAiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Context"),
});

export const polishStarSectionSchema = z.object({
  section: z.enum(["situation", "task", "action", "result"]),
  content: aiInputText(MAX_LONG_TEXT_LENGTH, "Content"),
  targetRole: optionalSafeText(MAX_SHORT_TEXT_LENGTH, "Target role"),
});

export const generateStarAnswerSchema = z.object({
  question: aiInputText(MAX_MEDIUM_TEXT_LENGTH, "Question"),
  situation: optionalAiInputText(MAX_LONG_TEXT_LENGTH, "Situation"),
  task: optionalAiInputText(MAX_LONG_TEXT_LENGTH, "Task"),
  action: optionalAiInputText(MAX_LONG_TEXT_LENGTH, "Action"),
  result: optionalAiInputText(MAX_LONG_TEXT_LENGTH, "Result"),
});

export const gapAnalysisSchema = z.object({
  resumeText: aiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Resume text"),
  jobDescription: aiInputText(MAX_DOCUMENT_TEXT_LENGTH, "Job description"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Billing / Payment Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createCheckoutSchema = z
  .object({
    mode: z.enum(["subscription", "payment"]),
    planId: billingPlanIdSchema.optional(),
    creditPackId: creditPackIdSchema.optional(),
    successUrl: z.string().url("Invalid success URL."),
    cancelUrl: z.string().url("Invalid cancel URL."),
    couponCode: optionalSafeText(100, "Coupon code"),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine(
    (data) => {
      if (data.mode === "subscription") {
        return Boolean(data.planId) && !data.creditPackId;
      }

      return true;
    },
    {
      message: "Subscription checkout requires planId and must not include creditPackId.",
      path: ["planId"],
    }
  )
  .refine(
    (data) => {
      if (data.mode === "payment") {
        return Boolean(data.creditPackId) && !data.planId;
      }

      return true;
    },
    {
      message: "Credit checkout requires creditPackId and must not include planId.",
      path: ["creditPackId"],
    }
  );

export const billingPortalSchema = z.object({
  returnUrl: z.string().url("Invalid return URL."),
  idempotencyKey: idempotencyKeySchema,
});

export const cancelSubscriptionSchema = z.object({
  subscriptionId: safeText(MAX_SHORT_TEXT_LENGTH, "Subscription ID"),
  reason: optionalSafeText(MAX_MEDIUM_TEXT_LENGTH, "Cancellation reason"),
  idempotencyKey: idempotencyKeySchema,
});

export const resumeSubscriptionSchema = z.object({
  subscriptionId: safeText(MAX_SHORT_TEXT_LENGTH, "Subscription ID"),
  idempotencyKey: idempotencyKeySchema,
});

export const deductCreditsSchema = z.object({
  amount: z
    .number()
    .int("Credit amount must be a whole number.")
    .min(1, "Credit amount must be at least 1.")
    .max(10_000, "Credit amount is too large."),
  reason: z.enum([
    "generate_answer",
    "generate_questions",
    "generate_debrief",
    "generate_hint",
    "parse_resume",
    "mock_test",
    "live_session",
    "manual_adjustment",
  ]),
  referenceId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// Account / Utility Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const deleteAccountSchema = z.object({
  confirmationText: z
    .string()
    .trim()
    .refine((value) => value === "DELETE", {
      message: "Confirmation text must be DELETE.",
    }),
  idempotencyKey: idempotencyKeySchema,
});

export const exportUserDataSchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

export const sendEmailSchema = z.object({
  to: z.string().email("Invalid recipient email."),
  subject: safeText(200, "Subject"),
  html: z
    .string()
    .trim()
    .min(1, "Email HTML is required.")
    .max(MAX_AI_RESPONSE_LENGTH, "Email HTML is too long."),
});

export const validateApiKeySchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "deepgram"]),
  apiKey: z.string().trim().min(10, "API key is too short.").max(500, "API key is too long."),
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationFieldErrors = Record<string, string[]>;

export type RequestValidationSuccess<T> = {
  success: true;
  data: T;
  error: null;
};

export type RequestValidationFailure = {
  success: false;
  data: null;
  error: Response;
};

export type RequestValidationResult<T> =
  | RequestValidationSuccess<T>
  | RequestValidationFailure;

export function zodErrorToFieldErrors(error: z.ZodError): ValidationFieldErrors {
  const fieldErrors: ValidationFieldErrors = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";

    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }

    fieldErrors[path].push(issue.message);
  }

  return fieldErrors;
}

export function validatePayload<T>(
  schema: z.ZodType<T>,
  payload: unknown
): RequestValidationResult<T> {
  const result = schema.safeParse(payload);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      error: null,
    };
  }

  return {
    success: false,
    data: null,
    error: validationErrorResponse("Validation failed.", {
      fieldErrors: zodErrorToFieldErrors(result.error),
    }),
  };
}

export async function validateJsonRequest<T>(
  req: Request,
  schema: z.ZodType<T>,
  options: {
    maxBodyBytes?: number;
  } = {}
): Promise<RequestValidationResult<T>> {
  const maxBodyBytes = options.maxBodyBytes ?? MAX_REQUEST_BODY_BYTES;

  const contentLength = req.headers.get("content-length");

  if (contentLength) {
    const parsedLength = Number(contentLength);

    if (Number.isFinite(parsedLength) && parsedLength > maxBodyBytes) {
      return {
        success: false,
        data: null,
        error: validationErrorResponse("Request body is too large.", {
          maxBodyBytes,
        }),
      };
    }
  }

  const payload = await parseJsonBody<unknown>(req);

  return validatePayload(schema, payload);
}

export function createValidationResponse(error: z.ZodError): Response {
  return validationErrorResponse("Validation failed.", {
    fieldErrors: zodErrorToFieldErrors(error),
  });
}

export const VALIDATION_LIMITS = {
  MAX_SHORT_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_DOCUMENT_TEXT_LENGTH,
  MAX_AI_RESPONSE_LENGTH,
  MAX_REQUEST_BODY_BYTES,
  MAX_QUESTIONS_PER_REQUEST,
  MAX_TEST_ANSWERS,
} as const;

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
export type GenerateQuestionsInput = z.infer<typeof generateQuestionsSchema>;
export type GenerateAnswerInput = z.infer<typeof generateAnswerSchema>;
export type GenerateHintInput = z.infer<typeof generateHintSchema>;
export type GenerateDebriefInput = z.infer<typeof generateDebriefSchema>;
export type SubmitTestInput = z.infer<typeof submitTestSchema>;
export type TranscriptChunkInput = z.infer<typeof transcriptChunkSchema>;
export type ParseResumeInput = z.infer<typeof parseResumeSchema>;
export type ParseQuestionPdfInput = z.infer<typeof parseQuestionPdfSchema>;
export type AiCoachChatInput = z.infer<typeof aiCoachChatSchema>;
export type PolishStarSectionInput = z.infer<typeof polishStarSectionSchema>;
export type GenerateStarAnswerInput = z.infer<typeof generateStarAnswerSchema>;
export type GapAnalysisInput = z.infer<typeof gapAnalysisSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type BillingPortalInput = z.infer<typeof billingPortalSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type ResumeSubscriptionInput = z.infer<typeof resumeSubscriptionSchema>;
export type DeductCreditsInput = z.infer<typeof deductCreditsSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type ExportUserDataInput = z.infer<typeof exportUserDataSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type ValidateApiKeyInput = z.infer<typeof validateApiKeySchema>;
