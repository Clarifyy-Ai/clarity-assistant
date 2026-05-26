/**
 * Reads invoke-args-<name>.json (fs.readFileSync utf8, JSON.parse) and calls
 * deploy_edge_function via Supabase MCP through stdout JSON for agent CallMcpTool.
 *
 * Usage: node scripts/mcp-deploy-call.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-deploy-call.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) {
  f.content = f.content.replace(/\r\n/g, "\n");
}

const argsOnlyPath = path.join(root, ".deploy-payloads", `_mcp-deploy-call-${name}.json`);
const callPath = path.join(root, ".deploy-payloads", `_mcp-deploy-call-out-${name}.json`);
fs.writeFileSync(argsOnlyPath, JSON.stringify(args), "utf8");
fs.writeFileSync(
  callPath,
  JSON.stringify({
    server: "plugin-supabase-supabase",
    toolName: "deploy_edge_function",
    arguments: args,
  }),
  "utf8"
);
console.log(
  JSON.stringify({
    argsOnlyPath,
    callPath,
    bytes: JSON.stringify(args).length,
    fileCount: args.files.length,
  })
);
