import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const local = { ...load(".env.local"), ...load(".env") };
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (error) throw error;
const tok = data.session.access_token;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

const { data: q } = await client
  .from("coding_questions")
  .select("id,title,starter_code,language,evaluation_mode,max_submissions")
  .eq("id", "b23adcba-51ad-401c-a24f-6539bd7d9433")
  .maybeSingle();
console.log("Q", JSON.stringify(q, null, 2));

const { data: cases, error: ce } = await client
  .from("coding_test_cases")
  .select("id,name,is_hidden,input_json,expected_json")
  .eq("question_id", q.id);
console.log("cases", cases?.length, "err", ce?.message ?? null);
console.log(
  "visible",
  (cases ?? []).filter((c) => !c.is_hidden).map((c) => ({
    name: c.name,
    input: c.input_json,
    expected: c.expected_json,
  })),
);

const { count } = await client
  .from("coding_submissions")
  .select("id", { count: "exact", head: true })
  .eq("user_id", data.user.id)
  .eq("question_id", q.id);
console.log("prior submissions", count);

async function score(name, code, extra = {}) {
  const r = await fetch(`${url}/functions/v1/score-coding-submission`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      question_id: q.id,
      language: "javascript",
      code,
      ...extra,
    }),
  });
  const text = await r.text();
  console.log(name, r.status, text.slice(0, 500));
  return { status: r.status, text };
}

await score("H1-no-solve", "const x = 1;");
await score("H2-starter", q.starter_code ?? "function solve(input){return 0;}");
await score("H3-correct", "function solve(input){ return input[0] + input[1]; }");
await score("H4-sample", "function solve(input){ return input[0] + input[1]; }", {
  sample_only: true,
});
await score("H5-reset-resubmit", q.starter_code ?? "function solve(input){return 0;}");
await score("H6-empty", "   ");
await score("H7-arrow", "const solve = (input) => input[0] + input[1];");
