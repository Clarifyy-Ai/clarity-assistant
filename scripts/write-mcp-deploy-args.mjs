import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const fn = process.argv[2];
if (!fn) {
  console.error("Usage: node scripts/write-mcp-deploy-args.mjs <function-name>");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fnRoot = path.join(root, "supabase", "functions");

const payload = {
  project_id: "qzgvjrvtkwlzxpmlddkx",
  name: fn,
  entrypoint_path: "index.ts",
  verify_jwt: false,
  files: [
    { name: "index.ts", content: fs.readFileSync(path.join(fnRoot, fn, "index.ts"), "utf8") },
    { name: "../_shared/cors.ts", content: fs.readFileSync(path.join(fnRoot, "_shared", "cors.ts"), "utf8") },
    { name: "../_shared/supabase.ts", content: fs.readFileSync(path.join(fnRoot, "_shared", "supabase.ts"), "utf8") },
  ],
};

const out = path.join(root, ".deploy-payloads", `_mcp-call-${fn}.json`);
fs.writeFileSync(out, JSON.stringify(payload), "utf8");
console.log(out, payload.files.reduce((n, f) => n + f.content.length, 0));
