import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file) {
  const p = path.join(ROOT, file);
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}
const token = load(".env.local").SUPABASE_ACCESS_TOKEN;
async function q(sql) {
  const res = await fetch("https://api.supabase.com/v1/projects/qzgvjrvtkwlzxpmlddkx/database/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return res.text();
}
console.log("mt", await q("select * from mock_tests where id = '92b12272-777f-4839-8b4f-a6731e234a89'"));
console.log("an", await q("select * from test_analyses where test_id = '92b12272-777f-4839-8b4f-a6731e234a89'"));
