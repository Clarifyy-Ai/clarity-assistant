/**
 * Reads args-only-<name>.json and writes UTF-8 invoke payload for MCP deploy_edge_function.
 * Usage: node scripts/mcp-deploy-one.mjs analytics-dashboard
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-deploy-one.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `args-only-${name}.json`);
const outPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);

const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
fs.writeFileSync(outPath, JSON.stringify(args), "utf8");
console.log(outPath, fs.statSync(outPath).size);
