#!/usr/bin/env node
/**
 * CI gate: security-sensitive Edge Function patterns.
 * - No sync in-memory rate limit enforcement in function handlers
 * - Migration revokes authenticated deduct_credits
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fnRoot = path.join(root, "supabase", "functions");

const SYNC_RL_PATTERNS = [
  /\benforceRateLimit\s*\(/,
  /\benforceSessionRateLimit\s*\(/,
  /\benforceDataExportRateLimit\s*\(/,
  /\benforceAccountDeletionRateLimit\s*\(/,
  /\benforceAiRateLimit\s*\(/,
  /\benforcePaymentRateLimit\s*\(/,
  /\bcheckRateLimit\s*\(/,
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory() && name !== "_shared" && name !== "node_modules") walk(p, out);
    else if (name === "index.ts") out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk(fnRoot)) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  for (const re of SYNC_RL_PATTERNS) {
    if (re.test(text)) {
      console.error(`FAIL: sync rate limit pattern ${re} in ${rel}`);
      failed = true;
    }
  }
}

const revokeMigration = path.join(
  root,
  "supabase/migrations/20260727010000_revoke_deduct_credits_authenticated.sql",
);
if (!fs.existsSync(revokeMigration)) {
  console.error("FAIL: deduct_credits revoke migration missing");
  failed = true;
} else {
  const sql = fs.readFileSync(revokeMigration, "utf8");
  if (!/REVOKE EXECUTE ON FUNCTION public\.deduct_credits/.test(sql)) {
    console.error("FAIL: migration does not revoke deduct_credits");
    failed = true;
  }
  if (!/TO service_role/.test(sql)) {
    console.error("FAIL: migration does not grant service_role only");
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: release security gates passed");
