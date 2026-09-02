// src/lib/validators/index.ts
//
// Central validation export module.


// ─────────────────────────────────────────────────────────────────────────────
// Legacy Email & Auth Validators
// Keep these exports to avoid breaking existing imports.
// ─────────────────────────────────────────────────────────────────────────────

export {
  validateEmail,
  validatePassword,
  getPasswordStrength,
  validateSignUpForm,
  validateSignInForm,
  validateFullName,
  validateURL,
  validateLinkedInURL,
  validateRequired,
  validateMaxLength,
  validateMinLength,
} from "./emailValidator";

export type {
  ValidationResult as LegacyValidationResult,
  PasswordStrength,
  SignUpFormData,
  SignUpFormErrors,
} from "./emailValidator";


// ─────────────────────────────────────────────────────────────────────────────
// Legacy Audio Validators
// Keep these exports because audio recording/transcription flows may depend on them.
// ─────────────────────────────────────────────────────────────────────────────

export {
  validateBrowserAudioSupport,
  validateSecureContext,
  getMicPermissionState,
  validateMicPermission,
  getAudioInputDevices,
  validateAudioDevice,
  validateAudioDevicesAvailable,
  validateAudioStream,
  validateAudioConstraints,
  validateAudioChunk,
  analyseAudioQuality,
  validateSampleRate,
  isOptimalForDeepgram,
  validateAudioFile,
  runAudioPreflight,
} from "./audioValidator";

export type {
  AudioPermissionState,
  DeviceValidationResult,
  StreamValidationResult,
  AudioQualityReport,
  AudioDeviceInfo,
  PreflightReport,
} from "./audioValidator";


// ─────────────────────────────────────────────────────────────────────────────
// Legacy Resume & Content Validators
// Keep these exports to avoid breaking existing resume/interview flows.
// ─────────────────────────────────────────────────────────────────────────────

export {
  validateResumeFile,
  validateResumeText,
  validateJobDescription,
  validateInterviewContext,
  validateQuestion,
  validateAnswer,
  validateQAPair,
  validateCompanyName,
  validateRoleTitle,
  validateSTARAnswer,
} from "./resumeValidator";

export type {
  ResumeValidationResult,
  JDValidationResult,
  InterviewContextData,
  InterviewContextErrors,
  QuestionAnswerPair,
  STARAnswer,
  STARErrors,
} from "./resumeValidator";


// ─────────────────────────────────────────────────────────────────────────────
// New Production Auth Schemas
// ─────────────────────────────────────────────────────────────────────────────

export {
  loginSchema,
  signupSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  changePasswordSchema,
  magicLinkSchema,
  oauthProviderSchema,
  profileIdentitySchema,
} from "./authSchemas";

export type {
  LoginInput,
  SignupInput,
  ResetPasswordInput,
  UpdatePasswordInput,
  ChangePasswordInput,
  MagicLinkInput,
  OAuthProviderInput,
  ProfileIdentityInput,
} from "./authSchemas";


// ─────────────────────────────────────────────────────────────────────────────
// New Production Resume / Document Schemas
// ─────────────────────────────────────────────────────────────────────────────

export {
  resumeFileSchema,
  jobDescriptionFileSchema,
  resumeUploadSchema,
  jobDescriptionUploadSchema,
  documentMetadataSchema,
  extractedDocumentTextSchema,
  resumeContactInfoSchema,
  resumeExperienceItemSchema,
  resumeEducationItemSchema,
  parsedResumeSchema,
  resumeAnalysisRequestSchema,
  resumeSaveSchema,
  RESUME_VALIDATION_LIMITS,
} from "./resumeSchemas";

export type {
  ResumeUploadInput,
  JobDescriptionUploadInput,
  DocumentMetadataInput,
  ExtractedDocumentTextInput,
  ResumeContactInfoInput,
  ResumeExperienceItemInput,
  ResumeEducationItemInput,
  ParsedResumeInput,
  ResumeAnalysisRequestInput,
  ResumeSaveInput,
} from "./resumeSchemas";


// ─────────────────────────────────────────────────────────────────────────────
// New Production Interview / Session Schemas
// ─────────────────────────────────────────────────────────────────────────────

export {
  interviewTypeSchema,
  interviewDifficultySchema,
  interviewModeSchema,
  sessionStatusSchema,
  startInterviewSessionSchema,
  interviewSessionSchema,
  interviewQuestionSchema,
  generateQuestionsRequestSchema,
  interviewAnswerSchema,
  generateAnswerFeedbackRequestSchema,
  aiFeedbackScoreSchema,
  aiFeedbackSchema,
  sessionNotesSchema,
  endInterviewSessionSchema,
  mockTestAnswerSchema,
  submitMockTestSchema,
  generateDebriefRequestSchema,
  liveTranscriptChunkSchema,
  interviewValidationLimits,
} from "./interviewSchemas";

export type {
  InterviewType,
  InterviewDifficulty,
  InterviewMode,
  SessionStatus,
  StartInterviewSessionInput,
  InterviewSessionInput,
  InterviewQuestionInput,
  GenerateQuestionsRequestInput,
  InterviewAnswerInput,
  GenerateAnswerFeedbackRequestInput,
  AIFeedbackInput,
  SessionNotesInput,
  EndInterviewSessionInput,
  MockTestAnswerInput,
  SubmitMockTestInput,
  GenerateDebriefRequestInput,
  LiveTranscriptChunkInput,
} from "./interviewSchemas";


// ─────────────────────────────────────────────────────────────────────────────
// New Production Payment / Billing Schemas
// ─────────────────────────────────────────────────────────────────────────────

export {
  billingPlanIdSchema,
  subscriptionPlanSchema,
  billingIntervalSchema,
  creditPackIdSchema,
  paymentProviderSchema,
  subscriptionActionSchema,
  checkoutModeSchema,
  idempotencyKeySchema,
  couponCodeSchema,
  checkoutRequestSchema,
  billingPortalRequestSchema,
  cancelSubscriptionRequestSchema,
  resumeSubscriptionRequestSchema,
  changeSubscriptionPlanRequestSchema,
  creditPurchaseRequestSchema,
  deductCreditsRequestSchema,
  addCreditsRequestSchema,
  stripeCustomerSchema,
  stripeWebhookEventSchema,
  paymentStatusSchema,
  subscriptionStatusSchema,
  billingRecordSchema,
  refundRequestSchema,
  paymentValidationLimits,
} from "./paymentSchemas";

export type {
  BillingPlanId,
  SubscriptionPlan,
  BillingInterval,
  CreditPackId,
  PaymentProvider,
  SubscriptionAction,
  CheckoutMode,
  CheckoutRequestInput,
  BillingPortalRequestInput,
  CancelSubscriptionRequestInput,
  ResumeSubscriptionRequestInput,
  ChangeSubscriptionPlanRequestInput,
  CreditPurchaseRequestInput,
  DeductCreditsRequestInput,
  AddCreditsRequestInput,
  StripeCustomerInput,
  StripeWebhookEventInput,
  BillingRecordInput,
  RefundRequestInput,
} from "./paymentSchemas";


// ─────────────────────────────────────────────────────────────────────────────
// Shared Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

export {
  ValidationError,
  zodErrorToFieldErrors,
  getFirstValidationMessage,
  safeValidate,
  sanitizeAndValidate,
  validateOrThrow,
  sanitizeValidateOrThrow,
  formDataToObject,
  sanitizeFormData,
  validateFormData,
  validateFormDataOrThrow,
  getFieldError,
  getFieldErrors,
  hasFieldError,
  flattenValidationErrors,
  validationErrorsToMessage,
  isValidEmail,
  isStrongPassword,
  getPasswordStrengthErrors,
  sanitizeSearchQuery,
  createValidationFailure,
  createValidationSuccess,
} from "./helpers";

export type {
  ValidationFieldErrors,
  ValidationSuccess,
  ValidationFailure,
  ValidationResult,
} from "./helpers";
//
// This file keeps backward compatibility with existing validators
// while also exporting the new production-grade Zod schemas and helpers.
//
// Import from this file across the app:
//
