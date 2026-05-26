/**
 * Build deploy_edge_function args from .deploy-payloads/<name>/ on disk.
 * Usage: node scripts/mcp-deploy-from-disk.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-deploy-from-disk.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const fnDir = path.join(root, ".deploy-payloads", name);
const invokePath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const meta = JSON.parse(fs.readFileSync(invokePath, "utf8"));

const args = {
  project_id: meta.project_id,
  name: meta.name,
  entrypoint_path: meta.entrypoint_path,
  verify_jwt: meta.verify_jwt,
  files: [
    {
      name: "index.ts",
      content: fs.readFileSync(path.join(fnDir, "index.ts"), "utf8"),
    },
    {
      name: "../_shared/cors.ts",
      content: fs.readFileSync(path.join(fnDir, "_shared", "cors.ts"), "utf8"),
    },
    {
      name: "../_shared/supabase.ts",
      content: fs.readFileSync(path.join(fnDir, "_shared", "supabase.ts"), "utf8"),
    },
  ],
};

process.stdout.write(JSON.stringify(args));
