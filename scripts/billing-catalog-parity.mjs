#!/usr/bin/env node
/**
 * Verifies frontend planCatalog ranks match backend billingCatalog ranks.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fe = fs.readFileSync(
  path.join(root, "src/lib/billing/planCatalog.ts"),
  "utf8",
);
const be = fs.readFileSync(
  path.join(root, "supabase/functions/_shared/billingCatalog.ts"),
  "utf8",
);

function extractRanks(source) {
  const block = source.match(/PLAN_RANK[^=]*=\s*\{([^}]+)\}/s);
  if (!block) throw new Error("PLAN_RANK block not found");
  const ranks = {};
  for (const m of block[1].matchAll(/(\w+):\s*(-?\d+)/g)) {
    ranks[m[1]] = Number(m[2]);
  }
  return ranks;
}

const feRanks = extractRanks(fe);
const beRanks = extractRanks(be);

let failed = false;
const keys = new Set([...Object.keys(feRanks), ...Object.keys(beRanks)]);
for (const k of keys) {
  if (feRanks[k] !== beRanks[k]) {
    console.error(`FAIL: rank mismatch for ${k}: FE=${feRanks[k]} BE=${beRanks[k]}`);
    failed = true;
  }
}

if (!/enterprise:\s*\{[\s\S]*?displayName:\s*"Max"/.test(be)) {
  console.error('FAIL: backend enterprise displayName must be "Max"');
  failed = true;
}

if (failed) process.exit(1);
console.log("OK: billing catalog parity passed");
