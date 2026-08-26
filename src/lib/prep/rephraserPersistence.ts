export type RephraserAlternatives = {
  formal: string;
  confident: string;
  concise: string;
};

export type PersistedRephraserState = {
  original: string;
  alternatives: RephraserAlternatives | null;
  error: string | null;
  offlineFallback: boolean;
  idempotencyKey: string | null;
};

const STORAGE_KEY = "clarify-prep-rephrase-state";

export function rephraserStorageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

function isAlternatives(value: unknown): value is RephraserAlternatives {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["formal", "confident", "concise"].every(
    (key) => typeof candidate[key] === "string",
  );
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readPersistedRephraserState(
  userId?: string,
): PersistedRephraserState | null {
  if (!userId) return null;
  const store = storage();
  if (!store) return null;
  try {
    // Prefer localStorage (survives refresh). Migrate legacy sessionStorage once.
    let raw = store.getItem(rephraserStorageKey(userId));
    if (!raw) {
      try {
        raw = sessionStorage.getItem(rephraserStorageKey(userId));
        if (raw) {
          store.setItem(rephraserStorageKey(userId), raw);
          sessionStorage.removeItem(rephraserStorageKey(userId));
        }
      } catch {
        /* ignore */
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRephraserState>;
    return {
      original: typeof parsed.original === "string" ? parsed.original : "",
      alternatives: isAlternatives(parsed.alternatives)
        ? parsed.alternatives
        : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
      offlineFallback: parsed.offlineFallback === true,
      idempotencyKey:
        typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : null,
    };
  } catch {
    return null;
  }
}

export function writePersistedRephraserState(
  userId: string | undefined,
  state: PersistedRephraserState,
): void {
  if (!userId) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(rephraserStorageKey(userId), JSON.stringify(state));
  } catch {
    // Storage is an enhancement; generation must still work if it is blocked.
  }
}
