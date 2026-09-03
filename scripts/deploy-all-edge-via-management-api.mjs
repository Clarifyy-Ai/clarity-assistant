#!/usr/bin/env node
/**
 * Deploy every local Edge Function via Management API.
 * Treats HTTP 2xx as success even if Node's process.exit trips a Windows UV assertion.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FN_ROOT = path.join(ROOT, "supabase", "functions");

const NO_JWT = new Set([
  "ping",
  "health",
  "stripe-webhook",
  "razorpay-webhook",
  "support-chat",
  "bulk-import-questions",
  "process-paper-generation-job",
  "run-daily-exam-scrape",
  "cancel-document-processing-job",
  "create-document-processing-job",
  "get-document-processing-job",
  "retry-document-processing-job",
]);

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const slugs = (
  only.length
    ? only
    : fs
        .readdirSync(FN_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
        .filter((d) => fs.existsSync(path.join(FN_ROOT, d.name, "index.ts")))
        .map((d) => d.name)
).sort();

const failed = [];
const ok = [];

for (const slug of slugs) {
  const args = [
    "--use-system-ca",
    path.join("scripts", "deploy-edge-via-management-api.mjs"),
    slug,
  ];
  if (NO_JWT.has(slug)) args.push("--no-verify-jwt");
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const success = /"status":201/.test(out) || /"status":200/.test(out);
  if (success) {
    const version = out.match(/"version":(\d+)/)?.[1] ?? "?";
    console.log(`OK  ${slug} v${version}`);
    ok.push(slug);
  } else {
    console.log(`FAIL ${slug}\n${out.slice(0, 500)}`);
    failed.push(slug);
  }
}

console.log(`\nDeployed ${ok.length}/${slugs.length}`);
if (failed.length) {
  console.error("Failed:", failed.join(", "));
  process.exit(1);
}
