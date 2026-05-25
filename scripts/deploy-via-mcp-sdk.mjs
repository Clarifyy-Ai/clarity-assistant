/**
 * Deploy edge function by reading invoke-args-<name>.json and calling deploy_edge_function
 * via Cursor's bundled @modelcontextprotocol/sdk (stdio to plugin-supabase-supabase if configured).
 *
 * Fallback: prints args path for agent CallMcpTool.
 * Usage: node scripts/deploy-via-mcp-sdk.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/deploy-via-mcp-sdk.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");

const outPath = path.join(root, ".deploy-payloads", `_lf-${name}.json`);
fs.writeFileSync(outPath, JSON.stringify(args), "utf8");

// Agent must CallMcpTool(plugin-supabase-supabase, deploy_edge_function, args)
console.log(
  JSON.stringify({
    action: "CallMcpTool",
    server: "plugin-supabase-supabase",
    toolName: "deploy_edge_function",
    argumentsPath: outPath,
    bytes: JSON.stringify(args).length,
    fileCount: args.files.length,
    hasFallback: args.files.some((f) => f.content.includes("FALLBACK_PRODUCTION_ORIGINS")),
    hasDeduct: args.files.some((f) => f.content.includes("deductCredits")),
  })
);
