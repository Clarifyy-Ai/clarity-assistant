#!/usr/bin/env node
/**
 * Deploy one Edge Function via Management API (no Docker).
 * Uses SUPABASE_ACCESS_TOKEN. Collects local relative imports under supabase/functions.
 *
 * Usage:
 *   node --use-system-ca scripts/deploy-edge-via-management-api.mjs delete-account
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FN_ROOT = path.join(ROOT, "supabase", "functions");

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
const slug = process.argv[2];
const verifyJwtArg = process.argv.includes("--no-verify-jwt") ? false : true;

if (!token || !slug) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=sbp_... node --use-system-ca scripts/deploy-edge-via-management-api.mjs <slug> [--no-verify-jwt]");
  process.exit(1);
}

function resolveImport(fromFile, spec) {
  const abs = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [
    abs,
    abs + ".ts",
    abs + ".js",
    path.join(abs, "index.ts"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function collectFiles(entrypoint) {
  const seen = new Set();
  const queue = [entrypoint];
  while (queue.length) {
    const file = queue.pop();
    const norm = path.normalize(file);
    if (seen.has(norm)) continue;
    if (!norm.startsWith(path.normalize(FN_ROOT))) continue;
    seen.add(norm);
    const src = fs.readFileSync(norm, "utf8");
    const re = /from\s+["'](\.\.?\/[^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) {
      const resolved = resolveImport(norm, m[1]);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

const entryAbs = path.join(FN_ROOT, slug, "index.ts");
if (!fs.existsSync(entryAbs)) {
  console.error("Missing", entryAbs);
  process.exit(1);
}

const files = collectFiles(entryAbs);
const form = new FormData();
const entryRel = path.relative(ROOT, entryAbs).split(path.sep).join("/");
form.append(
  "metadata",
  JSON.stringify({
    name: slug,
    entrypoint_path: entryRel,
    verify_jwt: verifyJwtArg,
  }),
);

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const buf = fs.readFileSync(abs);
  form.append("file", new Blob([buf], { type: "application/typescript" }), rel);
}

const url = `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`;
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const text = await res.text();
console.log(JSON.stringify({ slug, status: res.status, body: text.slice(0, 800) }));
// Avoid process.exit() — Node 24 on Windows can abort after a successful
// FormData fetch with UV_HANDLE_CLOSING even when status is 201.
process.exitCode = res.ok ? 0 : 1;
