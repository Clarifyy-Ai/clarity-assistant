#!/usr/bin/env node
/**
 * Release gate: product-copy / security remnant assertions for CI.
 * Fails if active Rooms routes, BYOK headers, or service-role leaks reappear in src/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");

const FORBIDDEN = [
  { re: /x-api-key-byok/i, label: "BYOK header remnant" },
  { re: /SUPABASE_SERVICE_ROLE_KEY/, label: "service role key reference in src" },
  { re: /setBYOKKey/, label: "setBYOKKey remnant" },
];

const USER_FACING_DIRS = [
  path.join(srcRoot, "pages", "marketing"),
  path.join(srcRoot, "components", "billing"),
  path.join(srcRoot, "lib", "constants"),
];

const PROHIBITED_USER_COPY = [
  { re: /\bEnterprise\b.*\bper seat\b/i, label: "Enterprise per-seat claim" },
  { re: /\bSSO\b|\bSAML\b|\bSCIM\b/i, label: "SSO/SAML/SCIM claim in user copy" },
  { re: /\bHRIS\b|\bworkforce management\b/i, label: "HRIS/workforce claim" },
  { re: /Contact Sales.*Enterprise/i, label: "Enterprise contact-sales CTA" },
  { re: /∞\s*Unlimited|Unlimited credits/i, label: "Unlimited credits claim" },
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const roomsPage = path.join(srcRoot, "pages", "app", "rooms", "PracticeRooms.tsx");
if (fs.existsSync(roomsPage)) {
  console.error("FAIL: PracticeRooms.tsx still present");
  process.exit(1);
}

let failed = false;
for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) {
      console.error(`FAIL: ${rule.label} in ${path.relative(root, file)}`);
      failed = true;
    }
  }
}

// Enterprise display honesty: pricing display names must use Max for enterprise
const pricing = fs.readFileSync(path.join(srcRoot, "lib", "constants", "pricing.ts"), "utf8");
if (!/enterprise:\s*"Max"/.test(pricing)) {
  console.error('FAIL: PLAN_DISPLAY_NAMES.enterprise must be "Max"');
  failed = true;
}

if (failed) process.exit(1);

for (const dir of USER_FACING_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const rule of PROHIBITED_USER_COPY) {
      if (rule.re.test(text)) {
        console.error(`FAIL: ${rule.label} in ${path.relative(root, file)}`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
console.log("OK: release-copy gates passed");
