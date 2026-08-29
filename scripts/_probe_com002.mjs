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
const userId = data.user.id;

const title = `TC-COM-002 probe ${Date.now()}`;
const { data: post, error: pErr } = await client
  .from("community_posts")
  .insert({
    user_id: userId,
    title,
    body: "Probe body for create-post persistence.",
    category: "Interview",
    tags: ["probe"],
    status: "PUBLISHED",
  })
  .select("id,title,status")
  .maybeSingle();
console.log("create post", post, pErr?.message ?? null);

if (post?.id) {
  const { data: answer, error: aErr } = await client
    .from("community_answers")
    .insert({
      post_id: post.id,
      user_id: userId,
      body: "Probe answer / reply.",
    })
    .select("id")
    .maybeSingle();
  console.log("create answer", answer, aErr?.message ?? null);

  const { data: report, error: rErr } = await client
    .from("community_reports")
    .insert({
      reporter_id: userId,
      target_type: "post",
      target_id: post.id,
      reason: "Probe report for TC-COM-003",
    })
    .select("id,status")
    .maybeSingle();
  console.log("create report", report, rErr?.message ?? null);

  const { data: listed } = await client
    .from("community_posts")
    .select("id,title,status")
    .eq("id", post.id)
    .maybeSingle();
  console.log("listed after create", listed);
}
