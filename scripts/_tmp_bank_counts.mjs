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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}
const token = load(".env.local").SUPABASE_ACCESS_TOKEN;
async function q(sql) {
  const res = await fetch(
    "https://api.supabase.com/v1/projects/qzgvjrvtkwlzxpmlddkx/database/query",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  return { status: res.status, text: await res.text() };
}

const bank = await q(`
  select publish_status, review_status, count(*)::int as n
  from questions
  group by 1,2
  order by n desc
  limit 20
`);
console.log("bank", bank.status, bank.text.slice(0, 1500));

const ready = await q(`
  select exam_code, exam_name, approved_public_count, required_questions, full_simulation_available, status
  from get_gov_exam_bank_readiness()
  order by approved_public_count desc
  limit 15
`);
console.log("readiness", ready.status, ready.text.slice(0, 2000));
