#!/usr/bin/env node
/**
 * Write MCP deploy_edge_function arguments JSON for one slug.
 * Usage: node scripts/write-edge-mcp-payload.mjs <slug> [--no-verify-jwt]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FN_ROOT = path.join(ROOT, "supabase", "functions");
const OUT_DIR = path.join(ROOT, ".deploy-payloads");
const slug = process.argv[2];
const verifyJwt = !process.argv.includes("--no-verify-jwt");

if (!slug) process.exit(1);

function resolveImport(fromFile, spec) {
  const abs = path.normalize(path.join(path.dirname(fromFile), spec));
  return [abs, abs + ".ts", abs + ".js", path.join(abs, "index.ts")].find((p) =>
    fs.existsSync(p),
  );
}

function collectFiles(entrypoint) {
  const seen = new Set();
  const queue = [entrypoint];
  while (queue.length) {
    const file = queue.pop();
    const norm = path.normalize(file);
    if (seen.has(norm)) continue;
    if (!norm.startsWith(path.normalize(FN_ROOT))) continue;
    seen.add(norm);
    const src = fs.readFileSync(norm, "utf8");
    const re = /from\s+["'](\.\.?\/[^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) {
      const resolved = resolveImport(norm, m[1]);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

const entryAbs = path.join(FN_ROOT, slug, "index.ts");
const files = collectFiles(entryAbs).map((abs) => ({
  name: path.relative(ROOT, abs).split(path.sep).join("/"),
  content: fs.readFileSync(abs, "utf8"),
}));

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, `${slug}.payload.json`);
const entryRel = path.relative(ROOT, entryAbs).split(path.sep).join("/");
fs.writeFileSync(
  outPath,
  JSON.stringify({
    project_id: "qzgvjrvtkwlzxpmlddkx",
    name: slug,
    entrypoint_path: entryRel,
    verify_jwt: verifyJwt,
    files,
  }),
);
console.log(JSON.stringify({ slug, bytes: fs.statSync(outPath).size, files: files.length }));
