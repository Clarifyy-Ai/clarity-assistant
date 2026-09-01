import fs from "node:fs";

function load(p) {
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
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const env = { ...load(".env.local"), ...load(".env") };
const sql = fs.readFileSync(
  "supabase/migrations/20260831140000_gov_paper_job_status_check_expand.sql",
  "utf8",
);
const ref = env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});
const text = await r.text();
console.log(r.status, text.slice(0, 800));
process.exit(r.ok ? 0 : 1);
