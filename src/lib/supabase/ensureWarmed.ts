// Shared first-connect warm for Supabase Auth.
// Profile/role/bootstrap all race on cold start; one in-flight getSession
// prevents concurrent 4–6s timeouts while the first RTT is still opening.

import { supabase } from "@/integrations/supabase/client";

let warmPromise: Promise<void> | null = null;
let warmedAt = 0;

const WARM_TTL_MS = 30_000;

/**
 * Ensures at least one Auth round-trip has completed recently.
 * Safe to call from health check and auth bootstrap in parallel.
 */
export function ensureSupabaseWarmed(): Promise<void> {
  const now = Date.now();
  if (warmPromise && now - warmedAt < WARM_TTL_MS) {
    return warmPromise;
  }

  warmedAt = now;
  warmPromise = (async () => {
    try {
      await supabase.auth.getSession();
    } catch {
      // Callers still run their own timed requests; warm is best-effort.
    }
  })().finally(() => {
    // Keep the resolved promise for TTL so concurrent callers join it.
  });

  return warmPromise;
}

/** Test-only: drop warm cache between cases. */
export function resetSupabaseWarmForTests(): void {
  warmPromise = null;
  warmedAt = 0;
}
