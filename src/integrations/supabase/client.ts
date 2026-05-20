// src/integrations/supabase/client.ts
//
// Supabase browser client initialization.
//
// SECURITY PURPOSE:
// - Use environment-provided Supabase URL and public client key only
// - Reject missing/placeholder environment values at startup
// - Use PKCE auth flow for SPA security
// - Keep client initialization centralized
// - Avoid hardcoded Supabase credentials in source code
//
// IMPORTANT SECURITY NOTE:
// Supabase public anon/publishable keys are browser-visible by design.
// They are NOT secret keys.
// Real data protection must be enforced using:
// - Row Level Security (RLS)
// - strict policies
// - backend authorization checks
// - no service role key in frontend

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY,
} from "@/lib/env";

const URL_PLACEHOLDERS = [
  "your-project-id",
  "your-project-ref",
  "your_project",
  "example.supabase.co",
  "localhost",
  "127.0.0.1",
];

const KEY_PLACEHOLDERS = [
  "your-anon-key",
  "your_anon_key",
  "your-publishable-key",
  "your_publishable_key",
  "placeholder",
  "replace-me",
  "changeme",
  "example",
];

function isPlaceholder(value: string, placeholders: string[]): boolean {
  const normalized = value.trim().toLowerCase();

  return placeholders.some((placeholder) =>
    normalized.includes(placeholder.toLowerCase())
  );
}

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".supabase.co")
    );
  } catch {
    return false;
  }
}

function assertValidSupabaseConfig(): void {
  if (!SUPABASE_URL || isPlaceholder(SUPABASE_URL, URL_PLACEHOLDERS)) {
    throw new Error(
      "[ClarifyAI] VITE_SUPABASE_URL is missing or still a placeholder. Set it in your environment variables."
    );
  }

  if (!isValidSupabaseUrl(SUPABASE_URL)) {
    throw new Error(
      "[ClarifyAI] VITE_SUPABASE_URL must be a valid HTTPS Supabase project URL ending with .supabase.co."
    );
  }

  if (
    !SUPABASE_PUBLISHABLE_KEY ||
    isPlaceholder(SUPABASE_PUBLISHABLE_KEY, KEY_PLACEHOLDERS)
  ) {
    throw new Error(
      "[ClarifyAI] VITE_SUPABASE_PUBLISHABLE_KEY is missing or still a placeholder."
    );
  }

  if (
    !SUPABASE_ANON_KEY ||
    isPlaceholder(SUPABASE_ANON_KEY, KEY_PLACEHOLDERS)
  ) {
    throw new Error(
      "[ClarifyAI] VITE_SUPABASE_ANON_KEY is missing or still a placeholder."
    );
  }
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

assertValidSupabaseConfig();

const supabaseClientKey = SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(
  SUPABASE_URL,
  supabaseClientKey,
  {
    auth: {
      storageKey: "clarifyai-auth",

      // SECURITY NOTE:
      // Supabase stores browser sessions in localStorage by default.
      // This is common for SPAs but can be exposed by XSS.
      //
      // Mitigations implemented elsewhere:
      // - CSP in index.html
      // - DOMPurify sanitization utilities
      // - no dangerouslySetInnerHTML without sanitization
      // - strict input validation
      persistSession: true,

      autoRefreshToken: true,
      detectSessionInUrl: true,

      storage: getBrowserStorage(),

      // PKCE is the correct OAuth flow for browser/SPAs.
      flowType: "pkce",
    },

    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },

    global: {
      headers: {
        "x-app-name": "clarify-ai",
        "x-app-version": "1.0.0",
      },
    },

    db: {
      schema: "public",
    },
  }
);

export const auth = supabase.auth;

export function table<T extends keyof Database["public"]["Tables"]>(name: T) {
  return supabase.from(name);
}

export function bucket(name: string) {
  return supabase.storage.from(name);
}

export function realtimeChannel(name: string) {
  return supabase.channel(name);
}

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY };
