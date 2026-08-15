/**
 * Local recovery queue for exam responses when the network drops.
 * Server rows remain the source of truth after reconnect.
 */

export type QueuedAttemptResponse = {
  question_id: string;
  user_answer: string;
  is_attempted: boolean;
  is_marked_review: boolean;
  time_spent_seconds: number;
  queued_at: number;
};

export type AttemptRecoverySnapshot = {
  test_id: string;
  user_id: string;
  current_index: number;
  responses: QueuedAttemptResponse[];
  updated_at: number;
};

const KEY_PREFIX = "clarify:exam-recovery:";

function storageKey(testId: string, userId: string): string {
  return `${KEY_PREFIX}${userId}:${testId}`;
}

export function saveAttemptRecovery(snapshot: AttemptRecoverySnapshot): void {
  try {
    localStorage.setItem(storageKey(snapshot.test_id, snapshot.user_id), JSON.stringify(snapshot));
  } catch {
    // quota / private mode
  }
}

export function loadAttemptRecovery(
  testId: string,
  userId: string,
): AttemptRecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(testId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttemptRecoverySnapshot;
    if (parsed.test_id !== testId || parsed.user_id !== userId) return null;
    if (!Array.isArray(parsed.responses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAttemptRecovery(testId: string, userId: string): void {
  try {
    localStorage.removeItem(storageKey(testId, userId));
  } catch {
    // ignore
  }
}

export function mergeRecoveryResponses(
  server: Record<string, { answer: string; state: string }>,
  queued: QueuedAttemptResponse[],
): Record<string, { answer: string; marked: boolean }> {
  const merged: Record<string, { answer: string; marked: boolean }> = {};
  for (const [id, row] of Object.entries(server)) {
    merged[id] = { answer: row.answer, marked: row.state.includes("marked") };
  }
  const sorted = [...queued].sort((a, b) => a.queued_at - b.queued_at);
  for (const item of sorted) {
    merged[item.question_id] = {
      answer: item.user_answer,
      marked: item.is_marked_review,
    };
  }
  return merged;
}
