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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}
function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: "fcd48a",
    runId: "prompt05-repro2",
    hypothesisId,
    location: "probe2",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync("debug-fcd48a.log", line + "\n");
  console.log(hypothesisId, message, JSON.stringify(data));
}

const local = { ...load(".env.local"), ...load(".env") };
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: authErr } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (authErr) throw authErr;
const tok = auth.session.access_token;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
  "x-idempotency-key": `probe-rzp2-${Date.now()}`,
};

// Valid product_type
const order = await fetch(`${url}/functions/v1/razorpay-create-order`, {
  method: "POST",
  headers,
  body: JSON.stringify({ product_type: "credits_50", idempotency_key: `probe-rzp2-${Date.now()}` }),
});
const orderText = await order.text();
log("BILL", "create-order credits_50", {
  status: order.status,
  body: orderText.slice(0, 500),
  hasLocalhost: /localhost|127\.0\.0\.1|7070|37857/i.test(orderText),
});

// Double-click simulation (same idempotency key)
const key = `probe-rzp-idem-${Date.now()}`;
const a = await fetch(`${url}/functions/v1/razorpay-create-order`, {
  method: "POST",
  headers: { ...headers, "x-idempotency-key": key },
  body: JSON.stringify({ product_type: "credits_50", idempotency_key: key }),
});
const aText = await a.text();
const b = await fetch(`${url}/functions/v1/razorpay-create-order`, {
  method: "POST",
  headers: { ...headers, "x-idempotency-key": key },
  body: JSON.stringify({ product_type: "credits_50", idempotency_key: key }),
});
const bText = await b.text();
let aId = null;
let bId = null;
try {
  aId = JSON.parse(aText).payment_order_id ?? JSON.parse(aText).order_id;
} catch {}
try {
  bId = JSON.parse(bText).payment_order_id ?? JSON.parse(bText).order_id;
} catch {}
log("BILL", "idempotent double create-order", {
  aStatus: a.status,
  bStatus: b.status,
  sameOrder: aId && bId ? aId === bId : null,
  aId,
  bId,
  aBody: aText.slice(0, 250),
  bBody: bText.slice(0, 250),
});

// sessions table
const { data: sess, error: sErr } = await client
  .from("sessions")
  .select("id,status,created_at")
  .eq("user_id", auth.user.id)
  .order("created_at", { ascending: false })
  .limit(1);
log("SES", "sessions table", {
  err: sErr?.message ?? null,
  found: Boolean(sess?.[0]?.id),
  id: sess?.[0]?.id ?? null,
});

// help articles columns
const { data: help, error: hErr } = await client
  .from("help_articles")
  .select("id,slug,title,question,published,is_published,status")
  .limit(5);
log("HELP", "help_articles sample", {
  err: hErr?.message ?? null,
  count: help?.length ?? 0,
  sample: (help ?? []).slice(0, 3),
});

const { data: freeHelp, error: fErr } = await client
  .from("help_articles")
  .select("id,slug,title,question,published,is_published")
  .or("title.ilike.%free plan%,question.ilike.%free plan%");
log("HELP", "free plan search", {
  err: fErr?.message ?? null,
  count: freeHelp?.length ?? 0,
  rows: freeHelp ?? [],
});
