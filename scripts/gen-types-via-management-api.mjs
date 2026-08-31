#!/usr/bin/env node
/**
 * Generate supabase-js TypeScript types via Management API (no Docker / CLI login).
 * Uses SUPABASE_ACCESS_TOKEN. Never commit that token.
 *
 * Usage:
 *   node --use-system-ca scripts/gen-types-via-management-api.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "integrations", "supabase", "types.ts");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";

if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN and run: node --use-system-ca scripts/gen-types-via-management-api.mjs");
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`;
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
const text = await res.text();
if (!res.ok) {
  console.error(JSON.stringify({ status: res.status, body: text.slice(0, 500) }));
  process.exit(1);
}

let types = text;
try {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed.types === "string") types = parsed.types;
} catch {
  // already TypeScript
}

if (!types.includes("export type Database")) {
  console.error("Unexpected types payload (missing export type Database)");
  process.exit(1);
}

fs.writeFileSync(OUT, types.endsWith("\n") ? types : `${types}\n`);
console.log(JSON.stringify({ out: path.relative(ROOT, OUT).split(path.sep).join("/"), bytes: types.length }));
process.exit(0);
