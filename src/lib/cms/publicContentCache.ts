/**
 * In-memory public catalog cache for help articles and learning courses.
 * Admin publish/unpublish must bump generation so public pages do not serve
 * a stale published snapshot from the same JS runtime.
 */

export type PublicContentCacheScope = "help" | "learning" | "blog" | "community";

type CacheEntry<T> = {
  generation: number;
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();
let generation = 0;
const DEFAULT_TTL_MS = 60_000;

export function publicContentCacheGeneration(): number {
  return generation;
}

export function invalidatePublicContentCache(
  _scopes?: PublicContentCacheScope | PublicContentCacheScope[],
): void {
  generation += 1;
  store.clear();
}

export async function getOrLoadPublicContent<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (hit && hit.generation === generation && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await loader();
  store.set(key, { generation, expiresAt: now + ttlMs, value });
  return value;
}
