// ─────────────────────────────────────────────────────────────────
// fetchEdge — Authenticated Edge Function calls.
// Always attaches the user's JWT (not the anon key) as Bearer token.
// Falls back to anon key only if no session exists (public endpoints).
// ─────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { EDGE_BASE } from "@/lib/env";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    console.warn("[fetchEdge] No session JWT available — using anon key");
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    };
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

export async function fetchEdge(
  fnName: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(`${EDGE_BASE}/${fnName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  });
}
