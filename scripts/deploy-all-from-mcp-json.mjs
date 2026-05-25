/**
 * Deploy analytics-dashboard, export-user-data, delete-account from _mcp-call-*.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN (sbp_... from supabase.com/dashboard/account/tokens)");
  process.exit(2);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = ["analytics-dashboard", "export-user-data", "delete-account"];
const results = {};

for (const name of names) {
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

  results[name] = { ok: res.ok, status: res.status, version: parsed?.version, error: res.ok ? null : parsed };
  console.log(JSON.stringify(results[name], null, 0).replace(/\n/g, " "), name);
}

fs.writeFileSync(
  path.join(root, ".deploy-payloads", "deploy-results-all.json"),
  JSON.stringify(results, null, 2)
);
process.exit(Object.values(results).every((r) => r.ok) ? 0 : 1);
