/** Display labels for Hostinger tracking folders. Names must match Edge HOSTINGER_TRACKING_FOLDERS. */
export const HOSTINGER_TRACKING_FOLDERS = [
  { name: "OTPs", label: "OTPs" },
  { name: "Verifications", label: "Verifications" },
  { name: "PasswordResets", label: "Password resets" },
  { name: "MagicLinks", label: "Magic links" },
  { name: "Notifications", label: "Notifications" },
  { name: "InterviewReminders", label: "Interview reminders" },
  { name: "Welcome", label: "Welcome" },
  { name: "Support", label: "Support" },
  { name: "Billing", label: "Billing" },
] as const;

export const HOSTINGER_TRACKING_FOLDER_NAMES = HOSTINGER_TRACKING_FOLDERS.map((f) => f.name);

export function isTrackingFolder(folder: { path?: string; name?: string }): boolean {
  const name = (folder.name ?? "").trim().toLowerCase();
  const path = (folder.path ?? "").trim().toLowerCase();
  return HOSTINGER_TRACKING_FOLDER_NAMES.some((wanted) => {
    const key = wanted.toLowerCase();
    return name === key || path === key || path.endsWith(`.${key}`);
  });
}

export function trackingFolderLabel(folder: { path?: string; name?: string }): string {
  const name = (folder.name ?? "").trim();
  const match = HOSTINGER_TRACKING_FOLDERS.find((spec) => spec.name === name);
  return match?.label ?? folder.name ?? folder.path ?? "Folder";
}
