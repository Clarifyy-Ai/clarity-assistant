/** Deterministic cache key for analyze-paper-trends (SQL, not Gemini). */
export function paperTrendsCacheKey(
  examId: string,
  stageId: string,
  years: readonly number[],
): string {
  return `${examId}|${stageId}|${years.join(",")}`;
}

/**
 * Return a cached value or share one in-flight load for the same key.
 * Failed loads are not cached so a later visit can retry.
 */
export async function getOrLoadPaperTrends<T>(
  cache: Map<string, T>,
  inflight: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const next = load().then(
    (value) => {
      cache.set(key, value);
      inflight.delete(key);
      return value;
    },
    (err) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, next);
  return next;
}
