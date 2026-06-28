// src/lib/stealth/stealthConfig.ts
// Discrete UI: neutral alternate labels for private practice (nav/titles only).

import { PRODUCT_NAMES, NAV_SECTION_LABELS } from "@/lib/constants/productNames";

export const STEALTH_NAV_LABELS: Record<string, string> = {
  [PRODUCT_NAMES.dashboard]: "Home",
  [PRODUCT_NAMES.practiceCoach]: "Rehearsal",
  [PRODUCT_NAMES.mockInterview]: "Drills",
  [PRODUCT_NAMES.prepLab]: "Toolkit",
  [PRODUCT_NAMES.govExams]: "Study Sets",
  "Sessions": "Notes",
  [PRODUCT_NAMES.sessionHistory]: "History",
  [PRODUCT_NAMES.analytics]: "Reports",
  [PRODUCT_NAMES.creditsUsage]: "Usage",
  [PRODUCT_NAMES.documents]: "Files",
  [PRODUCT_NAMES.answerBank]: "Saved Answers",
  [PRODUCT_NAMES.interviews]: "Calendar",
  [PRODUCT_NAMES.companyResearch]: "Research",
  [PRODUCT_NAMES.groupPractice]: "Rooms",
  "Notifications": "Inbox",
  "Settings": "Preferences",
  [PRODUCT_NAMES.debrief]: "Review",
  [PRODUCT_NAMES.referrals]: "Invites",
  [PRODUCT_NAMES.interviewDay]: "Focus",
};

export const STEALTH_SECTION_LABELS: Record<string, string> = {
  [NAV_SECTION_LABELS.core]: "Workspace",
  [NAV_SECTION_LABELS.progress]: "Insights",
  [NAV_SECTION_LABELS.planner]: "Schedule",
  // Legacy section keys (pre-rename)
  Core: "Workspace",
  Growth: "Insights",
};

export const STEALTH_PAGE_TITLES: Record<string, string> = {
  ...STEALTH_NAV_LABELS,
  "Practice Session": "Rehearsal",
  "Mock Practice": "Drills",
  "Session History": "History",
  "Performance Analytics": "Performance Reports",
  "Interview Scheduler": "Schedule",
  "Company Research": "Research",
};

export const STEALTH_BRAND = {
  name: "Clarify AI",
  tagline: "Practice workspace",
};

/**
 * When discrete UI is active, overlay opacity can auto-fade
 * when the mouse leaves the overlay region.
 */
export const STEALTH_OPACITY = {
  active: 1,
  faded: 0.15,
};

export const STEALTH_OVERLAY_ROOT_ID = "clarify-overlay-root";

export function getStealthLabel(label: string, isStealth: boolean): string {
  if (!isStealth) return label;
  return STEALTH_PAGE_TITLES[label] ?? STEALTH_NAV_LABELS[label] ?? label;
}
