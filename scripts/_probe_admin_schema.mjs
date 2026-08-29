import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const local = loadEnv(".env.local");
const qa = loadEnv(".env.qa.local");
const url = local.VITE_SUPABASE_URL || qa.QA_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY || local.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = local.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

const out = {};

const auth = await sb.auth.signInWithPassword({
  email: qa.QA_ADMIN_EMAIL,
  password: qa.QA_ADMIN_PASSWORD,
});
if (auth.error) throw new Error(auth.error.message);

// discover question columns via information_schema using service role RPC or rest
const colsQ = await admin.rpc("exec_sql", { query: "select 1" }).catch?.(() => null);
out.exec_sql = colsQ;

// Use OpenAPI or select * limit 1
const q1 = await sb.from("questions").select("*").limit(1);
out.questionKeys = q1.error ? q1.error.message : Object.keys(q1.data?.[0] || {});

const qt = await sb.from("question_translations").select("*").limit(1);
out.translationKeys = qt.error ? qt.error.message : Object.keys(qt.data?.[0] || {});

const help = await sb
  .from("help_articles")
  .select("id,slug,question,answer,body_md,published")
  .in("slug", ["gs-3", "gs-4", "bi-5"]);
out.helpFocus = (help.data || []).map((h) => ({
  slug: h.slug,
  published: h.published,
  q: h.question,
  answer: (h.answer || "").slice(0, 200),
  body: (h.body_md || "").slice(0, 200),
  hasWeird: /Ã.|â.|ï¿½|\\u00|textPayioad|pdfBase64/i.test(
    `${h.answer || ""}${h.body_md || ""}${h.question || ""}`,
  ),
}));

// free billing update with correct id type
const free = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
await free.auth.signInWithPassword({
  email: qa.QA_FREE_EMAIL,
  password: qa.QA_FREE_PASSWORD,
});
const bill = await free.from("billing_settings").select("id,referral_discount_percent");
out.freeBillingSelect = bill.error
  ? { error: bill.error.message }
  : { rows: bill.data };
const upd = await free
  .from("billing_settings")
  .update({ referral_discount_percent: 99 })
  .eq("id", 1)
  .select();
out.freeBillingUpdate = upd.error
  ? { blocked: true, message: upd.error.message }
  : { blocked: false, data: upd.data };

// try list questions without quality_score
const okSelect = await sb
  .from("questions")
  .select(
    "id, question_text, exam_type, topic, subject, difficulty, source, source_type, metadata, is_verified, is_public, created_at",
  )
  .eq("is_public", true)
  .eq("is_verified", false)
  .order("created_at", { ascending: false })
  .limit(5);
out.questionsWithoutQuality = okSelect.error
  ? { error: okSelect.error.message }
  : { count: okSelect.data.length };

// check quality-related columns
for (const col of [
  "quality_score",
  "quality_algorithm_version",
  "source_type",
  "is_verified",
  "is_public",
  "metadata",
]) {
  const r = await sb.from("questions").select(col).limit(1);
  out[`col_${col}`] = r.error ? r.error.message.slice(0, 100) : "ok";
}

// diagnostics endpoints used by UI
const { data: session } = await sb.auth.getSession();
const token = session.session?.access_token;
const edges = [
  "hybrid-orchestrate",
  "hybrid-health",
  "ai-health",
  "gov-exam-health",
  "process-paper",
];
out.edges = {};
for (const ep of edges) {
  try {
    const r = await fetch(`${url}/functions/v1/${ep}`, {
      method: ep.includes("orchestrate") ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: ep.includes("orchestrate")
        ? JSON.stringify({ operation: "health" })
        : undefined,
      signal: AbortSignal.timeout(20000),
    });
    out.edges[ep] = { status: r.status, body: (await r.text()).slice(0, 400) };
  } catch (e) {
    out.edges[ep] = { error: String(e.message || e) };
  }
}

writeFileSync("_probe_admin_schema_out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
