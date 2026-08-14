#!/usr/bin/env node
/**
 * Pack one Edge Function (entrypoint + relative imports) as MCP deploy JSON.
 * Writes .deploy-payloads/<slug>.json (gitignored). Does not print source.
 *
 * Usage: node scripts/pack-edge-mcp.mjs <slug> [--no-verify-jwt]
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

if (!slug) {
  console.error("Usage: node scripts/pack-edge-mcp.mjs <slug> [--no-verify-jwt]");
  process.exit(1);
}

function resolveImport(fromFile, spec) {
  const abs = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [abs, abs + ".ts", abs + ".js", path.join(abs, "index.ts")];
  return candidates.find((p) => fs.existsSync(p));
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
if (!fs.existsSync(entryAbs)) {
  console.error("Missing", entryAbs);
  process.exit(1);
}

const files = collectFiles(entryAbs);
const payload = {
  project_id: "qzgvjrvtkwlzxpmlddkx",
  name: slug,
  entrypoint_path: "index.ts",
  verify_jwt: verifyJwt,
  files: files.map((abs) => {
    const rel = path.relative(path.join(FN_ROOT, slug), abs).split(path.sep).join("/");
    const name = rel.startsWith("..") ? rel : rel;
    return {
      name: rel.startsWith(".") ? rel : `./${rel}`.replace(/^\.\/\.\.\//, "../"),
      bytes: fs.statSync(abs).size,
      abs,
    };
  }),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, `${slug}.manifest.json`);
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      ...payload,
      files: payload.files.map((f) => ({ name: f.name, bytes: f.bytes, abs: f.abs })),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    slug,
    verify_jwt: verifyJwt,
    file_count: files.length,
    total_bytes: payload.files.reduce((n, f) => n + f.bytes, 0),
    manifest: path.relative(ROOT, outPath),
  }),
);
