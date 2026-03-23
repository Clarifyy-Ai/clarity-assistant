// ─────────────────────────────────────────────────────────────────────────────
// src/lib/env.ts — Centralized environment variable access with startup validation.
// Import typed constants from here instead of using import.meta.env directly.
// ─────────────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = import.meta.env[key] as string | undefined;
  if (!val) {
    const msg = `[env] FATAL: Missing required environment variable: ${key}. The app cannot function without it.`;
    console.error(msg);
    throw new Error(msg);
  }
  return val;
}

function optionalEnv(key: string, defaultValue = ""): string {
  return (import.meta.env[key] as string | undefined) ?? defaultValue;
}

export const ENV = {
  SUPABASE_URL:      requireEnv("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: requireEnv("VITE_SUPABASE_ANON_KEY"),
  SENTRY_DSN:        optionalEnv("VITE_SENTRY_DSN"),
  DEEPGRAM_API_KEY:  optionalEnv("VITE_DEEPGRAM_API_KEY"),
  STRIPE_PUBLIC_KEY: optionalEnv("VITE_STRIPE_PUBLIC_KEY"),
  APP_ENV:           optionalEnv("VITE_APP_ENV", "development"),
  APP_URL:           optionalEnv("VITE_APP_URL"),
  API_URL:           optionalEnv("VITE_API_URL", "/api"),
  POSTHOG_KEY:       optionalEnv("VITE_POSTHOG_KEY"),
  POSTHOG_HOST:      optionalEnv("VITE_POSTHOG_HOST", "https://app.posthog.com"),
  STRIPE_PRICE_STARTER_MONTHLY: optionalEnv("VITE_STRIPE_PRICE_STARTER_MONTHLY"),
  STRIPE_PRICE_STARTER_YEARLY:  optionalEnv("VITE_STRIPE_PRICE_STARTER_YEARLY"),
  STRIPE_PRICE_PRO_MONTHLY:     optionalEnv("VITE_STRIPE_PRICE_PRO_MONTHLY"),
  STRIPE_PRICE_PRO_YEARLY:      optionalEnv("VITE_STRIPE_PRICE_PRO_YEARLY"),
  STRIPE_PRICE_ELITE_MONTHLY:   optionalEnv("VITE_STRIPE_PRICE_ELITE_MONTHLY"),
  STRIPE_PRICE_ELITE_YEARLY:    optionalEnv("VITE_STRIPE_PRICE_ELITE_YEARLY"),
  STRIPE_PRICE_CREDITS_10:      optionalEnv("VITE_STRIPE_PRICE_CREDITS_10"),
  STRIPE_PRICE_CREDITS_50:      optionalEnv("VITE_STRIPE_PRICE_CREDITS_50"),
  STRIPE_PRICE_CREDITS_150:     optionalEnv("VITE_STRIPE_PRICE_CREDITS_150"),
  STRIPE_PRICE_CREDITS_500:     optionalEnv("VITE_STRIPE_PRICE_CREDITS_500"),
} as const;

export const SUPABASE_URL      = ENV.SUPABASE_URL;
export const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;

export const EDGE_BASE = `${ENV.SUPABASE_URL}/functions/v1`;
