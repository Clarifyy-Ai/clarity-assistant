#!/usr/bin/env node

/**
 * scripts/validate-env.js
 *
 * Production-grade environment validation for Clarify AI.
 *
 * Usage:
 *   npm run validate-env
 *   npm run electron:check-config
 *   node scripts/validate-env.js --electron
 *
 * What this checks:
 * - Required Vite frontend variables exist
 * - Placeholder/demo values are not used
 * - Supabase URL format is valid
 * - App environment is one of: development | staging | production
 * - Production does not use unsafe localhost/example values
 * - Server-only secrets are not accidentally prefixed with VITE_
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();

const ENV_FILES = [".env.local", ".env", ".env.development", ".env.production"];

const REQUIRED_CLIENT_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

const OPTIONAL_CLIENT_VARS = [
  "VITE_APP_NAME",
  "VITE_APP_URL",
  "VITE_APP_ENV",
  "VITE_API_URL",
  "VITE_STRIPE_PUBLIC_KEY",
  "VITE_POSTHOG_KEY",
  "VITE_POSTHOG_HOST",
  "VITE_SENTRY_DSN",
  "VITE_STRIPE_PRICE_STARTER_MONTHLY",
  "VITE_STRIPE_PRICE_STARTER_YEARLY",
  "VITE_STRIPE_PRICE_PRO_MONTHLY",
  "VITE_STRIPE_PRICE_PRO_YEARLY",
  "VITE_STRIPE_PRICE_ELITE_MONTHLY",
  "VITE_STRIPE_PRICE_ELITE_YEARLY",
  "VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY",
  "VITE_STRIPE_PRICE_ENTERPRISE_YEARLY",
  "VITE_STRIPE_PRICE_CREDITS_50",
  "VITE_STRIPE_PRICE_CREDITS_150",
  "VITE_STRIPE_PRICE_CREDITS_500",
];

const SERVER_ONLY_SECRET_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "DEEPGRAM_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SENTRY_AUTH_TOKEN",
];

const ALLOWED_APP_ENVS = new Set(["development", "staging", "production"]);

const PLACEHOLDER_PATTERNS = [
  /your[-_ ]?/i,
  /example/i,
  /placeholder/i,
  /changeme/i,
  /replace[-_ ]?me/i,
  /todo/i,
  /xxx/i,
  /project-id/i,
  /your-project-id/i,
  /yourdomain\.com/i,
  /^sk-\.\.\.$/i,
  /^sk_test_\.\.\.$/i,
  /^pk_test_\.\.\.$/i,
  /^whsec_\.\.\.$/i,
  /^re_\.\.\.$/i,
  /^AIza\.\.\.$/i,
];

const ELECTRON_SUMMARY_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_APP_URL",
];

const errors = [];
const warnings = [];

function isElectronMode() {
  return process.env.BUILD_TARGET === "electron" || process.argv.includes("--electron");
}

function stripQuotes(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseEnvFile(filePath) {
  const result = {};

  if (!fs.existsSync(filePath)) {
    return result;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    // Remove inline comments only when preceded by whitespace.
    value = value.replace(/\s+#.*$/, "").trim();

    result[key] = stripQuotes(value);
  }

  return result;
}

function loadEnvFromFiles() {
  const merged = {};
  const loadedFiles = [];

  for (const file of ENV_FILES) {
    const filePath = path.join(ROOT_DIR, file);

    if (fs.existsSync(filePath)) {
      Object.assign(merged, parseEnvFile(filePath));
      loadedFiles.push(file);
    }
  }

  // Real process.env wins over file values. Useful for CI/CD.
  Object.assign(merged, process.env);

  return { env: merged, loadedFiles };
}

function isMissing(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

/**
 * CI sandbox values (ci-placeholder*) are allowed only in development.
 * Covers keys that start with "ci-placeholder" and the CI Supabase URL host.
 */
function isAllowedCiPlaceholder(value, appEnv) {
  if (appEnv !== "development" || typeof value !== "string") {
    return false;
  }

  if (value.startsWith("ci-placeholder")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.hostname.startsWith("ci-placeholder.");
  } catch {
    return false;
  }
}

function isPlaceholder(value, appEnv = "development") {
  if (isMissing(value)) {
    return false;
  }

  if (isAllowedCiPlaceholder(value, appEnv)) {
    return false;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidSupabaseUrl(value) {
  if (!isValidUrl(value)) {
    return false;
  }

  const url = new URL(value);

  return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
}

function checkRequiredVars(env) {
  const appEnv = env.VITE_APP_ENV || "development";

  for (const key of REQUIRED_CLIENT_VARS) {
    const value = env[key];

    if (isMissing(value)) {
      errors.push(`Missing required environment variable: ${key}`);
      continue;
    }

    if (isPlaceholder(value, appEnv)) {
      errors.push(`Environment variable ${key} still contains a placeholder value.`);
    }
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function checkSupabaseJwtKey(keyName, value) {
  if (isMissing(value) || !value.startsWith("eyJ")) {
    return;
  }

  const payload = decodeJwtPayload(value);
  if (!payload) {
    warnings.push(`${keyName} is not a valid JWT. Copy the anon key from Supabase Dashboard → API.`);
    return;
  }

  if (payload.iss !== "supabase") {
    errors.push(
      `${keyName} is corrupted (JWT iss="${payload.iss}" — expected "supabase"). ` +
        "Re-copy the anon key from Supabase Dashboard → Project Settings → API.",
    );
  }
}

function checkSupabaseConfig(env) {
  const supabaseUrl = env.VITE_SUPABASE_URL;

  if (!isMissing(supabaseUrl) && !isValidSupabaseUrl(supabaseUrl)) {
    errors.push(
      "VITE_SUPABASE_URL must be a valid HTTPS Supabase URL ending with .supabase.co"
    );
  }

  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!isMissing(anonKey) && anonKey.length < 40) {
    warnings.push("VITE_SUPABASE_ANON_KEY looks unusually short. Verify it is correct.");
  }

  if (!isMissing(publishableKey) && publishableKey.length < 40) {
    warnings.push("VITE_SUPABASE_PUBLISHABLE_KEY looks unusually short. Verify it is correct.");
  }

  checkSupabaseJwtKey("VITE_SUPABASE_ANON_KEY", anonKey);
  checkSupabaseJwtKey("VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey);
}

function checkAppConfig(env) {
  const appEnv = env.VITE_APP_ENV || "development";

  if (!ALLOWED_APP_ENVS.has(appEnv)) {
    errors.push(
      `VITE_APP_ENV must be one of: ${Array.from(ALLOWED_APP_ENVS).join(", ")}`
    );
  }

  if (env.VITE_APP_URL && !isValidUrl(env.VITE_APP_URL)) {
    errors.push("VITE_APP_URL must be a valid URL.");
  }

  if (
    env.VITE_API_URL &&
    env.VITE_API_URL !== "/api" &&
    !isValidUrl(env.VITE_API_URL)
  ) {
    errors.push("VITE_API_URL must be either /api or a valid URL.");
  }

  if (appEnv === "production") {
    if (
      env.VITE_APP_URL?.includes("localhost") ||
      env.VITE_APP_URL?.includes("127.0.0.1")
    ) {
      errors.push("VITE_APP_URL must not use localhost/127.0.0.1 in production.");
    }

    if (env.VITE_ENABLE_DEBUG_PANEL === "true") {
      errors.push("VITE_ENABLE_DEBUG_PANEL must not be true in production.");
    }

    const hasDesktopUrl =
      env.VITE_DESKTOP_DOWNLOAD_URL_WIN ||
      env.VITE_DESKTOP_DOWNLOAD_URL ||
      env.VITE_GITHUB_RELEASE_REPO;
    if (!hasDesktopUrl) {
      warnings.push(
        "No desktop installer URL configured. Set VITE_DESKTOP_DOWNLOAD_URL_WIN or publish to GitHub Releases.",
      );
    }
  }
}

function checkOptionalUrls(env) {
  const urlVars = ["VITE_POSTHOG_HOST", "VITE_SENTRY_DSN"];

  for (const key of urlVars) {
    const value = env[key];

    if (!isMissing(value) && !isValidUrl(value)) {
      warnings.push(`${key} is set but does not look like a valid URL.`);
    }
  }
}

function isElectronProduction(env) {
  const appEnv = env.VITE_APP_ENV;

  // Local Electron dev/staging may use http/localhost. Packaging (`vite build` / dist:*)
  // typically ships production — treat unset env as production in Electron mode.
  if (appEnv === "development" || appEnv === "staging") {
    return false;
  }

  return appEnv === "production" || isElectronMode();
}

function checkElectronConfig(env) {
  if (!isElectronMode()) {
    return;
  }

  const appEnv = env.VITE_APP_ENV || "development";
  const appUrl = env.VITE_APP_URL;

  if (isMissing(appUrl)) {
    errors.push(
      "Missing required environment variable: VITE_APP_URL (used for \"Open in browser\" from desktop)."
    );
  } else if (isPlaceholder(appUrl, appEnv)) {
    errors.push("Environment variable VITE_APP_URL still contains a placeholder value.");
  } else if (isElectronProduction(env)) {
    let protocol = "";
    try {
      protocol = new URL(appUrl).protocol;
    } catch {
      protocol = "";
    }

    const isLocalhost =
      appUrl.includes("localhost") || appUrl.includes("127.0.0.1");

    if (protocol !== "https:" || isLocalhost) {
      errors.push(
        "VITE_APP_URL must be https (not localhost) for Electron production packaging."
      );
    }
  }

  if (isMissing(env.VITE_SUPABASE_PROJECT_ID)) {
    warnings.push(
      "VITE_SUPABASE_PROJECT_ID is missing. Set it for Electron desktop builds when available."
    );
  }

  const oauthProviders = typeof env.VITE_OAUTH_PROVIDERS === "string"
    ? env.VITE_OAUTH_PROVIDERS.trim().toLowerCase()
    : "";

  if (!oauthProviders || oauthProviders === "none") {
    warnings.push(
      "VITE_OAUTH_PROVIDERS is unset or none. Desktop login is email-only unless Google is enabled."
    );
  }
}

function printElectronConfigSummary(env) {
  console.log("\nElectron config:");

  for (const key of ELECTRON_SUMMARY_KEYS) {
    const status = isMissing(env[key]) ? "missing" : "present";
    console.log(`  ${key}: ${status}`);
  }
}

function checkServerSecretExposure(env) {
  for (const secretName of SERVER_ONLY_SECRET_NAMES) {
    const badClientName = `VITE_${secretName}`;

    if (!isMissing(env[badClientName])) {
      errors.push(
        `${badClientName} is unsafe. Server-only secrets must not use the VITE_ prefix.`
      );
    }
  }
}

function checkKnownLegacyNames(env) {
  if (
    !isMissing(env.VITE_STRIPE_PUBLISHABLE_KEY) &&
    isMissing(env.VITE_STRIPE_PUBLIC_KEY)
  ) {
    warnings.push(
      "VITE_STRIPE_PUBLISHABLE_KEY is set, but this app expects VITE_STRIPE_PUBLIC_KEY. Rename it."
    );
  }
}

function printResult(loadedFiles, env) {
  console.log("\n🔎 Environment validation started...");

  if (isElectronMode()) {
    console.log("🖥️  Mode: Electron");
  }

  if (loadedFiles.length > 0) {
    console.log(`📄 Loaded env files: ${loadedFiles.join(", ")}`);
  } else {
    console.log("📄 No local env files found. Using process.env only.");
  }

  if (isElectronMode() && env) {
    printElectronConfigSummary(env);
  }

  if (warnings.length > 0) {
    console.log("\n⚠️ Warnings:");

    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ Environment validation failed:");

    for (const error of errors) {
      console.error(`  - ${error}`);
    }

    console.error("\nFix the issues above, then run: npm run validate-env\n");
    process.exit(1);
  }

  console.log("\n✅ Environment validation passed.\n");
}

function main() {
  const { env, loadedFiles } = loadEnvFromFiles();
  const electron = isElectronMode();

  checkRequiredVars(env);
  checkSupabaseConfig(env);
  checkAppConfig(env);
  checkOptionalUrls(env);
  checkServerSecretExposure(env);
  checkKnownLegacyNames(env);
  checkElectronConfig(env);

  // Friendly visibility for optional vars without failing builds.
  const appEnv = env.VITE_APP_ENV || "development";
  for (const key of OPTIONAL_CLIENT_VARS) {
    if (electron && key === "VITE_APP_URL") {
      continue;
    }

    if (isPlaceholder(env[key], appEnv)) {
      warnings.push(`${key} appears to contain a placeholder value.`);
    }
  }

  printResult(loadedFiles, env);
}

main();
