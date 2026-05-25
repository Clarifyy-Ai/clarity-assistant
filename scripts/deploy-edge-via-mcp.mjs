/**
 * Deploy edge functions by reading .deploy-payloads/_mcp-args-<name>.json
 * and writing deploy results to .deploy-payloads/deploy-results.json
 *
 * Run: node scripts/deploy-edge-via-mcp.mjs
 * (MCP calls are made by the agent via CallMcpTool; this script only validates payloads.)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const payloadDir = path.join(root, ".deploy-payloads");
const names = ["analytics-dashboard", "export-user-data", "delete-account"];

const payloads = {};
for (const name of names) {
  const file = path.join(payloadDir, `_mcp-args-${name}.json`);
  payloads[name] = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`OK ${name}: ${payloads[name].files.length} files`);
}

fs.writeFileSync(
  path.join(payloadDir, "deploy-payloads-summary.json"),
  JSON.stringify(
    Object.fromEntries(
      names.map((n) => [
        n,
        {
          project_id: payloads[n].project_id,
          name: payloads[n].name,
          entrypoint_path: payloads[n].entrypoint_path,
          verify_jwt: payloads[n].verify_jwt,
          files: payloads[n].files.map((f) => f.name),
        },
      ])
    ),
    null,
    2
  )
);
