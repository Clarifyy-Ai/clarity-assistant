/**
 * Deploy edge function via Supabase MCP HTTP (https://mcp.supabase.com/mcp).
 * Requires MCP OAuth bearer token in SUPABASE_MCP_ACCESS_TOKEN env var.
 *
 * Usage: SUPABASE_MCP_ACCESS_TOKEN=... node scripts/deploy-via-mcp-http.mjs delete-account
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MCP_URL = "https://mcp.supabase.com/mcp";
const name = process.argv[2];
if (!name) {
  console.error("Usage: SUPABASE_MCP_ACCESS_TOKEN=... node scripts/deploy-via-mcp-http.mjs <function-name>");
  process.exit(1);
}

const token = process.env.SUPABASE_MCP_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Missing SUPABASE_MCP_ACCESS_TOKEN");
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const argsPath = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");

const body = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "deploy_edge_function",
    arguments: args,
  },
};

const res = await fetch(MCP_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 4000));
process.exit(res.ok ? 0 : 1);
