/**
 * Reads invoke-args-<name>.json and writes MCP deploy args + result stub.
 * Agent: CallMcpTool(plugin-supabase-supabase, deploy_edge_function, args)
 * Usage: node scripts/mcp-call-deploy-from-invoke-args.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-call-deploy-from-invoke-args.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) {
  f.content = f.content.replace(/\r\n/g, "\n");
}

const outArgs = path.join(root, ".deploy-payloads", `_mcp-call-args-${name}.json`);
fs.writeFileSync(outArgs, JSON.stringify(args), "utf8");
console.log(outArgs);
