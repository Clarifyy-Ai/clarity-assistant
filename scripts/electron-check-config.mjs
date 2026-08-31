#!/usr/bin/env node
/**
 * Validates the env vars required to build/package the Clarify AI Electron
 * desktop app. Fails on errors; warnings (e.g. OAuth unset) do not fail.
 *
 * Usage: npm run electron:check-config
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REQUIRED = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_APP_URL",
];
const FORBIDDEN = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPGRAM_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "RAZORPAY_KEY_SECRET",
];

function loadEnvFile(file) {
  const out = {};
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

// Electron packaging merges .env.local over .env. Process env is only used for
// REQUIRED lookups; FORBIDDEN secrets are checked in FILES only, because only
// file values get inlined into the shipped client bundle by Vite.
const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
const env = { ...fileEnv, ...process.env };

const errors = [];
const warnings = [];

for (const key of REQUIRED) {
  const v = env[key];
  if (!v || /your_|changeme|placeholder|example\.com/i.test(v)) {
    errors.push(`Missing or placeholder value: ${key}`);
  }
}

if (env.VITE_SUPABASE_URL && !/^https:\/\/.+\.supabase\.co/.test(env.VITE_SUPABASE_URL)) {
  errors.push(`VITE_SUPABASE_URL does not look like a Supabase URL: ${env.VITE_SUPABASE_URL}`);
}
if (env.VITE_SUPABASE_ANON_KEY && env.VITE_SUPABASE_PUBLISHABLE_KEY
    && env.VITE_SUPABASE_ANON_KEY !== env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  warnings.push("VITE_SUPABASE_ANON_KEY differs from VITE_SUPABASE_PUBLISHABLE_KEY (they are expected to match)");
}
if (env.VITE_APP_URL && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(env.VITE_APP_URL)) {
  errors.push("VITE_APP_URL points at localhost — desktop 'Open in browser' links would break");
}
if (!env.VITE_OAUTH_PROVIDERS) {
  warnings.push("VITE_OAUTH_PROVIDERS unset — desktop login will be email-only");
}
for (const key of FORBIDDEN) {
  if (fileEnv[key] && !/^your_|^$/.test(fileEnv[key])) {
    errors.push(`Secret key ${key} must NOT be in .env/.env.local (it would ship in the client bundle)`);
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\nelectron:check-config FAILED (${errors.length} error(s), ${warnings.length} warning(s))`);
  process.exit(1);
}
console.log(`OK: electron:check-config passed (${warnings.length} warning(s))`);
