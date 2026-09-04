import type { LicenseType } from "@/lib/content/license";

export const LIBRARY_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export function isAllowedLibraryMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return (LIBRARY_MIME_TYPES as readonly string[]).includes(mime);
}

export function canAccessDocument(ownerId: string, viewerId: string, viewerIsAdmin = false): boolean {
  if (viewerIsAdmin) return true;
  return ownerId === viewerId;
}

export function requiresRightsConfirmation(rights: LicenseType): boolean {
  return rights === "LICENSED" || rights === "USER_OWNED" || rights === "UNKNOWN";
}

export function canCreatePracticeSet(opts: {
  ownerId: string;
  viewerId: string;
  rightsConfirmed: boolean;
  contentRights: LicenseType;
}): boolean {
  if (opts.ownerId !== opts.viewerId) return false;
  if (opts.contentRights === "UNKNOWN") return false;
  if (requiresRightsConfirmation(opts.contentRights) && !opts.rightsConfirmed) return false;
  return true;
}

/** Practice generation requires a completed parse with normalized text. */
export function canCreatePracticeSetFromParsedDoc(opts: {
  ownerId: string;
  viewerId: string;
  rightsConfirmed: boolean;
  contentRights: LicenseType;
  processingStatus: string | null | undefined;
  hasParsedContent: boolean;
}): boolean {
  if (!canCreatePracticeSet(opts)) return false;
  const status = String(opts.processingStatus ?? "").trim().toLowerCase();
  if (status !== "completed" && status !== "ready") return false;
  return opts.hasParsedContent;
}
