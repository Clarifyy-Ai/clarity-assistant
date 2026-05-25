import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const name = process.argv[2];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const script = path.join(__dirname, "call-mcp-deploy.mjs");
const out = path.join(root, ".deploy-payloads", `_stdout-${name}-deploy.json`);

const r = spawnSync(process.execPath, [script, name], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}
fs.writeFileSync(out, r.stdout, "utf8");
const args = JSON.parse(r.stdout);
console.log(
  JSON.stringify({
    out,
    name: args.name,
    bytes: r.stdout.length,
    corsFallback: args.files.some((f) =>
      f.content.includes("FALLBACK_PRODUCTION_ORIGINS")
    ),
    deduct: args.files.some((f) => f.content.includes("deductCredits")),
  })
);
