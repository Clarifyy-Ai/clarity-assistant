/**
 * Build deploy payloads from .deploy-payloads/<fn>/ folders for MCP deploy_edge_function.
 * Outputs one JSON line per function to stdout (for agent CallMcpTool).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const payloadDir = path.join(root, ".deploy-payloads");

const FUNCTIONS = ["analytics-dashboard", "export-user-data", "delete-account"];

function readFile(fnDir, rel) {
  return fs.readFileSync(path.join(fnDir, rel), "utf8");
}

for (const name of FUNCTIONS) {
  const fnDir = path.join(payloadDir, name);
  const meta = JSON.parse(fs.readFileSync(path.join(fnDir, "meta.json"), "utf8"));
  const payload = {
    project_id: meta.project_id,
    name: meta.name,
    entrypoint_path: meta.entrypoint_path,
    verify_jwt: meta.verify_jwt,
    files: [
      { name: "index.ts", content: readFile(fnDir, "index.ts") },
      { name: "_shared/cors.ts", content: readFile(fnDir, "_shared/cors.ts") },
      { name: "_shared/supabase.ts", content: readFile(fnDir, "_shared/supabase.ts") },
    ],
  };
  const outPath = path.join(payloadDir, `_deploy-request-${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Wrote ${outPath} (${JSON.stringify(payload).length} bytes)`);
}
