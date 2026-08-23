const fs = require("fs");
const path = require("path");

function collect(entry, seen = new Set()) {
  const abs = path.resolve(entry);
  if (seen.has(abs)) return [];
  seen.add(abs);
  if (!fs.existsSync(abs)) return [];
  const content = fs.readFileSync(abs, "utf8");
  const rel = path.relative("supabase/functions", abs).split(path.sep).join("/");
  const files = [{ name: rel, content }];
  const re = /from\s+["'](\.\.?\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(content))) {
    let target = path.resolve(path.dirname(abs), m[1]);
    if (!target.endsWith(".ts")) target += ".ts";
    files.push(...collect(target, seen));
  }
  return files;
}

const files = collect("supabase/functions/parse-document/index.ts");
console.log(files.map((f) => f.name).join("\n"));
console.log("COUNT", files.length);
fs.writeFileSync("tmp_parse_files.json", JSON.stringify(files));
