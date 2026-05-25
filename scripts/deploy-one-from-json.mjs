/**
 * Deploy one edge function from .deploy-payloads/_mcp-call-<name>.json
 * Uses Supabase Management API (same as deploy-all-three.mjs).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!name || !token) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/deploy-one-from-json.mjs <name>");
  process.exit(2);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argsPath = path.join(root, ".deploy-payloads", `_mcp-call-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");

const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy?slug=${encodeURIComponent(args.name)}`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    slug: args.name,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files,
  }),
});

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 500) };
}

console.log(JSON.stringify({ ok: res.ok, status: res.status, version: parsed?.version, error: res.ok ? null : parsed }));
process.exit(res.ok ? 0 : 1);
