/**
 * Reads invoke-args-<name>.json (or path arg) and prints one JSON line for MCP deploy_edge_function.
 * Usage: node scripts/mcp-deploy-from-json-file.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath =
  process.argv[3] ??
  path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);

const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) {
  f.content = f.content.replace(/\r\n/g, "\n");
}
process.stdout.write(JSON.stringify(args));
