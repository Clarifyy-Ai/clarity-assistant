/**
 * Deploy edge functions by reading invoke-args-<name>.json and printing deploy results.
 * Agent should CallMcpTool(deploy_edge_function, JSON.parse(stdout)) per function.
 *
 * Usage: node scripts/deploy-edge-call-mcp.mjs analytics-dashboard
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);

if (!fs.existsSync(argsPath)) {
  console.error(`Missing ${argsPath}`);
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
process.stdout.write(JSON.stringify(args));
