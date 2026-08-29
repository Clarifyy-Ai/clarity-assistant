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
  .select("id,starter_code")
  .eq("id", "b23adcba-51ad-401c-a24f-6539bd7d9433")
  .maybeSingle();

async function score(name, code) {
  const r = await fetch(`${url}/functions/v1/score-coding-submission`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      question_id: q.id,
      language: "javascript",
      code,
    }),
  });
  const text = await r.text();
  console.log(name, r.status, text.slice(0, 350));
}

// TC-COD-004 lifecycle: invalid → reset template → correct-ish
await score("V1-no-solve", "const x = 1;");
await score("V2-starter", q.starter_code);
await score(
  "V3-sum-all",
  "function solve(input){ return (input||[]).reduce((a,b)=>a+b,0); }",
);
await score("V4-again", q.starter_code);
await score("V5-burst", "function solve(input){ return 0; }");
await score("V6-burst", "function solve(input){ return 0; }");
await score("V7-burst", "function solve(input){ return 0; }");
await score("V8-burst", "function solve(input){ return 0; }");

const title = `TC-COM post-fix ${Date.now()}`;
const { data: post, error: pErr } = await client
  .from("community_posts")
  .insert({
    user_id: data.user.id,
    title,
    body: "Post-fix create persistence.",
    category: "Interview",
    tags: ["verify"],
    status: "PUBLISHED",
  })
  .select("id")
  .maybeSingle();
console.log("COM create", Boolean(post?.id), pErr?.message ?? null);
if (post?.id) {
  const { data: ans, error: aErr } = await client
    .from("community_answers")
    .insert({ post_id: post.id, user_id: data.user.id, body: "Reply verify" })
    .select("id")
    .maybeSingle();
  console.log("COM reply", Boolean(ans?.id), aErr?.message ?? null);
  const { data: rep, error: rErr } = await client
    .from("community_reports")
    .insert({
      reporter_id: data.user.id,
      target_type: "post",
      target_id: post.id,
      reason: "Post-fix report",
    })
    .select("id")
    .maybeSingle();
  console.log("COM report", Boolean(rep?.id), rErr?.message ?? null);
}
