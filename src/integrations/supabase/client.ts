// ─────────────────────────────────────────────────────────────────────────────
// src/integrations/supabase/client.ts
// SINGLE SOURCE OF TRUTH — createClient() called EXACTLY ONCE here.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Hard fail if env vars are missing — never silently use placeholders ───────
if (!SUPABASE_URL || SUPABASE_URL.includes("your-project-ref")) {
  throw new Error(
    "[Clarity] VITE_SUPABASE_URL is missing or is a placeholder. " +
    "Set it in Lovable Project Settings → Environment Variables."
  );
}

if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "your-anon-key") {
  throw new Error(
    "[Clarity] VITE_SUPABASE_PUBLISHABLE_KEY is missing or is a placeholder. " +
    "Set it in Lovable Project Settings → Environment Variables."
  );
}

// ── Singleton — one instance for the entire app lifetime ─────────────────────
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey:         "confideq-auth",
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storage:            typeof window !== "undefined" ? window.localStorage : undefined,
    flowType:           "pkce",
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    headers: {
      "x-app-name":    "clarity-ai",
      "x-app-version": "1.0.0",
    },
  },
  db: { schema: "public" },
});

export const auth              = supabase.auth;
export const table             = <T extends keyof Database["public"]["Tables"]>(name: T) => supabase.from(name);
export const bucket            = (name: string) => supabase.storage.from(name);
export const realtimeChannel   = (name: string) => supabase.channel(name);

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
