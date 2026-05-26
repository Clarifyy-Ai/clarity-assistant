/**
 * Load invoke-args JSON and write deploy args for MCP (UTF-8).
 * Usage: node scripts/mcp-deploy-full.mjs <function-name>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-deploy-full.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");

const out = path.join(root, ".deploy-payloads", `_mcp-args-${name}.json`);
fs.writeFileSync(out, JSON.stringify(args), "utf8");
console.log(out);
