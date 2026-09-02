export const COMMUNITY_CATEGORIES = [
  "JavaScript",
  "React",
  "Python",
  "SQL",
  "Interview",
  "HR",
  "Resume",
  "Coding",
  "Aptitude",
  "Career",
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

export const MODERATION_STATES = [
  "PENDING",
  "PUBLISHED",
  "HIDDEN",
  "REPORTED",
  "RESOLVED",
] as const;

export type ModerationState = (typeof MODERATION_STATES)[number];

export function isCommunityCategory(value: string): value is CommunityCategory {
  return (COMMUNITY_CATEGORIES as readonly string[]).includes(value);
}

export function applyReport(status: ModerationState): ModerationState {
  if (status === "HIDDEN") return "HIDDEN";
  return "REPORTED";
}

export function applyHide(): ModerationState {
  return "HIDDEN";
}

export function applyRestore(): ModerationState {
  return "PUBLISHED";
}

export function applyResolve(): ModerationState {
  return "RESOLVED";
}

export function canPublicRead(status: ModerationState, isOwner: boolean, isAdmin: boolean): boolean {
  if (isAdmin || isOwner) return true;
  return status === "PUBLISHED" || status === "REPORTED" || status === "RESOLVED";
}

export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "text/csv",
] as const;

/** Canonical user-facing module label (sidebar, breadcrumbs, page titles). */
export const COMMUNITY_MODULE_LABEL = "Community";

export const COMMUNITY_MODULE_DESCRIPTION =
  "Ask questions, share answers, and report content for moderation.";
