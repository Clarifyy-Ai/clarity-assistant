/**
 * Reads invoke-args JSON and prints MCP deploy args as one line (UTF-8).
 * Agent: JSON.parse(stdout) -> CallMcpTool(deploy_edge_function, args)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/call-mcp-deploy.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");
process.stdout.write(JSON.stringify(args));
