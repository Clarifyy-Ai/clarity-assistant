/**
 * Prints deploy_edge_function arguments JSON for MCP CallMcpTool.
 * Usage: node scripts/deploy-edge-mcp-from-file.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/deploy-edge-mcp-from-file.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const file = path.join(root, ".deploy-payloads", `_mcp-deploy-${name}.json`);
if (!fs.existsSync(file)) {
  const alt = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
  if (!fs.existsSync(alt)) {
    console.error(`Missing ${file} and ${alt}`);
    process.exit(1);
  }
  const args = JSON.parse(fs.readFileSync(alt, "utf8"));
  for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");
  process.stdout.write(JSON.stringify(args));
  process.exit(0);
}

process.stdout.write(fs.readFileSync(file, "utf8"));
