// src/lib/env.ts
//
// Secure frontend environment resolver.
//
// SECURITY PURPOSE:
// - Centralize all Vite environment access
// - Fail fast when required public frontend env vars are missing
// - Never expose server-only secrets in frontend code
// - Keep Stripe price IDs frontend-visible but not trusted for backend billing
// - Provide backward-compatible named exports
//
// IMPORTANT:
// Only VITE_* variables are available in frontend bundles.
// Never put service-role keys, Stripe secret keys, webhook secrets,
// Gemini/OpenAI/Anthropic server keys, or any private secret here.

import { PUBLIC_WEBSITE_URL } from "@/lib/constants/contact";
import { resolveCriticalSupabaseEnv } from "./envCritical";

type RawEnv = Record<string, string | undefined>;

const rawEnv = import.meta.env as RawEnv;

// Supabase URL/anon key are auto-populated into VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY by Lovable Cloud at build time. In production
// builds we refuse hardcoded project fallbacks so missing config fails loudly
// (main.tsx shows the boot error UI) instead of silently pointing at a stale
// project. Development/local still uses public fallbacks for easy boot.

export type AppEnvironment =
  | "development"
  | "staging"
  | "production"
  | "test";

function optional(keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = rawEnv[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function parseAppEnvironment(value: string): AppEnvironment {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "development" ||
    normalized === "staging" ||
    normalized === "production" ||
    normalized === "test"
  ) {
    return normalized;
  }
  return "development";
}

function assertValidUrl(value: string, name: string, fallback: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol.");
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    console.error(`[env] ${name} must be a valid http(s) URL. Using fallback.`);
    return fallback.replace(/\/+$/, "");
  }
}

function normalizeOptionalUrl(value: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizePathOrUrl(value: string, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith("/")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString().replace(/\/+$/, "");
    }
    return fallback;
  } catch {
    return fallback;
  }
}

const APP_ENV_VALUE = parseAppEnvironment(
  optional(["VITE_APP_ENV", "APP_ENV"], "development")
);

// Public (safe-to-ship) fallbacks. The app must boot even when env injection
// fails (stale cached bundles, missing .env in preview, etc.), so we never
// throw here — we log the problem and fall back to the known project values.
const FALLBACK_SUPABASE_URL = "https://qzgvjrvtkwlzxpmlddkx.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6Z3ZqcnZ0a3dsenhwbWxkZGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDE4MzAsImV4cCI6MjA4OTM3NzgzMH0.hsDv4Sk7L8on5zlr9K6LT1FQe3bEEzmav5bCYes-0so";

let criticalSupabase: { url: string; anonKey: string };
try {
  criticalSupabase = resolveCriticalSupabaseEnv({
    url: optional(["VITE_SUPABASE_URL"]),
    anonKey: optional(["VITE_SUPABASE_ANON_KEY"]),
    publishableKey: optional(["VITE_SUPABASE_PUBLISHABLE_KEY"]),
    failClosed: false,
    fallbackUrl: FALLBACK_SUPABASE_URL,
    fallbackKey: FALLBACK_SUPABASE_ANON_KEY,
  });
} catch (e) {
  console.error("[env] Failed to resolve Supabase env; using fallback.", e);
  criticalSupabase = {
    url: FALLBACK_SUPABASE_URL,
    anonKey: FALLBACK_SUPABASE_ANON_KEY,
  };
}

const SUPABASE_URL_VALUE = assertValidUrl(
  criticalSupabase.url,
  "VITE_SUPABASE_URL",
  FALLBACK_SUPABASE_URL,
);

const SUPABASE_ANON_KEY_VALUE = criticalSupabase.anonKey;

const SUPABASE_PUBLISHABLE_KEY_VALUE = optional(
  ["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"],
  criticalSupabase.anonKey,
);


const APP_URL_RAW = normalizeOptionalUrl(optional(["VITE_APP_URL"]));
const APP_URL_IS_LOCALHOST =
  Boolean(APP_URL_RAW) &&
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/i.test(APP_URL_RAW);
const APP_URL_VALUE =
  APP_ENV_VALUE === "production"
    ? APP_URL_IS_LOCALHOST || !APP_URL_RAW
      ? PUBLIC_WEBSITE_URL
      : APP_URL_RAW
    : APP_URL_RAW;

const API_URL_VALUE = normalizePathOrUrl(
  optional(["VITE_API_URL"], "/api"),
  "/api"
);

const POSTHOG_HOST_VALUE = normalizeOptionalUrl(
  optional(["VITE_POSTHOG_HOST"], "https://app.posthog.com")
);

export const ENV = {
  // Required public Supabase frontend config
  SUPABASE_URL: SUPABASE_URL_VALUE,
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY_VALUE,
  SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY_VALUE,

  // App config
  APP_ENV: APP_ENV_VALUE,
  APP_URL: APP_URL_VALUE,
  API_URL: API_URL_VALUE,

  // Observability
  SENTRY_DSN: optional(["VITE_SENTRY_DSN"]),
  POSTHOG_KEY: optional(["VITE_POSTHOG_KEY"]),
  POSTHOG_HOST: POSTHOG_HOST_VALUE || "https://app.posthog.com",

  // Google Ads / GA4 (public conversion IDs only — never API tokens)
  GOOGLE_ADS_ID: optional(["VITE_GOOGLE_ADS_ID"]),
  GOOGLE_ADS_SIGNUP_LABEL: optional(["VITE_GOOGLE_ADS_SIGNUP_LABEL"]),
  GOOGLE_ADS_PURCHASE_LABEL: optional(["VITE_GOOGLE_ADS_PURCHASE_LABEL"]),
  GOOGLE_ADS_PUBLISHER_ID: optional(["VITE_GOOGLE_ADS_PUBLISHER_ID"]),
  GA_MEASUREMENT_ID: optional(["VITE_GA_MEASUREMENT_ID"]),

  // Stripe public config
  STRIPE_PUBLIC_KEY: optional(["VITE_STRIPE_PUBLIC_KEY"]),

  // Stripe subscription price IDs
  STRIPE_PRICE_STARTER_MONTHLY: optional(["VITE_STRIPE_PRICE_STARTER_MONTHLY"]),
  STRIPE_PRICE_STARTER_YEARLY: optional(["VITE_STRIPE_PRICE_STARTER_YEARLY"]),
  STRIPE_PRICE_PRO_MONTHLY: optional(["VITE_STRIPE_PRICE_PRO_MONTHLY"]),
  STRIPE_PRICE_PRO_YEARLY: optional(["VITE_STRIPE_PRICE_PRO_YEARLY"]),
  STRIPE_PRICE_ELITE_MONTHLY: optional(["VITE_STRIPE_PRICE_ELITE_MONTHLY"]),
  STRIPE_PRICE_ELITE_YEARLY: optional(["VITE_STRIPE_PRICE_ELITE_YEARLY"]),
  STRIPE_PRICE_ENTERPRISE_MONTHLY: optional([
    "VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY",
  ]),
  STRIPE_PRICE_ENTERPRISE_YEARLY: optional([
    "VITE_STRIPE_PRICE_ENTERPRISE_YEARLY",
  ]),

  // Stripe credit-pack price IDs
  STRIPE_PRICE_CREDITS_50: optional(["VITE_STRIPE_PRICE_CREDITS_50"]),
  STRIPE_PRICE_CREDITS_150: optional(["VITE_STRIPE_PRICE_CREDITS_150"]),
  STRIPE_PRICE_CREDITS_500: optional(["VITE_STRIPE_PRICE_CREDITS_500"]),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Backward-compatible named exports
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = ENV.SUPABASE_URL;
export const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
export const SUPABASE_PUBLISHABLE_KEY = ENV.SUPABASE_PUBLISHABLE_KEY;

// Supabase Edge Function base URL.
export const EDGE_BASE = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;

export const IS_PRODUCTION = ENV.APP_ENV === "production";
export const IS_STAGING = ENV.APP_ENV === "staging";
export const IS_DEVELOPMENT = ENV.APP_ENV === "development";
export const IS_TEST = ENV.APP_ENV === "test";

const EXAMPLE_STRIPE_PRICE_RE =
  /^price_(starter|pro|elite|enterprise|credits)(_\d+)?_(monthly|yearly)$/i;
const EXAMPLE_CREDITS_PRICE_RE = /^price_credits_\d+$/i;

/** True when a VITE_STRIPE_PRICE_* value is a real Stripe price id, not .env.example. */
export function isUsableStripePriceId(value?: string | null): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (/changeme|your_|placeholder|xxx|_here/i.test(v)) return false;
  if (EXAMPLE_STRIPE_PRICE_RE.test(v) || EXAMPLE_CREDITS_PRICE_RE.test(v)) return false;
  return /^price_[A-Za-z0-9]+$/.test(v);
}

/** Checkout is Razorpay (INR) only. Stripe Checkout is not used. */
export function isStripeConfigured(): boolean {
  return false;
}

export function isPostHogConfigured(): boolean {
  return Boolean(ENV.POSTHOG_KEY);
}

export function isSentryConfigured(): boolean {
  return Boolean(ENV.SENTRY_DSN);
}
