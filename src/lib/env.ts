// src/lib/env.ts — ✅ SECURE PRODUCTION VERSION

type RawEnv = Record<string, string | undefined>;

const rawEnv = import.meta.env as RawEnv;

/**
 * ✅ Strict environment resolver
 * - NEVER allows fallback for secrets
 * - Forces correct .env usage
 */
function firstDefined(keys: string[]): string {
  for (const key of keys) {
    const value = rawEnv[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const msg = `[env] Missing required environment variable: ${keys.join(", ")}. 
👉 Copy .env.example → .env.local and set values.`;

  console.error(msg);
  throw new Error(msg);
}

/**
 * ✅ Optional env resolver
 */
function optional(keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = rawEnv[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

/**
 * ✅ ENV EXPORT (STRICT & SAFE)
 */
export const ENV = {
  // 🔐 REQUIRED (WILL THROW IF MISSING)
  SUPABASE_URL: firstDefined(["VITE_SUPABASE_URL"]),
  SUPABASE_ANON_KEY: firstDefined(["VITE_SUPABASE_ANON_KEY"]),
  SUPABASE_PUBLISHABLE_KEY: firstDefined(["VITE_SUPABASE_PUBLISHABLE_KEY"]),

  // ⚙️ OPTIONAL
  SENTRY_DSN: optional(["VITE_SENTRY_DSN"]),
  STRIPE_PUBLIC_KEY: optional(["VITE_STRIPE_PUBLIC_KEY"]),
  APP_ENV: optional(["VITE_APP_ENV"], "development"),
  APP_URL: optional(["VITE_APP_URL"]),
  API_URL: optional(["VITE_API_URL"], "/api"),

  POSTHOG_KEY: optional(["VITE_POSTHOG_KEY"]),
  POSTHOG_HOST: optional(["VITE_POSTHOG_HOST"], "https://app.posthog.com"),

  // 💳 Stripe Plans (Optional)
  STRIPE_PRICE_STARTER_MONTHLY: optional(["VITE_STRIPE_PRICE_STARTER_MONTHLY"]),
  STRIPE_PRICE_STARTER_YEARLY: optional(["VITE_STRIPE_PRICE_STARTER_YEARLY"]),
  STRIPE_PRICE_PRO_MONTHLY: optional(["VITE_STRIPE_PRICE_PRO_MONTHLY"]),
  STRIPE_PRICE_PRO_YEARLY: optional(["VITE_STRIPE_PRICE_PRO_YEARLY"]),
  STRIPE_PRICE_ELITE_MONTHLY: optional(["VITE_STRIPE_PRICE_ELITE_MONTHLY"]),
  STRIPE_PRICE_ELITE_YEARLY: optional(["VITE_STRIPE_PRICE_ELITE_YEARLY"]),

  STRIPE_PRICE_CREDITS_10: optional(["VITE_STRIPE_PRICE_CREDITS_10"]),
  STRIPE_PRICE_CREDITS_50: optional(["VITE_STRIPE_PRICE_CREDITS_50"]),
  STRIPE_PRICE_CREDITS_150: optional(["VITE_STRIPE_PRICE_CREDITS_150"]),
  STRIPE_PRICE_CREDITS_500: optional(["VITE_STRIPE_PRICE_CREDITS_500"]),
} as const;

/**
 * ✅ Named exports (backward compatibility)
 */
export const SUPABASE_URL = ENV.SUPABASE_URL;
export const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
export const SUPABASE_PUBLISHABLE_KEY = ENV.SUPABASE_PUBLISHABLE_KEY;

/**
 * ✅ Edge function base URL
 */
export const EDGE_BASE = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;
