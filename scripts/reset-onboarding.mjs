#!/usr/bin/env node
/**
 * Deterministically reset a user's onboarding state for QA / support.
 *
 * Usage:
 *   node scripts/reset-onboarding.mjs --email qa.onboarding@clarify.ai.test
 *   node scripts/reset-onboarding.mjs --user-id <uuid>
 *
 * Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local (or env).
 * Does not print secrets. Clears onboarding_completed and onboarding_step only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function parseArgs(argv) {
  const opts = { email: null, userId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) opts.email = argv[++i].trim();
    else if (a === "--user-id" && argv[i + 1]) opts.userId = argv[++i].trim();
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help || (!opts.email && !opts.userId)) {
  console.log(`Usage:
  node scripts/reset-onboarding.mjs --email <email>
  node scripts/reset-onboarding.mjs --user-id <uuid>`);
  process.exit(opts.help ? 0 : 1);
}

const fileEnv = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
};
const url =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (expected in .env.local)",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = opts.userId;
if (!userId && opts.email) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, email, onboarding_completed, onboarding_step")
    .eq("email", opts.email)
    .maybeSingle();
  if (error) {
    console.error("Profile lookup failed:", error.message);
    process.exit(1);
  }
  if (!profile?.id) {
    console.error(`No profile found for email: ${opts.email}`);
    process.exit(1);
  }
  userId = profile.id;
  console.log(
    `Found ${profile.email} id=${profile.id} onboarded=${profile.onboarding_completed} step=${profile.onboarding_step}`,
  );
}

const now = new Date().toISOString();
const { data: updated, error: updateErr } = await admin
  .from("profiles")
  .update({
    onboarding_completed: false,
    onboarding_step: 1,
    updated_at: now,
  })
  .eq("id", userId)
  .select("id, email, onboarding_completed, onboarding_step")
  .maybeSingle();

if (updateErr) {
  console.error("Reset failed:", updateErr.message);
  process.exit(1);
}
if (!updated) {
  console.error(`No profile updated for id=${userId}`);
  process.exit(1);
}

console.log(
  `Reset OK: ${updated.email ?? userId} onboarding_completed=${updated.onboarding_completed} onboarding_step=${updated.onboarding_step}`,
);
console.log("User must sign in again (or refresh) to land on /onboarding.");
