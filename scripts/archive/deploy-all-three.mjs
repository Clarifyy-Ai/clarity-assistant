/**
 * Deploy all three edge functions from invoke-args-*.json via Management API.
 * Requires: SUPABASE_ACCESS_TOKEN (sbp_... from supabase.com/dashboard/account/tokens)
 *
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."; node scripts/deploy-all-three.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const NAMES = ["delete-account", "export-user-data", "analytics-dashboard"];
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const results = {};

for (const name of NAMES) {
  const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
  for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");

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
    ok: res.ok,
    status: res.status,
    version: parsed?.version ?? null,
    error: res.ok ? null : parsed,
  };

  console.log(
    JSON.stringify({
      name,
      ok: res.ok,
      status: res.status,
      version: parsed?.version,
      error: res.ok ? null : parsed?.message ?? parsed,
    })
  );
}

const outPath = path.join(root, ".deploy-payloads", "deploy-results-all.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Wrote ${outPath}`);
process.exit(Object.values(results).every((r) => r.ok) ? 0 : 1);
