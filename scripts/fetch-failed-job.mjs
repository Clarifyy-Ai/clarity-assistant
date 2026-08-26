import fs from "node:fs";

function load(p) {
  const o = {};
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

const local = load(".env.local");
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN;
const ref = "qzgvjrvtkwlzxpmlddkx";
const jobId = "87b4db1d-2c84-4a71-83b4-c755320df7b1";

const sql = `
select id, status, progress_stage, error_code, error_message, updated_at
from gov_paper_generation_jobs
where id = '${jobId}'
`;

const r = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);
console.log(await r.text());

const cols = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "select column_name from information_schema.columns where table_schema='public' and table_name='gov_paper_generation_jobs' order by ordinal_position",
    }),
  },
);
console.log("JOB_COLS", (await cols.text()).slice(0, 1500));
