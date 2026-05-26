/**
 * Deploy edge function via Supabase Management API using invoke-args JSON.
 * Requires SUPABASE_ACCESS_TOKEN (Personal Access Token from supabase.com/dashboard/account/tokens).
 *
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node scripts/mcp-deploy-from-file-runner.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=... node scripts/mcp-deploy-from-file-runner.mjs <function-name>");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) {
  f.content = f.content.replace(/\r\n/g, "\n");
}

const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy`;
const body = {
  slug: args.name,
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  files: args.files,
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text };
}

const out = {
  name: args.name,
  status: res.status,
  ok: res.ok,
  result: parsed,
  version: parsed?.version ?? parsed?.data?.version ?? null,
  error: res.ok ? null : parsed?.message ?? parsed?.error ?? text,
};

const outPath = path.join(root, ".deploy-payloads", `_deploy-api-result-${name}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
