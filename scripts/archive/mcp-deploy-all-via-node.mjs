/**
 * Deploy all three edge functions by printing MCP deploy_edge_function arguments paths.
 * Agent must CallMcpTool per function using invoke-args-<name>.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const payloadDir = path.join(root, ".deploy-payloads");
const names = ["analytics-dashboard", "export-user-data", "delete-account"];

const summary = {};
for (const name of names) {
  const argsPath = path.join(payloadDir, `invoke-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
  summary[name] = {
    argsPath,
    bytes: JSON.stringify(args).length,
    project_id: args.project_id,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    fileNames: args.files.map((f) => f.name),
  };
}

const out = path.join(payloadDir, "deploy-mcp-summary.json");
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
