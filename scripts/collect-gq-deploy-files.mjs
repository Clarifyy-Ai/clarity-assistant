import fs from "fs";
import path from "path";

const root = process.cwd();
const start = "supabase/functions/generate-questions/index.ts";
const seen = new Set();
const files = [];

function walk(rel) {
  const norm = rel.replace(/\\/g, "/");
  if (seen.has(norm)) return;
  seen.add(norm);
  const abs = path.join(root, norm);
  if (!fs.existsSync(abs)) {
    console.error("MISSING", norm);
    return;
  }
  const content = fs.readFileSync(abs, "utf8");
  const name = norm.startsWith("supabase/functions/")
    ? norm.slice("supabase/functions/".length)
    : norm;
  files.push({ name, content });
  const re = /from\s+["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(content))) {
    let dep = m[1];
    if (!dep.endsWith(".ts")) dep += ".ts";
    const depAbs = path.normalize(path.join(path.dirname(abs), dep));
    const depRel = path.relative(root, depAbs).replace(/\\/g, "/");
    walk(depRel);
  }
}

walk(start);
console.log(JSON.stringify({ count: files.length, names: files.map((f) => f.name) }, null, 2));
fs.writeFileSync("tmp-gq-deploy-files.json", JSON.stringify(files));
