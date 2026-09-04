/**
 * In-memory + sessionStorage persistence for Practice Coach context snapshots.
 * Full freeze lives client-side for the tab; meta (id/checksum) can be attached to sessions.
 */

import { ss } from "@/lib/storage/sessionStorage";
import {
  isPracticeCoachContextSnapshot,
  type PracticeCoachContextSnapshot,
} from "@/lib/session/practiceCoachContext";

const STORAGE_PREFIX = "practice-coach-context-v1:";
const memory = new Map<string, PracticeCoachContextSnapshot>();

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function setPracticeCoachContextSnapshot(
  sessionId: string,
  snapshot: PracticeCoachContextSnapshot,
): void {
  if (!sessionId) return;
  memory.set(sessionId, snapshot);
  ss.set(storageKey(sessionId), snapshot);
}

export function getPracticeCoachContextSnapshot(
  sessionId: string | null | undefined,
): PracticeCoachContextSnapshot | null {
  if (!sessionId) return null;
  const hit = memory.get(sessionId);
  if (hit && isPracticeCoachContextSnapshot(hit)) return hit;
  const stored = ss.get<unknown>(storageKey(sessionId));
  if (isPracticeCoachContextSnapshot(stored)) {
    memory.set(sessionId, stored);
    return stored;
  }
  return null;
}

export function clearPracticeCoachContextSnapshot(
  sessionId?: string | null,
): void {
  if (sessionId) {
    memory.delete(sessionId);
    ss.remove(storageKey(sessionId));
    return;
  }
  memory.clear();
}
