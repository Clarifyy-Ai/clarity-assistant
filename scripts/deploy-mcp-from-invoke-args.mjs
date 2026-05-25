/**
 * Reads invoke-args-<name>.json and prints deploy result path for agent MCP call.
 * Usage: node scripts/deploy-mcp-from-invoke-args.mjs analytics-dashboard
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/deploy-mcp-from-invoke-args.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));

// Write args-only for CallMcpTool (agent reads this path)
const outPath = path.join(root, ".deploy-payloads", `_deploy-args-${name}.json`);
fs.writeFileSync(outPath, JSON.stringify(args), "utf8");

console.log(
  JSON.stringify({
    name: args.name,
    outPath,
    bytes: JSON.stringify(args).length,
    files: args.files.map((f) => ({ name: f.name, contentLength: f.content.length })),
  })
);
