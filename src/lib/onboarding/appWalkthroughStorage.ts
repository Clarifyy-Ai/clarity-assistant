const STORAGE_KEY = "Clarify AI-app-walkthrough-v1";

function readMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function hasCompletedAppWalkthrough(userId: string | undefined): boolean {
  if (!userId) return true;
  return Boolean(readMap()[userId]);
}

export function markAppWalkthroughCompleted(userId: string): void {
  try {
    const map = readMap();
    map[userId] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}
