/**
 * Prints deploy_edge_function arguments JSON for one function (stdout).
 * Usage: node scripts/run-mcp-deploy-from-file.mjs analytics-dashboard
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/run-mcp-deploy-from-file.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `args-only-${name}.json`);

if (!fs.existsSync(argsPath)) {
  console.error(`Missing ${argsPath}`);
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
process.stdout.write(JSON.stringify(args));
