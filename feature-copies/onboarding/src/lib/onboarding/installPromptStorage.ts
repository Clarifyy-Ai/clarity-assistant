const DISMISS_KEY = "Clarify AI-install-prompt-dismissed-v1";
const SNOOZE_KEY = "Clarify AI-install-prompt-snooze-v1";

function readDismissMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function readSnoozeMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function hasDismissedInstallPrompt(userId: string | undefined): boolean {
  if (!userId) return true;
  return Boolean(readDismissMap()[userId]);
}

export function dismissInstallPrompt(userId: string): void {
  try {
    const map = readDismissMap();
    map[userId] = true;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}

export function snoozeInstallPrompt(userId: string, hours = 24): void {
  try {
    const map = readSnoozeMap();
    map[userId] = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}

export function isInstallPromptSnoozed(userId: string | undefined): boolean {
  if (!userId) return true;
  const until = readSnoozeMap()[userId];
  if (!until) return false;
  if (Date.now() >= until) return false;
  return true;
}
