// src/lib/env.ts
//
// Secure frontend environment resolver.
//
// SECURITY PURPOSE:
// - Centralize allLY"]),// - Centralize all Vite environment access
  STRIPE_PRICE_ENTERPRISE_MONTHLY: optional([
    "VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY",
  ]),
  STRIPE_PRICE_ENTERPRISE_YEARLY: optional([
    "VITE_STRIPE_PRICE_ENTERPRISE_YEARLY",
  ]),

  // Stripe credit-pack price IDs
  STRIPE_PRICE_CREDITS_10: optional(["VITE_STRIPE_PRICE_CREDITS_10"]),
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

export function isStripeConfigured(): boolean {
  return Boolean(
    ENV.STRIPE_PUBLIC_KEY &&
      (ENV.STRIPE_PRICE_STARTER_MONTHLY ||
        ENV.STRIPE_PRICE_PRO_MONTHLY ||
        ENV.STRIPE_PRICE_ELITE_MONTHLY ||
        ENV.STRIPE_PRICE_CREDITS_50 ||
        ENV.STRIPE_PRICE_CREDITS_150 ||
        ENV.STRIPE_PRICE_CREDITS_500)
  );
}

export function isPostHogConfigured(): boolean {
  return Boolean(ENV.POSTHOG_KEY);
}

export function isSentryConfigured(): boolean {
  return Boolean(ENV.SENTRY_DSN);
}
// - Fail fast when required public frontend env vars are missing
// - Never expose server-only secrets in frontend code
// - Keep Stripe price IDs frontend-visible but not trusted for backend billing
// - Provide backward-compatible named exports
//
// IMPORTANT:
// Only VITE_* variables are available in frontend bundles.
// Never put service-role keys, Stripe secret keys, webhook secrets,
// Gemini/OpenAI/Anthropic server keys, or any private secret here.

type RawEnv = Record<string, string | undefined>;

const rawEnv = import.meta.env as RawEnv;

export type AppEnvironment =
  | "development"
  | "staging"
  | "production"
  | "test";

function firstDefined(keys: string[]): string {
  for (const key of keys) {
    const value = rawEnv[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const message =
    `[env] Missing required environment variable: ${keys.join(", ")}. ` +
    "Copy .env.example → .env.local and set required values.";

  console.error(message);

  throw new Error(message);
}

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

function assertValidUrl(value: string, name: string): string {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol.");
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    const message = `[env] ${name} must be a valid http(s) URL.`;

    console.error(message);

    throw new Error(message);
  }
}

function normalizeOptionalUrl(value: string): string {
  if (!value) {
    return "";
  }

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
  if (!value) {
    return fallback;
  }

  if (value.startsWith("/")) {
    return value;
  }

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

const SUPABASE_URL_VALUE = assertValidUrl(
  firstDefined(["VITE_SUPABASE_URL"]),
  "VITE_SUPABASE_URL"
);

const SUPABASE_ANON_KEY_VALUE = firstDefined([
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
]);

const SUPABASE_PUBLISHABLE_KEY_VALUE = firstDefined([
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
]);

const APP_ENV_VALUE = parseAppEnvironment(
  optional(["VITE_APP_ENV"], "development")
);

const APP_URL_VALUE = normalizeOptionalUrl(optional(["VITE_APP_URL"]));

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

  // Stripe public config
  STRIPE_PUBLIC_KEY: optional(["VITE_STRIPE_PUBLIC_KEY"]),

  // Stripe subscription price IDs
  STRIPE_PRICE_STARTER_MONTHLY: optional([
    "VITE_STRIPE_PRICE_STARTER_MONTHLY",
  ]),
  STRIPE_PRICE_STARTER_YEARLY: optional([
    "VITE_STRIPE_PRICE_STARTER_YEARLY",
  ]),
  STRIPE_PRICE_PRO_MONTHLY: optional(["VITE_STRIPE_PRICE_PRO_MONTHLY"]),
  STRIPE_PRICE_PRO_YEARLY: optional(["VITE_STRIPE_PRICE_PRO_YEARLY"]),
  STRIPE_PRICE_ELITE_MONTHLY: optional(["VITE_STRIPE_PRICE_ELITE_MONTHLY"]),
