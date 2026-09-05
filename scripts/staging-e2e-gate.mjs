#!/usr/bin/env node
/**
 * Staging E2E gate — documents and optionally runs smoke checks before release.
 * Does not replace Playwright; verifies scripts exist and env is configured.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(msg) {
  console.log(`OK  ${msg}`);
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed += 1;
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const smokeScripts = [
  "scripts/run-live-qa-audit.mjs",
  "scripts/_probe_practice_coach_e2e.mjs",
  "scripts/verify-gov-exam-ops-gate.mjs",
  "scripts/verify-dist-env.mjs",
];

for (const rel of smokeScripts) {
  if (exists(rel)) ok(`Smoke script: ${rel}`);
  else fail(`Missing smoke script: ${rel}`);
}

if (exists("e2e")) ok("Playwright e2e/ directory present");
else fail("Missing e2e/ directory");

const stagingUrl = process.env.QA_BASE_URL || process.env.VITE_APP_URL || "";
if (stagingUrl && !/localhost|127\.0\.0\.1/.test(stagingUrl)) {
  ok(`Staging base URL configured: ${stagingUrl}`);
} else {
  console.warn("WARN Set QA_BASE_URL to staging host before browser E2E (auth, live, mock, gov, calendar, download).");
}

console.log("");
console.log("Recommended staging gate:");
console.log("  1. npm run verify:gov-ops-gate");
console.log("  2. npm run build:check");
console.log("  3. QA_BASE_URL=https://staging.example npm run test:e2e");
console.log("  4. QA_BASE_URL=... node scripts/run-live-qa-audit.mjs");
console.log("");

if (failed > 0) {
  console.error(`Staging E2E gate: ${failed} check(s) failed.`);
  process.exit(1);
}

console.log("Staging E2E gate: local prerequisites present.");
