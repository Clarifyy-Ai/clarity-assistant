import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FN_ROOT = path.join(ROOT, "supabase", "functions");
const slug = "process-paper-generation-job";

function resolveImport(fromFile, spec) {
  const abs = path.normalize(path.join(path.dirname(fromFile), spec));
  return [abs, abs + ".ts", abs + ".js", path.join(abs, "index.ts")].find((p) =>
    fs.existsSync(p),
  );
}

function collect(entrypoint) {
  const seen = new Set();
  const queue = [entrypoint];
  while (queue.length) {
    const file = queue.pop();
    const norm = path.normalize(file);
    if (seen.has(norm) || !norm.startsWith(path.normalize(FN_ROOT))) continue;
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

const entry = path.join(FN_ROOT, slug, "index.ts");
const files = collect(entry).map((abs) => ({
  name: path.relative(ROOT, abs).split(path.sep).join("/"),
  content: fs.readFileSync(abs, "utf8"),
}));

const out = {
  project_id: "qzgvjrvtkwlzxpmlddkx",
  name: slug,
  entrypoint_path: path.relative(ROOT, entry).split(path.sep).join("/"),
  verify_jwt: false,
  files,
};
fs.writeFileSync(
  path.join(ROOT, "scripts", "_mcp_deploy_process_paper.json"),
  JSON.stringify(out),
);
console.log(JSON.stringify({ files: files.length, names: files.map((f) => f.name) }));
