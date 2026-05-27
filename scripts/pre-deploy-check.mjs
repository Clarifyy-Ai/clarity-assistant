#!/usr/bin/env node
/**
 * Pre-deploy validation — run before db push / edge deploy.
 * Checks migrations exist and documents required secrets (does not call Supabase).
 *
 * Usage: node scripts/pre-deploy-check.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const REQUIRED_MIGRATIONS = [
  "20260527000000_revoke_increment_profile_credits.sql",
  "20260527000001_pg_trgm_extensions_schema.sql",
  "20260527120000_revoke_credit_transactions_client_insert.sql",
];

const REQUIRED_SECRETS = [
  "GEMINI_API_KEY",
  "DEEPGRAM_API_KEY",
  "SYSTEM_USER_ID",
  "ALLOWED_ORIGINS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
];

let failed = false;

console.log("\nPre-deploy check\n────────────────");

const migDir = path.join(root, "supabase", "migrations");
for (const name of REQUIRED_MIGRATIONS) {
  const exists = fs.existsSync(path.join(migDir, name));
  console.log(`  ${exists ? "OK" : "MISSING"}  migration ${name}`);
  if (!exists) failed = true;
}

const fnDir = path.join(root, "supabase", "functions");
const fnCount = fs
  .readdirSync(fnDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_")).length;
console.log(`  OK     ${fnCount} edge function directories`);

console.log("\nRequired Supabase secrets (set in dashboard → Project Settings → Edge Functions):");
for (const s of REQUIRED_SECRETS) {
  console.log(`  - ${s}`);
}

console.log("\nCommands:");
console.log("  npx supabase db push");
console.log("  node scripts/deploy-all-edge-functions.mjs");
console.log("  SUPABASE_URL=... ANON_KEY=... bash scripts/smoke-edge.sh\n");

process.exit(failed ? 1 : 0);
