// ─────────────────────────────────────────────────────────────────────────────
// pages/onboarding/index.ts — Barrel export for the onboarding flow.
// Router only needs to import OnboardingIndex; step components are
// internal to the flow and not imported directly from outside.
// ─────────────────────────────────────────────────────────────────────────────

// ── Primary entry point (used by the router) ──────────────────────────────────
export { default as OnboardingIndex } from "./OnboardingIndex";

// ── Shared data type (used by each step component's props) ───────────────────
export type { OnboardingData } from "./OnboardingIndex";

// ── Step components (exported for direct use / testing if needed) ─────────────
export { default as OnboardingStep1Role }         from "./OnboardingStep1Role";
export { default as OnboardingStep2Experience }   from "./OnboardingStep2Experience";
export { default as OnboardingStep3Preferences }  from "./OnboardingStep3Preferences";
export { default as OnboardingStep4AudioSetup }   from "./OnboardingStep4AudioSetup";
export { default as OnboardingStep5ResumeUpload } from "./OnboardingStep5ResumeUpload";
