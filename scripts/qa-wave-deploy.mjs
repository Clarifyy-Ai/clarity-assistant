#!/usr/bin/env node
/**
 * QA wave deploy manifest — edge functions + migrations required for root-cause fixes.
 * Usage: node --use-system-ca scripts/qa-wave-deploy.mjs [--deploy]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const QA_WAVE_EDGE_FUNCTIONS = [
  "analytics-dashboard",
  "submit-test",
  "start-session",
  "create-exam-paper",
  "get-paper-generation-job",
  "process-paper-generation-job",
  "cancel-paper-generation-job",
  "save-test-answer",
  "save-attempt-answer",
  "prep-tool",
  "parse-document",
  "search-exams",
];

const QA_WAVE_MIGRATIONS = [
  "20260902120000_email_verification_server_gate.sql",
  "20260902220000_answer_persistence_lifecycle.sql",
  "20260902230000_release_gov_paper_credits_fail_closed.sql",
  "20260902231000_gov_paper_atomic_enqueue_and_sweeper.sql",
];

function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(".env.local");

function deployOne(slug) {
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      ["--use-system-ca", "scripts/deploy-edge-via-management-api.mjs", slug],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      console.log(out.trim() || `[${slug}] exit ${code}`);
      resolve({ slug, ok: code === 0 });
    });
  });
}

const deploy = process.argv.includes("--deploy");
const missingMigrations = QA_WAVE_MIGRATIONS.filter(
  (m) => !fs.existsSync(path.join(ROOT, "supabase/migrations", m)),
);

console.log("QA wave deploy manifest");
console.log("Edge functions:", QA_WAVE_EDGE_FUNCTIONS.join(", "));
console.log("Migrations:", QA_WAVE_MIGRATIONS.join(", "));
if (missingMigrations.length) {
  console.warn("Missing migration files:", missingMigrations.join(", "));
}

if (!deploy) {
  console.log("\nDry run. Pass --deploy to push edge functions via Management API.");
  console.log("Apply migrations separately: npx supabase db push");
  process.exit(missingMigrations.length ? 1 : 0);
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN missing — set in .env.local for deploy.");
  process.exit(1);
}

const results = [];
for (const slug of QA_WAVE_EDGE_FUNCTIONS) {
  results.push(await deployOne(slug));
}
const failed = results.filter((r) => !r.ok);
console.log(
  JSON.stringify({
    ok: results.length - failed.length,
    failed: failed.map((f) => f.slug),
  }),
);
process.exit(failed.length ? 1 : 0);
