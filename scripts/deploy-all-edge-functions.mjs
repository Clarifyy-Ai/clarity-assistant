/**
 * Deploy edge functions via Supabase Management API.
 * Requires SUPABASE_ACCESS_TOKEN env var.
 *
 * Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/deploy-all-edge-functions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const payloadDir = path.join(root, ".deploy-payloads");
const names = ["delete-account", "export-user-data", "analytics-dashboard"];

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(2);
}

const results = {};

for (const name of names) {
  const argsPath = path.join(payloadDir, `invoke-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));

  const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy?slug=${encodeURIComponent(args.name)}`;

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

  results[name] = {
    status: res.status,
    ok: res.ok,
    version: parsed?.version ?? null,
    error: res.ok ? null : parsed,
  };

  console.log(JSON.stringify({ name, status: res.status, ok: res.ok, version: parsed?.version, error: res.ok ? null : parsed }));
}

const outPath = path.join(payloadDir, "deploy-results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Wrote ${outPath}`);
process.exit(Object.values(results).every((r) => r.ok) ? 0 : 1);
