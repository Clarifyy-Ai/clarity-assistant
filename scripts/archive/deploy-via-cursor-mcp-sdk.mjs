/**
 * Deploy via Supabase MCP using Cursor-bundled @modelcontextprotocol/sdk.
 * OAuth must be completed in Cursor for plugin-supabase-supabase.
 *
 * Usage: node scripts/deploy-via-cursor-mcp-sdk.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const CURSOR_APP = "C:/Users/TECH-GENIUSES/AppData/Local/Programs/cursor/resources/app";
const SDK = path.join(CURSOR_APP, "node_modules/@modelcontextprotocol/sdk/dist/esm");

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/deploy-via-cursor-mcp-sdk.mjs <function-name>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");

const { Client } = await import(pathToFileURL(path.join(SDK, "client/index.js")).href);
const { StreamableHTTPClientTransport } = await import(
  pathToFileURL(path.join(SDK, "client/streamableHttp.js")).href
);

const transport = new StreamableHTTPClientTransport(new URL("https://mcp.supabase.com/mcp"));
const client = new Client({ name: "clarity-deploy", version: "1.0.0" });

await client.connect(transport);
const result = await client.callTool({
  name: "deploy_edge_function",
  arguments: args,
});
await client.close();

const outPath = path.join(root, ".deploy-payloads", `deploy-result-${name}.json`);
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log("wrote", outPath);
console.log(JSON.stringify(result).slice(0, 2000));
