// ─────────────────────────────────────────────────────────────────────────────
// src/integrations/supabase/client.ts
// SINGLE SOURCE OF TRUTH — createClient() called EXACTLY ONCE here.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Hard fail if env vars are missing — never silently use placeholders ───────
if (!SUPABASE_URL || SUPABASE_URL.includes("https://qzgvjrvtkwlzxpmlddkx.supabase.co")) {
  throw new Error(
    "[Clarity] VITE_SUPABASE_URL is missing or is a placeholder. " +
    "Set it in Lovable Project Settings → Environment Variables."
  );
}

if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6Z3ZqcnZ0a3dsenhwbWxkZGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDE4MzAsImV4cCI6MjA4OTM3NzgzMH0.hsDv4Sk7L8on5zlr9K6LT1FQe3bEEzmav5bCYes-0so") {
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
