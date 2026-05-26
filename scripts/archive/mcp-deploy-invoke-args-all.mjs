/**
 * Reads invoke-args-<name>.json and prints deploy_edge_function arguments as one JSON line.
 * Agent: CallMcpTool(plugin-supabase-supabase, deploy_edge_function, JSON.parse(stdout))
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-deploy-invoke-args-all.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);

if (!fs.existsSync(argsPath)) {
  console.error(`Missing ${argsPath}`);
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
process.stdout.write(JSON.stringify(args));
