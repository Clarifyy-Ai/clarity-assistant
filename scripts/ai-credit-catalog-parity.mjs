#!/usr/bin/env node
/**
 * Verifies frontend AI_CREDIT_COSTS (+ CREDIT_CATALOG_VERSION) match the Edge mirror.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fe = fs.readFileSync(
  path.join(root, "src/lib/constants/creditEconomics.ts"),
  "utf8",
);
const be = fs.readFileSync(
  path.join(root, "supabase/functions/_shared/creditEconomics.ts"),
  "utf8",
);

function extractCatalogVersion(source, label) {
  const m = source.match(
    /export\s+const\s+CREDIT_CATALOG_VERSION\s*=\s*"([^"]+)"/,
  );
  if (!m) throw new Error(`${label}: CREDIT_CATALOG_VERSION not found`);
  return m[1];
}

function extractAiCreditCosts(source, label) {
  const block = source.match(
    /export\s+const\s+AI_CREDIT_COSTS\s*=\s*\{([^}]+)\}/s,
  );
  if (!block) throw new Error(`${label}: AI_CREDIT_COSTS block not found`);
  const costs = {};
  for (const m of block[1].matchAll(/(\w+):\s*(-?\d+)/g)) {
    costs[m[1]] = Number(m[2]);
  }
  if (Object.keys(costs).length === 0) {
    throw new Error(`${label}: AI_CREDIT_COSTS parsed empty`);
  }
  return costs;
}

let failed = false;

const feVersion = extractCatalogVersion(fe, "FE");
const beVersion = extractCatalogVersion(be, "Edge");
if (feVersion !== beVersion) {
  console.error(
    `FAIL: CREDIT_CATALOG_VERSION drift: FE=${feVersion} Edge=${beVersion}`,
  );
  failed = true;
}

const feCosts = extractAiCreditCosts(fe, "FE");
const beCosts = extractAiCreditCosts(be, "Edge");
const keys = new Set([...Object.keys(feCosts), ...Object.keys(beCosts)]);

for (const k of keys) {
  if (!(k in feCosts)) {
    console.error(`FAIL: key only on Edge: ${k}=${beCosts[k]}`);
    failed = true;
    continue;
  }
  if (!(k in beCosts)) {
    console.error(`FAIL: key only on FE: ${k}=${feCosts[k]}`);
    failed = true;
    continue;
  }
  if (feCosts[k] !== beCosts[k]) {
    console.error(
      `FAIL: AI_CREDIT_COSTS mismatch for ${k}: FE=${feCosts[k]} Edge=${beCosts[k]}`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(
  `OK: AI credit catalog parity passed (${keys.size} keys, version ${feVersion})`,
);
