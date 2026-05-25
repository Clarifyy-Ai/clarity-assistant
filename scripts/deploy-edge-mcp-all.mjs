/**
 * Deploy all edge functions via Supabase MCP deploy_edge_function.
 * Run from repo root: node scripts/deploy-edge-mcp-all.mjs
 *
 * Requires Cursor agent to invoke MCP; this script prints payloads for manual/agent MCP calls.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const payloadDir = path.join(root, ".deploy-payloads");
const FUNCTIONS = ["analytics-dashboard", "export-user-data", "delete-account"];

const results = {};

for (const name of FUNCTIONS) {
  const fixedPath = path.join(payloadDir, `_deploy-request-fixed-${name}.json`);
  const rawPath = path.join(payloadDir, `_deploy-request-${name}.json`);
  const pathToUse = fs.existsSync(fixedPath) ? fixedPath : rawPath;
  const args = JSON.parse(fs.readFileSync(pathToUse, "utf8"));
  results[name] = {
    project_id: args.project_id,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files.map((f) => ({ name: f.name, contentLength: f.content.length })),
    payloadPath: pathToUse,
    payloadBytes: JSON.stringify(args).length,
  };
}

const outPath = path.join(payloadDir, "deploy-results-summary.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
