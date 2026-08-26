import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
const qa = load(".env.qa.local");
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN;
const ref = "qzgvjrvtkwlzxpmlddkx";
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;

async function q(sql) {
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
  return { status: r.status, text: await r.text() };
}

const cols = await q(
  "select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position",
);
console.log("COLS", cols.text.slice(0, 2000));

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: auth } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
const uid = auth.session.user.id;
const { data: p, error } = await client
  .from("profiles")
  .select("*")
  .eq("id", uid)
  .maybeSingle();
console.log("PROFILE_ERR", error?.message || null);
console.log("PROFILE_KEYS", p ? Object.keys(p) : null);
if (p) {
  console.log(
    "PROFILE",
    JSON.stringify({
      id: p.id,
      plan_id: p.plan_id,
      subscription_tier: p.subscription_tier,
      credits: p.credits,
      credit_balance: p.credit_balance,
      region: p.region,
    }),
  );
}

// Poll latest paper job
const job = await q(
  `select id, status, progress_stage, error_code, generator, updated_at
   from gov_paper_generation_jobs
   where id = '87b4db1d-2c84-4a71-83b4-c755320df7b1'`,
);
console.log("JOB", job.text);

const headers = {
  Authorization: `Bearer ${auth.session.access_token}`,
  apikey: anon,
  "Content-Type": "application/json",
};

for (let i = 0; i < 12; i++) {
  const r = await fetch(
    `${url}/functions/v1/get-paper-generation-job?jobId=87b4db1d-2c84-4a71-83b4-c755320df7b1`,
    { headers },
  );
  const t = await r.text();
  console.log("POLL", i, r.status, t.slice(0, 240));
  if (/completed|failed|cancelled|ready/i.test(t) && !/queued|processing|running/i.test(t)) break;
  // also try process-paper-generation-job kick
  if (i === 0 || i === 3) {
    const kick = await fetch(`${url}/functions/v1/process-paper-generation-job`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jobId: "87b4db1d-2c84-4a71-83b4-c755320df7b1" }),
    });
    console.log("KICK", kick.status, (await kick.text()).slice(0, 200));
  }
  await new Promise((r) => setTimeout(r, 8000));
}
