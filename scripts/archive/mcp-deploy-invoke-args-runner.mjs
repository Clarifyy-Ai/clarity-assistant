/**
 * Reads invoke-args-<name>.json and POSTs deploy payload to Supabase Management API.
 * Requires SUPABASE_ACCESS_TOKEN in environment (Personal Access Token).
 *
 * Usage: SUPABASE_ACCESS_TOKEN=... node scripts/mcp-deploy-invoke-args-runner.mjs analytics-dashboard
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=... node scripts/mcp-deploy-invoke-args-runner.mjs <function-name>");
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

const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy`;
const body = {
  slug: args.name,
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  import_map_path: args.import_map_path,
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
};
console.log(JSON.stringify(out, null, 2));
process.exit(res.ok ? 0 : 1);
