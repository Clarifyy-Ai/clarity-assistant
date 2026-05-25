/**
 * Reads invoke-args-<name>.json and writes deploy args for MCP (UTF-8).
 * Usage: node scripts/mcp-deploy-read-args.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/mcp-deploy-read-args.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));

// Normalize LF for deploy (invoke-args may use CRLF)
for (const f of args.files) {
  f.content = f.content.replace(/\r\n/g, "\n");
}

const out = path.join(root, ".deploy-payloads", `_mcp-deploy-${name}.json`);
fs.writeFileSync(out, JSON.stringify(args), "utf8");
console.log(out, fs.statSync(out).size);
