// ─────────────────────────────────────────────────────────────────────────────
// src/integrations/supabase/client.ts
// SINGLE SOURCE OF TRUTH — createClient() called EXACTLY ONCE here.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// ── Placeholder patterns — throw early so errors are obvious ─────────────────
const URL_PLACEHOLDERS = [
  "your-project-ref",
  "your_project",
  "placeholder",
  "example.supabase.co",
];

const KEY_PLACEHOLDERS = [
  "your-anon-key",
  "your_anon",
  "phc_your",       // also catches PostHog placeholder if mistakenly set here
  "placeholder",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlbXBsYXRlIn",
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

export { SUPABASE_URL, SUPABASE_ANON_KEY };
