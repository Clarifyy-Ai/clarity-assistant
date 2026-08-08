// ─────────────────────────────────────────────────────────────────────────────
// onboarding.types.ts
// Shared types for the 5-step onboarding wizard.
// Kept here (not in OnboardingIndex) to avoid circular imports between the
// orchestrator and the step components.
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  // Step 1 — Role
  targetRole:          string;
  targetCompanies:     string[];
  jobDescription:      string;

  // Step 2 — Experience
  yearsOfExperience:   number;
  currentLevel:        string;
  techStack:           string[];
  interviewTypes:      string[];

  // Step 3 — Preferences
  preferredModel:      string;
  preferredLanguage:   string;
  overlayEnabled:      boolean;
  audioAnalysis:       boolean;
  emailNotifications:  boolean;

  // Step 4 — Audio
  selectedMicId:       string;
  audioVerified:       boolean;
  /** True when user skipped device readiness during onboarding. */
  skippedAudio?:       boolean;

  // Step 5 — Resume
  resumeFileId:        string | null;
  resumeFileName:      string | null;
  skipResume:          boolean;
}

export interface StepProps {
  data:        OnboardingData;
  onNext:      (data?: Partial<OnboardingData>) => void;
  onBack:      () => void;
  onSkip:      () => void;
  /** Live-sync partial step data to the parent (e.g. Essentials → Skip gate). */
  onChange?:   (data: Partial<OnboardingData>) => void;
  isFirstStep: boolean;
  isLastStep:  boolean;
}
