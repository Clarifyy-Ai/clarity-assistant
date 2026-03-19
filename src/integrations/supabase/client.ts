import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qzgvjrvtkwlzxpmlddkx.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6Z3ZqcnZ0a3dsenhwbWxkZGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDE4MzAsImV4cCI6MjA4OTM3NzgzMH0.hsDv4Sk7L8on5zlr9K6LT1FQe3bEEzmav5bCYes-0so";

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    "[ConfideQ] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Running in demo mode."
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "confideq-auth",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    flowType: "pkce",
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      "x-app-name": "confideq",
      "x-app-version": "1.0.0",
    },
  },
  db: {
    schema: "public",
  },
});

// Convenience aliases
export const auth = supabase.auth;
export const table = <T extends keyof Database["public"]["Tables"]>(name: T) =>
  supabase.from(name);
export const bucket = (name: string) => supabase.storage.from(name);
export const realtimeChannel = (name: string) => supabase.channel(name);

/** Quick connectivity check */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
