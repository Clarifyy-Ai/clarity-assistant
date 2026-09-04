import {
  localStorageGetWithLegacy,
  localStorageSetBrand,
} from "@/lib/constants/brandStorage";

const STORAGE_KEY = "career-pilot-app-walkthrough-v1";
const LEGACY_KEYS = ["Clarify AI-app-walkthrough-v1"] as const;

function readMap(): Record<string, boolean> {
  try {
    const raw = localStorageGetWithLegacy(STORAGE_KEY, LEGACY_KEYS);
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
    localStorageSetBrand(STORAGE_KEY, JSON.stringify(map), LEGACY_KEYS);
  } catch {
    /* best-effort */
  }
}
