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

export function getStealthLabel(label: string, isStealth: boolean): string {
  if (!isStealth) return label;
  return STEALTH_PAGE_TITLES[label] ?? STEALTH_NAV_LABELS[label] ?? label;
}
