#!/usr/bin/env node
/**
 * Sync workbook/ops Edge Function secrets from local .env.local → Supabase project.
 *
 * Requires SUPABASE_ACCESS_TOKEN (PAT) in env, or pass --token.
 * Never prints secret values.
 *
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node scripts/sync-edge-secrets-from-env.mjs
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";

/** Local env key → Edge secret name (1:1 or remapped). */
const SECRET_MAP = [
  ["STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"],
  ["STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"],
  ["RESEND_API_KEY", "RESEND_API_KEY"],
  ["RESEND_FROM_EMAIL", "RESEND_FROM_EMAIL"],
  ["FROM_EMAIL", "FROM_EMAIL"],
  ["OPENAI_API_KEY", "OPENAI_API_KEY"],
  ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  ["GEMINI_API_KEY", "GEMINI_API_KEY"],
  ["AI_PROVIDER_MODE", "AI_PROVIDER_MODE"],
  ["AI_DAILY_BUDGET_USD", "AI_DAILY_BUDGET_USD"],
  ["AI_MONTHLY_BUDGET_USD", "AI_MONTHLY_BUDGET_USD"],
  ["AI_MAX_REQUEST_COST_USD", "AI_MAX_REQUEST_COST_USD"],
  ["AI_MAX_OUTPUT_TOKENS", "AI_MAX_OUTPUT_TOKENS"],
  ["AI_RATE_LIMIT_PER_MINUTE", "AI_RATE_LIMIT_PER_MINUTE"],
  ["AI_RATE_LIMIT_PER_HOUR", "AI_RATE_LIMIT_PER_HOUR"],
  ["AI_CACHE_ENABLED", "AI_CACHE_ENABLED"],
  ["AI_CACHE_TTL_SECONDS", "AI_CACHE_TTL_SECONDS"],
  ["AI_FREE_TIER_ENABLED", "AI_FREE_TIER_ENABLED"],
  ["AI_FREE_TIER_DAILY_TOKENS", "AI_FREE_TIER_DAILY_TOKENS"],
  ["AI_ROUTING_ENABLED", "AI_ROUTING_ENABLED"],
  ["AI_ACCELERATION_DEFAULT_TIER", "AI_ACCELERATION_DEFAULT_TIER"],
  ["DEEPGRAM_API_KEY", "DEEPGRAM_API_KEY"],
  ["DEEPGRAM_PROJECT_ID", "DEEPGRAM_PROJECT_ID"],
  ["OCR_API_KEY", "OCR_API_KEY"],
  ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_ID"],
  ["RAZORPAY_KEY_SECRET", "RAZORPAY_KEY_SECRET"],
  ["RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID"],
  ["GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"],
  ["INGEST_API_KEY", "INGEST_API_KEY"],
  ["PUBLIC_URL", "PUBLIC_URL"],
  ["SITE_URL", "SITE_URL"],
  ["ALLOWED_ORIGINS", "ALLOWED_ORIGINS"],
  ["APP_ENV", "APP_ENV"],
  ["ENVIRONMENT", "ENVIRONMENT"],
  // Vite Stripe price IDs → Edge STRIPE_PRICE_* names
  ["VITE_STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_MONTHLY"],
  ["VITE_STRIPE_PRICE_STARTER_YEARLY", "STRIPE_PRICE_STARTER_YEARLY"],
  ["VITE_STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_MONTHLY"],
  ["VITE_STRIPE_PRICE_PRO_YEARLY", "STRIPE_PRICE_PRO_YEARLY"],
  ["VITE_STRIPE_PRICE_ELITE_MONTHLY", "STRIPE_PRICE_ELITE_MONTHLY"],
  ["VITE_STRIPE_PRICE_ELITE_YEARLY", "STRIPE_PRICE_ELITE_YEARLY"],
  ["VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY", "STRIPE_PRICE_ENTERPRISE_MONTHLY"],
  ["VITE_STRIPE_PRICE_ENTERPRISE_YEARLY", "STRIPE_PRICE_ENTERPRISE_YEARLY"],
  ["VITE_STRIPE_PRICE_CREDITS_50", "STRIPE_PRICE_CREDITS_50"],
  ["VITE_STRIPE_PRICE_CREDITS_150", "STRIPE_PRICE_CREDITS_150"],
  ["VITE_STRIPE_PRICE_CREDITS_500", "STRIPE_PRICE_CREDITS_500"],
  ["STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_MONTHLY"],
  ["STRIPE_PRICE_STARTER_YEARLY", "STRIPE_PRICE_STARTER_YEARLY"],
  ["STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_MONTHLY"],
  ["STRIPE_PRICE_PRO_YEARLY", "STRIPE_PRICE_PRO_YEARLY"],
  ["STRIPE_PRICE_ELITE_MONTHLY", "STRIPE_PRICE_ELITE_MONTHLY"],
  ["STRIPE_PRICE_ELITE_YEARLY", "STRIPE_PRICE_ELITE_YEARLY"],
  ["STRIPE_PRICE_ENTERPRISE_MONTHLY", "STRIPE_PRICE_ENTERPRISE_MONTHLY"],
  ["STRIPE_PRICE_ENTERPRISE_YEARLY", "STRIPE_PRICE_ENTERPRISE_YEARLY"],
  ["STRIPE_PRICE_CREDITS_50", "STRIPE_PRICE_CREDITS_50"],
  ["STRIPE_PRICE_CREDITS_150", "STRIPE_PRICE_CREDITS_150"],
  ["STRIPE_PRICE_CREDITS_500", "STRIPE_PRICE_CREDITS_500"],
];

const PLACEHOLDER_RE =
  /^(your[-_]|sk_test_your|pk_test_your|whsec_your|re_your|sk-ant-your|sk_your|price_starter|price_pro_mont|price_elite|REPLACE|changeme|xxx)/i;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function isUsable(value) {
  if (!value || !String(value).trim()) return false;
  const v = String(value).trim();
  if (PLACEHOLDER_RE.test(v)) return false;
  if (v.includes("_here") || v.includes("REPLACE")) return false;
  return true;
}

function requestJson(method, apiPath, token, body) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(root, ".env.local")),
    ...process.env,
  };

  const tokenArg = process.argv.find((a) => a.startsWith("--token="));
  const token =
    (tokenArg && tokenArg.slice("--token=".length)) ||
    env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("Set SUPABASE_ACCESS_TOKEN (or --token=sbp_...)");
    process.exit(1);
  }

  // Defaults for closed-beta prod host when not set locally
  if (!isUsable(env.PUBLIC_URL)) {
    env.PUBLIC_URL = "https://clarify.ai.sltfinanceindia.com";
  }
  if (!isUsable(env.SITE_URL)) {
    env.SITE_URL = env.PUBLIC_URL;
  }
  if (!isUsable(env.ALLOWED_ORIGINS)) {
    env.ALLOWED_ORIGINS = [
      "https://clarify.ai.sltfinanceindia.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ].join(",");
  }
  if (!isUsable(env.APP_ENV)) {
    env.APP_ENV = "production";
  }
  // Mirror APP_ENV → ENVIRONMENT when ENVIRONMENT is unset (CORS / billing detect both).
  if (!isUsable(env.ENVIRONMENT) && isUsable(env.APP_ENV)) {
    env.ENVIRONMENT = env.APP_ENV;
  }

  const secrets = new Map();
  for (const [localKey, secretName] of SECRET_MAP) {
    const value = env[localKey];
    if (!isUsable(value)) continue;
    // Prefer already-set Edge-named keys over Vite remaps if both exist later
    if (!secrets.has(secretName)) secrets.set(secretName, value);
  }

  const payload = [...secrets.entries()].map(([name, value]) => ({ name, value }));
  if (payload.length === 0) {
    console.error("No usable secrets found in .env.local");
    process.exit(1);
  }

  console.log(`Syncing ${payload.length} secrets → project ${PROJECT_REF}`);
  for (const { name } of payload) console.log(`  + ${name}`);

  const res = await requestJson(
    "POST",
    `/v1/projects/${PROJECT_REF}/secrets`,
    token,
    payload,
  );

  if (res.status < 200 || res.status >= 300) {
    console.error(`Secret sync failed (${res.status}): ${res.data.slice(0, 500)}`);
    process.exit(1);
  }

  console.log(`OK secrets synced (${res.status})`);

  // Report workbook checklist gaps (names only)
  const present = new Set(payload.map((p) => p.name));
  const checklist = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "GEMINI_API_KEY",
    "DEEPGRAM_API_KEY",
    "PUBLIC_URL",
  ];
  console.log("Workbook secrets checklist:");
  for (const name of checklist) {
    console.log(`  ${present.has(name) ? "SET" : "MISSING"}  ${name}`);
  }
}

main().catch((err) => {
  console.error("sync-edge-secrets failed:", err?.message || err);
  process.exit(1);
});
