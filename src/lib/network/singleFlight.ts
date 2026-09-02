/**
 * In-flight request coalescing.
 *
 * Concurrent callers with the same method + function + body share one network
 * trip (double-clicks, Strict Mode remounts, overlapping pollers). After the
 * flight settles, the next call is a new request.
 */

const inflight = new Map<string, Promise<unknown>>();

export function coalesceKey(input: {
  method?: string;
  fnName: string;
  body?: unknown;
}): string {
  const method = String(input.method || "POST").toUpperCase();
  const fn = String(input.fnName || "").replace(/^\/+|\/+$/g, "");
  let bodyKey = "";
  if (input.body !== undefined && input.body !== null) {
    try {
      bodyKey = JSON.stringify(input.body);
    } catch {
      bodyKey = "[unserializable]";
    }
  }
  return `${method}:${fn}:${bodyKey}`;
}

export function singleFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const created = factory().finally(() => {
    if (inflight.get(key) === created) inflight.delete(key);
  });
  inflight.set(key, created);
  return created;
}

export function resetSingleFlightForTests(): void {
  inflight.clear();
}

export function inflightSizeForTests(): number {
  return inflight.size;
}
