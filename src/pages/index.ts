// ─────────────────────────────────────────────────────────────────────────────
// pages/index.ts — Root barrel export for every page in the application.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Top-level pages ──────────────────────────────────────────────────────────

export { default as NotFound }            from "./NotFound";
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
