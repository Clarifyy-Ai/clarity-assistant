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
export { default as OnboardingStep1Essentials }     from "./OnboardingStep1Essentials";
export { default as OnboardingStep2OptionalSetup }  from "./OnboardingStep2OptionalSetup";
