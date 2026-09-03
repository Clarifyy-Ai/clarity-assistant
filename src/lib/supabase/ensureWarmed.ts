// Shared first-connect warm for Supabase Auth.
// Profile/role/bootstrap must not share a hung getSession() with health.
// A lightweight /auth/v1/health ping opens TCP without occupying GoTrue init.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

let warmPromise: Promise<boolean> | null = null;
let warmedAt = 0;

const WARM_TTL_MS = 30_000;
const WARM_BUDGET_MS = 4_000;

export async function pingSupabaseAuthHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARM_BUDGET_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      signal: controller.signal,
    });
    return res.ok || res.status === 401;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ensures at least one Auth HTTP round-trip has completed recently.
 * Does NOT call getSession() — that can serialize behind a 30s+ token refresh.
 */
export function ensureSupabaseWarmed(): Promise<boolean> {
  const now = Date.now();
  if (warmPromise && now - warmedAt < WARM_TTL_MS) {
    return warmPromise;
  }

  warmedAt = now;
  warmPromise = pingSupabaseAuthHealth();
  return warmPromise;
}

/** Test-only: drop warm cache between cases. */
export function resetSupabaseWarmForTests(): void {
  warmPromise = null;
  warmedAt = 0;
}
