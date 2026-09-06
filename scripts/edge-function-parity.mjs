#!/usr/bin/env node
/**
 * CI gate: every deployed Edge Function slug must have local source.
 * When SUPABASE_ACCESS_TOKEN is absent, validates the committed allowlist
 * against local supabase/functions/* directories.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fnRoot = path.join(root, "supabase", "functions");
const allowlistPath = path.join(fnRoot, "REMOTE_FUNCTION_ALLOWLIST.txt");

const local = fs
  .readdirSync(fnRoot)
  .filter((name) => {
    if (name.startsWith("_")) return false;
    const full = path.join(fnRoot, name);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "index.ts"));
  })
  .sort();

if (!fs.existsSync(allowlistPath)) {
  console.error("FAIL: missing supabase/functions/REMOTE_FUNCTION_ALLOWLIST.txt");
  process.exit(1);
}

const allowlist = fs
  .readFileSync(allowlistPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .sort();

let failed = false;
const localSet = new Set(local);
const allowSet = new Set(allowlist);

for (const slug of allowlist) {
  if (!localSet.has(slug)) {
    console.error(`FAIL: allowlisted function has no local source: ${slug}`);
    failed = true;
  }
}

for (const slug of local) {
  if (!allowSet.has(slug)) {
    console.error(`FAIL: local function missing from allowlist: ${slug}`);
    failed = true;
  }
}

const retired = [
  "ai-feedback",
  "generate-practice-questions",
  "validate-api-key",
  "save-answer",
  "save-transcript",
  "billing-status",
  "create-checkout",
  "create-billing-portal",
  "cancel-subscription",
  "resume-subscription",
];
for (const slug of retired) {
  const src = fs.readFileSync(path.join(fnRoot, slug, "index.ts"), "utf8");
  if (!src.includes("FUNCTION_RETIRED") && !src.includes("retiredResponse")) {
    console.error(`FAIL: ${slug} is not a retired 410 stub`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`OK: edge function parity — ${local.length} local slugs match allowlist`);
