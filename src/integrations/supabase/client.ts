// src/integrations/supabase/client.ts// src/in
// - Keep client initialization centralized
// - Avoid hardcoded Supabase credentials in source code
//
// IMPORTANT SECURITY NOTE:
// Supabase public anon/publishable keys are browser-visible by design.
// They are NOT secret keys.
//
// Real data protection must be enforced using:
// - Row Level Security
// - strict policies
// - backend authorization checks
// - never exposing service-role keys in frontend code

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

import {
  ENV,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY,
} from "@/lib/env";

const URL_PLACEHOLDERS = [
  "your-project-id",
  "your-project-ref",
  "your_project",
  "example.supabase.co",
  "replace-me",
  "changeme",
  "placeholder",
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

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isLocalSupabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function isValidSupabaseUrl(value: string): boolean {
  if (!isValidHttpUrl(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);

    // Production Supabase cloud project.
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co")) {
      return true;
    }

    // Local Supabase development.
    if (parsed.protocol === "http:" && isLocalSupabaseUrl(value)) {
      return true;
    }

    // Custom domain / self-hosted Supabase must use HTTPS.
    if (parsed.protocol === "https:") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function assertValidPublicClientKey(name: string, value: string): void {
  if (!value || isPlaceholder(value, KEY_PLACEHOLDERS)) {
    throw new Error(
      `[ClarifyAI] ${name} is missing or still a placeholder. Set it in your environment variables.`
    );
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
      "[ClarifyAI] VITE_SUPABASE_URL must be a valid Supabase URL. Use https://<project>.supabase.co, a secure custom HTTPS URL, or local Supabase during development."
    );
  }

  // env.ts already allows fallback between anon/publishable keys.
  assertValidPublicClientKey("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
  assertValidPublicClientKey(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    SUPABASE_PUBLISHABLE_KEY
  );
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

function getAppVersion(): string {
  const version =
    typeof import.meta.env.VITE_APP_VERSION === "string"
      ? import.meta.env.VITE_APP_VERSION.trim()
      : "";

  return version || "1.0.0";
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
      // - CSP
      // - sanitizer utilities
      // - no unsafe HTML rendering
      // - strict input validation
      persistSession: true,

      autoRefreshToken: true,

      // Required for OAuth/magic-link callbacks.
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
        "x-app-version": getAppVersion(),
        "x-app-env": ENV.APP_ENV,
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
    const { error } = await supabase.from("profiles").select("id").limit(1);

    return !error;
  } catch {
    return false;
  }
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY };
//
// Supabase browser client initialization.
//
// SECURITY PURPOSE:
// - Use environment-provided Supabase URL and public client key only
// - Reject missing/placeholder environment values at startup
