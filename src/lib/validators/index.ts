// ─── Email & Auth Validators ──────────────────────────────────────────────────
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
  ValidationResult,
  PasswordStrength,
  SignUpFormData,
  SignUpFormErrors,
} from "./emailValidator";

// ─── Audio Validators ────────────────────────────────────────────────────────
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

// ─── Resume & Content Validators ─────────────────────────────────────────────
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
