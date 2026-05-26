/**
 * Deploy edge function using args JSON file + Supabase Management API.
 * Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/deploy-mcp-json.mjs .deploy-payloads/_mcp-call-analytics-dashboard.json
 */
import fs from "fs";

const argsPath = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!argsPath || !token) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/deploy-mcp-json.mjs <args.json>");
  process.exit(2);
}

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
  parsed = { raw: text.slice(0, 800) };
}

console.log(JSON.stringify({ name: args.name, ok: res.ok, status: res.status, version: parsed?.version, error: res.ok ? null : parsed }));
process.exit(res.ok ? 0 : 1);
