#!/usr/bin/env node
/**
 * Print SYSTEM_USER_ID for Render / scraper env from profiles.email.
 *
 * Usage:
 *   node scripts/resolve-system-user-id.mjs qa.admin@clarify.ai.test
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const email = (process.argv[2] || "qa.admin@clarify.ai.test").trim().toLowerCase();
const root = process.cwd();

function loadEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.qa.local") };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from("profiles")
  .select("id, email, full_name")
  .eq("email", email)
  .maybeSingle();

if (error) {
  console.error(error.message);
  process.exit(1);
}
if (!data?.id) {
  console.error(`No profile for ${email}. Run: npm run qa:seed-accounts`);
  process.exit(1);
}

console.log(`SYSTEM_USER_EMAIL=${email}`);
console.log(`SYSTEM_USER_ID=${data.id}`);
console.log(`# ${data.full_name || email}`);
