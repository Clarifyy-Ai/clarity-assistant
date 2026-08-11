#!/usr/bin/env node
/**
 * CI gate: fail if likely live secrets appear in tracked source.
 *
 * Patterns:
 * - sbp_          Supabase personal access tokens
 * - sk_live       Stripe live secret keys
 * - whsec_        Stripe / webhook signing secrets
 * - BEGIN PRIVATE KEY
 *
 * Usage: node scripts/scan-secrets.mjs
 * Exit 1 on any match outside allowlisted paths/comments.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "electron-release",
  "release",
  ".next",
  "supabase/.temp",
]);

const SKIP_FILE_GLOBS = [
  /\.map$/i,
  /\.lock$/i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /yarn\.lock$/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.gif$/i,
  /\.webp$/i,
  /\.ico$/i,
  /\.woff2?$/i,
  /\.pdf$/i,
  /\.mp4$/i,
  /\.zip$/i,
];

/** Docs/examples that intentionally mention secret prefixes. */
const ALLOWLIST_REL = new Set([
  "scripts/scan-secrets.mjs",
  "scripts/sync-edge-secrets-from-env.mjs",
  "scripts/gov-bank-readiness.mjs",
  "scripts/gov-bank-verify-stats.mjs",
  "scripts/gov-exam-ops-snapshot.mjs",
  "scripts/apply-sql-migration.mjs",
  "scripts/billing-config-preflight.mjs",
  "scripts/post-deploy-full-suite.mjs",
  "scripts/validate-env.js",
]);

const PATTERNS = [
  { name: "sbp_", re: /\bsbp_[A-Za-z0-9]{20,}\b/ },
  { name: "sk_live", re: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: "whsec_", re: /\bwhsec_[A-Za-z0-9+/=_-]{16,}\b/ },
  { name: "BEGIN PRIVATE KEY", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name) || name === ".temp";
}

function shouldSkipFile(rel) {
  if (ALLOWLIST_REL.has(rel.replace(/\\/g, "/"))) return true;
  return SKIP_FILE_GLOBS.some((re) => re.test(rel));
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".env.example" && ent.isFile()) {
      // Still scan .env.example; skip other dotfiles like .DS_Store
      if (!ent.name.startsWith(".env")) continue;
    }
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name) || rel === "supabase/.temp") continue;
      // Skip nested temp/cache dirs by relative path segment
      if (rel.split("/").some((p) => SKIP_DIR_NAMES.has(p))) continue;
      walk(full, out);
    } else if (ent.isFile()) {
      if (shouldSkipFile(rel)) continue;
      out.push(full);
    }
  }
  return out;
}

function looksLikePlaceholder(line) {
  return /your[-_]|example|changeme|replace|xxx|\.\.\.|REDACTED|placeholder/i.test(line);
}

let failed = false;
const files = walk(root);

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // Skip binary-ish
  if (text.includes("\u0000")) continue;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (looksLikePlaceholder(line)) continue;
    for (const { name, re } of PATTERNS) {
      if (!re.test(line)) continue;
      console.error(`FAIL: possible secret (${name}) in ${rel}:${i + 1}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("scan-secrets: failed — remove or redact matching values before merge.");
  process.exit(1);
}

console.log(`OK: scan-secrets passed (${files.length} files scanned)`);
