#!/usr/bin/env node
/**
 * CI gate: every AI function in AI_FUNCTION_CAPABILITY must wire capability checks.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(
  root,
  "supabase/functions/_shared/requireCapability.ts",
);
const catalog = fs.readFileSync(catalogPath, "utf8");

const fnNames = [...catalog.matchAll(/"([\w-]+)":\s*"/g)]
  .map((m) => m[1])
  .filter((name) => name.includes("-"));

let failed = false;

for (const fn of fnNames) {
  const indexPath = path.join(root, "supabase/functions", fn, "index.ts");
  if (!fs.existsSync(indexPath)) {
    console.error(`FAIL: mapped AI function missing index.ts: ${fn}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(indexPath, "utf8");
  const hasGate =
    /requireCapabilityForFunction\s*\(/.test(text) ||
    /requireCapabilityAsync\s*\(/.test(text) ||
    /requireCapability\s*\(/.test(text);
  if (!hasGate) {
    console.error(
      `FAIL: ${fn} is in AI_FUNCTION_CAPABILITY but has no requireCapability* call`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`OK: capability gates wired for ${fnNames.length} AI functions`);
