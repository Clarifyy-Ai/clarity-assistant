// ─────────────────────────────────────────────────────────────────────────────
// src/integrations/supabase/client.ts
// SINGLE SOURCE OF TRUTH — createClient() called EXACTLY ONCE here.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// ── Read env vars — names must match exactly what's in .env ──────────────────
// .env defines: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL            as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// ── Placeholder detection — only matches obvious placeholder strings ───────────
// Do NOT add real project refs here — that was the original crash bug
const URL_PLACEHOLDERS = [
  "your-project-id",
  "your-project-ref",
  "your_project",
  "example.supabase.co",
];

const KEY_PLACEHOLDERS = [
  "your-anon-key",
  "your_anon_key",
  "your-publishable-key",
];

const urlIsMissing =
  !SUPABASE_URL ||
  URL_PLACEHOLDERS.some((p) => SUPABASE_URL.toLowerCase().includes(p));

const keyIsMissing =
  !SUPABASE_ANON_KEY ||
  KEY_PLACEHOLDERS.some((p) => SUPABASE_ANON_KEY.toLowerCase().includes(p));

if (urlIsMissing) {
  throw new Error(
    "[Clarity] VITE_SUPABASE_URL is missing or is a placeholder. " +
      "Set it in Lovable Project Settings → Environment Variables."
  );
}

if (keyIsMissing) {
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

export const auth            = supabase.auth;
export const table           = <T extends keyof Database["public"]["Tables"]>(name: T) =>
  supabase.from(name);
export const bucket          = (name: string) => supabase.storage.from(name);
export const realtimeChannel = (name: string) => supabase.channel(name);

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

// Export under both names for compatibility
export { SUPABASE_URL, SUPABASE_ANON_KEY };
export { SUPABASE_ANON_KEY as SUPABASE_PUBLISHABLE_KEY };
