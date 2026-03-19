// ─────────────────────────────────────────────────────────────────────────────
// pages/index.ts — Root barrel export for every page in the application.
// Combines top-level pages with all sub-folder re-exports so the router
// can import anything from "@/pages" with a single import statement.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Top-level pages ──────────────────────────────────────────────────────────

export { default as Index }               from "./Index";
export { default as NotFound }            from "./NotFound";
export { default as Dashboard }           from "./Dashboard";
export { default as Analytics }           from "./Analytics";
export { default as DocumentVault }       from "./DocumentVault";
export { default as InterviewScheduler }  from "./InterviewScheduler";
export { default as LiveCopilot }         from "./LiveCopilot";
export { default as MockSession }         from "./MockSession";
export { default as PrepLab }             from "./PrepLab";
export { default as Scorecard }           from "./Scorecard";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export {
  Login,
  Signup,
  VerifyEmail,
  ResetPassword,
} from "./auth";

// ─── Onboarding ───────────────────────────────────────────────────────────────

export {
  OnboardingIndex,
  OnboardingStep1Role,
  OnboardingStep2Experience,
  OnboardingStep3Preferences,
  OnboardingStep4AudioSetup,
  OnboardingStep5ResumeUpload,
} from "./onboarding";

export type { OnboardingData } from "./onboarding";

// ─── Marketing ────────────────────────────────────────────────────────────────

export {
  Landing,
  Pricing,
  Blog,
  BlogPost,
  Help,
  HelpArticle,
  Shortcuts,
} from "./marketing";

// ─── App ──────────────────────────────────────────────────────────────────────

export * from "./app";
