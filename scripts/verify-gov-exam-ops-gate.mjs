#!/usr/bin/env node
/**
 * Local ops gate for Gov Exams — verifies artifacts exist before deploy.
 * Does not apply migrations or deploy; exits non-zero when prerequisites missing.
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

const requiredMigration = "supabase/migrations/20260905140000_gov_exam_inventory_public_pyp_fix.sql";
if (exists(requiredMigration)) {
  ok(`Migration present: ${requiredMigration}`);
} else {
  fail(`Missing migration: ${requiredMigration}`);
}

const govEdgeFunctions = [
  "create-exam-paper",
  "check-exam-paper-availability",
  "submit-test",
  "search-exams",
  "get-paper-generation-job",
  "process-paper-generation-job",
  "generate-topic-practice",
];

for (const fn of govEdgeFunctions) {
  const rel = `supabase/functions/${fn}/index.ts`;
  if (exists(rel)) {
    ok(`Edge function source: ${fn}`);
  } else {
    fail(`Missing edge function: ${rel}`);
  }
}

const pythonWorker = "scraper/app/routes/gov_exams.py";
if (exists(pythonWorker)) {
  ok(`Python gov worker route: ${pythonWorker}`);
} else {
  fail(`Missing Python worker: ${pythonWorker}`);
}

const allowlistPath = "supabase/functions/REMOTE_FUNCTION_ALLOWLIST.txt";
if (exists(allowlistPath)) {
  const allowlist = fs.readFileSync(path.join(root, allowlistPath), "utf8");
  for (const fn of ["create-exam-paper", "check-exam-paper-availability", "submit-test", "search-exams"]) {
    if (allowlist.includes(fn)) {
      ok(`Allowlisted for deploy: ${fn}`);
    } else {
      fail(`Not in REMOTE_FUNCTION_ALLOWLIST: ${fn}`);
    }
  }
} else {
  fail(`Missing ${allowlistPath}`);
}

console.log("");
if (failed > 0) {
  console.error(`Gov exam ops gate: ${failed} check(s) failed.`);
  console.error("Apply migrations via Supabase CLI, deploy allowlisted functions, verify Python worker URL.");
  process.exit(1);
}

console.log("Gov exam ops gate: all local prerequisites present.");
console.log("Next: supabase db push && deploy edge functions && verify worker /internal/gov-exams/process-job");
