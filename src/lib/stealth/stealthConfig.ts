// src/lib/stealth/stealthConfig.ts

export const STEALTH_NAV_LABELS: Record<string, string> = {
  "Dashboard": "Home",
  "Live Co-Pilot": "Daily Standup",
  "Mock Interview": "Sprint Review",
  "Prep Lab": "Documentation",
  "Sessions": "Meeting Notes",
  "Analytics": "Reports",
  "Documents": "Files",
  "Answer Bank": "Knowledge Base",
  "Interviews": "Calendar",
  "Companies": "Clients",
  "Practice Rooms": "Team Rooms",
  "Notifications": "Inbox",
  "Settings": "Preferences",
};

export const STEALTH_SECTION_LABELS: Record<string, string> = {
  "Core": "Workspace",
  "Growth": "Resources",
  "Planner": "Projects",
};

export const STEALTH_PAGE_TITLES: Record<string, string> = {
  "Dashboard": "Home",
  "Live Co-Pilot": "Daily Standup",
  "Live Session": "Daily Standup",
  "Mock Interview": "Sprint Review",
  "Mock Practice": "Sprint Review",
  "Prep Lab": "Documentation",
  "Sessions": "Meeting Notes",
  "Session History": "Meeting Notes",
  "Analytics": "Reports",
  "Performance Analytics": "Performance Reports",
  "Documents": "Files",
  "Answer Bank": "Knowledge Base",
  "Interviews": "Calendar",
  "Interview Scheduler": "Project Timeline",
  "Companies": "Clients",
  "Company Research": "Client Research",
  "Practice Rooms": "Team Rooms",
  "Notifications": "Inbox",
  "Settings": "Preferences",
  "Referrals": "Invitations",
  "Interview Day": "Focus Mode",
  "Debrief": "Retrospective",
};

export const STEALTH_BRAND = {
  name: "WorkFlow",
  tagline: "Project Management Suite",
};

/**
 * Manual spec: when stealth is active, overlay opacity should auto-fade
 * to ~15% when the mouse leaves the overlay region (Ch. 6.2).
 * This is used by screenCaptureBlocker.ts to keep UX consistent.
 */
export const STEALTH_OPACITY = {
  active: 1,
  faded: 0.15,
};

/**
 * DOM id used by the overlay root element so stealth utilities can
 * attach opacity + focus listeners. Make sure your OverlayWindow
 * root uses this id (e.g. <div id="clarify-overlay-root">).
 */
export const STEALTH_OVERLAY_ROOT_ID = "clarify-overlay-root";

export function getStealthLabel(label: string, isStealth: boolean): string {
  if (!isStealth) return label;
  return STEALTH_PAGE_TITLES[label] ?? STEALTH_NAV_LABELS[label] ?? label;
}
