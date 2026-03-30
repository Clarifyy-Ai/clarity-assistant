// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

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
  "your_publishable_key",
];

const urlIsMissing =
  !SUPABASE_URL ||
  URL_PLACEHOLDERS.some((p) => SUPABASE_URL.toLowerCase().includes(p));

const keyIsMissing =
  !SUPABASE_PUBLISHABLE_KEY ||
  KEY_PLACEHOLDERS.some((p) =>
    SUPABASE_PUBLISHABLE_KEY.toLowerCase().includes(p)
  );

if (urlIsMissing) {
  throw new Error(
    "[ClarifyAI] VITE_SUPABASE_URL is missing or still a placeholder. Set it in your environment variables."
  );
}

if (keyIsMissing) {
  throw new Error(
    "[ClarifyAI] Supabase publishable/anon key is missing or still a placeholder. Set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storageKey: "clarifyai-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      flowType: "pkce",
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    global: {
      headers: {
        "x-app-name": "clarify-ai",
        "x-app-version": "1.0.0",
      },
    },
    db: { schema: "public" },
  }
);

export const auth = supabase.auth;

export const table = <
  T extends keyof Database["public"]["Tables"]
>(
  name: T
) => supabase.from(name);

export const bucket = (name: string) => supabase.storage.from(name);
export const realtimeChannel = (name: string) => supabase.channel(name);

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export { SUPABASE_URL };
export const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;
export { SUPABASE_PUBLISHABLE_KEY };
