#!/usr/bin/env node
/**
 * deploy-all-edge-functions.mjs
 *
 * Deploys every edge function found under supabase/functions/ (skips _shared).
 * Uses the Supabase CLI via `npx supabase functions deploy <name>`.
 *
 * Prerequisites:
 *   - Supabase CLI available (npx supabase --version)
 *   - Logged in: npx supabase login
 *   - Project linked: npx supabase link --project-ref <ref>
 *
 * Usage:
 *   node scripts/deploy-all-edge-functions.mjs [--dry-run] [--filter=<name>]
 *
 * Options:
 *   --dry-run        Print commands without executing
 *   --filter=<name>  Only deploy functions whose name includes <name>
 */

import { execSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = join(__dirname, "..", "supabase", "functions");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.split("=")[1] : null;

// Collect function names (subdirectories, excluding _shared)
const functions = readdirSync(FUNCTIONS_DIR)
  .filter((name) => {
    if (name.startsWith("_")) return false;
    const full = join(FUNCTIONS_DIR, name);
    return statSync(full).isDirectory();
  })
  .filter((name) => !filter || name.includes(filter))
  .sort();

console.log(`\nEdge functions to deploy: ${functions.length}`);
if (dryRun) console.log("(DRY RUN — no commands will be executed)\n");

const results = { ok: [], failed: [] };

for (const fn of functions) {
  const cmd = `npx supabase functions deploy ${fn}`;
  process.stdout.write(`  → ${fn.padEnd(38)}`);

  if (dryRun) {
    console.log(`[dry-run] ${cmd}`);
    results.ok.push(fn);
    continue;
  }

  try {
    execSync(cmd, { stdio: "pipe" });
    console.log("OK");
    results.ok.push(fn);
  } catch (err) {
    const stderr = err.stderr?.toString().trim() || err.message;
    console.log(`FAILED\n     ${stderr}`);
    results.failed.push(fn);
  }
}

console.log(`\nDeployed ${results.ok.length}/${functions.length} functions.`);
if (results.failed.length) {
  console.error(`Failed: ${results.failed.join(", ")}`);
  process.exit(1);
}
