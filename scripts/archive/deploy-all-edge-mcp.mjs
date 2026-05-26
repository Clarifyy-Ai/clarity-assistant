/**
 * Loads invoke-args for all three functions and writes deploy results file.
 * Agent must CallMcpTool(deploy_edge_function) per function with parsed JSON.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const payloadDir = path.join(root, ".deploy-payloads");
const names = ["delete-account", "export-user-data", "analytics-dashboard"];

const out = {};
for (const name of names) {
  const argsPath = path.join(payloadDir, `invoke-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
  const outPath = path.join(payloadDir, `_mcp-args-${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(args), "utf8");
  out[name] = {
    argsPath: outPath,
    bytes: JSON.stringify(args).length,
    project_id: args.project_id,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    fileNames: args.files.map((f) => f.name),
    corsOk: args.files[1]?.content?.includes("FALLBACK_PRODUCTION_ORIGINS") ?? false,
    supOk: args.files[2]?.content?.includes("deductCredits") ?? false,
  };
}

const summaryPath = path.join(payloadDir, "deploy-mcp-batch-summary.json");
fs.writeFileSync(summaryPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
