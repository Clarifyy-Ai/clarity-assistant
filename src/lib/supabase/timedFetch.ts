/**
 * Bound fetch for the Supabase JS client.
 * Unbounded getSession/token-refresh was observed at ~35s in production,
 * which made the 15s profile budget always lose and blocked login.
 */
export const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

export function createTimedFetch(
  timeoutMs = SUPABASE_FETCH_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const userSignal = init?.signal ?? null;

    const onUserAbort = () => controller.abort();
    userSignal?.addEventListener("abort", onUserAbort);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    }
  };
}
