#!/usr/bin/env node
/**
 * Phase 5 ops gate — verifies migration + edge/Python readiness artifacts exist.
 * Run on target environment after deploy; exits non-zero when blockers remain.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;

function check(label, ok, detail) {
  if (ok) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed = true;
  }
}

const migrationPath = path.join(
  root,
  "supabase/migrations/20260905140000_gov_exam_inventory_public_pyp_fix.sql",
);
check(
  "PYQ inventory migration present",
  fs.existsSync(migrationPath),
  migrationPath,
);

const inv = fs.readFileSync(
  path.join(root, "supabase/functions/_shared/govQuestionInventory.ts"),
  "utf8",
);
check(
  "sourcePolicyForMode in govQuestionInventory",
  inv.includes("sourcePolicyForMode"),
);

const create = fs.readFileSync(
  path.join(root, "supabase/functions/create-exam-paper/index.ts"),
  "utf8",
);
check(
  "create-exam-paper uses sourcePolicyForMode",
  create.includes("sourcePolicyForMode(mode)"),
);

const certPath = path.join(
  root,
  "docs/gov-exam/GOV_EXAM_PRODUCTION_CERTIFICATION.md",
);
check("Production certification doc present", fs.existsSync(certPath));

const allowlistPath = path.join(root, "supabase/functions/REMOTE_FUNCTION_ALLOWLIST.txt");
check(
  "Edge allowlist includes gov exam functions",
  fs.existsSync(allowlistPath) &&
    ["create-exam-paper", "check-exam-paper-availability", "submit-test"].every(
      (fn) => fs.readFileSync(allowlistPath, "utf8").includes(fn),
    ),
);

console.log("\nNote: Apply migration, deploy edge functions, and verify Python worker manually on target DB/host.");
console.log("See docs/gov-exam/GOV_EXAM_PRODUCTION_CERTIFICATION.md for full checklist.\n");

if (failed) process.exit(1);
console.log("OK: Ops gate artifact checks passed (deploy steps still required on environment).");
