// Runtime health check for Supabase configuration and connectivity.
// Verifies VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY are present
// and that the client can reach Supabase auth.

import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

export type SupabaseHealth = {
  ok: boolean;
  envPresent: boolean;
  canConnect: boolean;
  url: string;
  keyPreview: string;
  latencyMs: number | null;
  error: string | null;
};

export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  const envPresent =
    typeof SUPABASE_URL === "string" &&
    SUPABASE_URL.length > 0 &&
    typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
    SUPABASE_PUBLISHABLE_KEY.length > 0;

  const keyPreview = SUPABASE_PUBLISHABLE_KEY
    ? `${SUPABASE_PUBLISHABLE_KEY.slice(0, 6)}…${SUPABASE_PUBLISHABLE_KEY.slice(-4)}`
    : "(missing)";

  if (!envPresent) {
    return {
      ok: false,
      envPresent: false,
      canConnect: false,
      url: SUPABASE_URL ?? "",
      keyPreview,
      latencyMs: null,
      error: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  const start = performance.now();
  try {
    const { error } = await supabase.auth.getSession();
    const latencyMs = Math.round(performance.now() - start);
    if (error) {
      return {
        ok: false,
        envPresent: true,
        canConnect: false,
        url: SUPABASE_URL,
        keyPreview,
        latencyMs,
        error: error.message,
      };
    }
    return {
      ok: true,
      envPresent: true,
      canConnect: true,
      url: SUPABASE_URL,
      keyPreview,
      latencyMs,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      envPresent: true,
      canConnect: false,
      url: SUPABASE_URL,
      keyPreview,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Convenience: log result to the console. Safe to call from app bootstrap.
export async function logSupabaseHealth(): Promise<SupabaseHealth> {
  const result = await checkSupabaseHealth();
  const tag = "[supabase:health]";
  if (result.ok) {
    // SECURITY: Do not log key fragments. Log only non-sensitive config indicators.
    console.info(
      `${tag} \u2705 connected (${result.latencyMs}ms) url=${result.url} supabaseConfigured=true`
    );
  } else {
    console.error(`${tag} \u274c ${result.error}`, {
      ok: result.ok,
      envPresent: result.envPresent,
      canConnect: result.canConnect,
      url: result.url,
      latencyMs: result.latencyMs,
      // key intentionally omitted
    });
  }
  return result;
}
