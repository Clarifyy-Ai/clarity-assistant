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

function log(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId: "fcd48a",
    runId: "prompt05-repro",
    hypothesisId,
    location,
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
const userId = auth.user.id;
const tok = auth.session.access_token;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

// --- DOC: empty MIME job create (legacy row simulation) ---
const fakePath = `${userId}/library/probe-empty-mime.pdf`;
const { data: libRow, error: libInsErr } = await client
  .from("personal_library_documents")
  .insert({
    owner_id: userId,
    uploaded_by: userId,
    document_name: "probe-empty-mime.pdf",
    mime_type: "",
    storage_path: fakePath,
    source: "upload",
    content_rights: "USER_OWNED",
    rights_confirmed: true,
    content_hash: `probe${Date.now()}`,
    file_size_bytes: 1024,
    file_category: "library",
    processing_status: "uploaded",
  })
  .select("id,mime_type")
  .maybeSingle();

log("DOC-MIME", "probe:lib-insert", "empty mime insert", {
  ok: Boolean(libRow?.id),
  err: libInsErr?.message ?? null,
  mime: libRow?.mime_type ?? null,
});

if (libRow?.id) {
  const r = await fetch(`${url}/functions/v1/create-document-processing-job`, {
    method: "POST",
    headers: { ...headers, "x-idempotency-key": `probe-doc-${Date.now()}` },
    body: JSON.stringify({
      documentId: libRow.id,
      idempotencyKey: `probe-doc-key-${Date.now()}${Math.random().toString(36).slice(2)}`,
    }),
  });
  const text = await r.text();
  log("DOC-MIME", "probe:create-job", "job create with empty mime", {
    status: r.status,
    body: text.slice(0, 400),
  });
  await client.from("personal_library_documents").delete().eq("id", libRow.id);
}

// --- SCHEDULER: create interview (expect not 501) ---
const { data: iv, error: ivErr } = await client
  .from("scheduled_interviews")
  .insert({
    user_id: userId,
    company_name: "Acme Probe Labs",
    role_title: "Software Engineer",
    stage: "phone_screen",
    priority: "medium",
    is_remote: true,
    status: "scheduled",
  })
  .select("id,company_name,status")
  .maybeSingle();
log("SCH-CREATE", "probe:interview-insert", "create interview row", {
  ok: Boolean(iv?.id),
  err: ivErr?.message ?? null,
  status: iv?.status ?? null,
});

if (iv?.id) {
  const future = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const { data: round, error: rErr } = await client
    .from("interview_rounds")
    .insert({
      scheduled_interview_id: iv.id,
      round_number: 1,
      round_label: "Round 1 — Phone Screen",
      interview_type: "phone_screen",
      scheduled_at: future,
      duration_minutes: 45,
      platform: "zoom",
      status: "scheduled",
    })
    .select("id")
    .maybeSingle();
  log("SCH-CREATE", "probe:round-insert", "attach round", {
    ok: Boolean(round?.id),
    err: rErr?.message ?? null,
  });

  const sync = await fetch(`${url}/functions/v1/sync-calendar`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const syncText = await sync.text();
  log("SCH-CAL", "probe:sync-calendar", "calendar sync status", {
    status: sync.status,
    body: syncText.slice(0, 300),
  });

  // cancel
  await client.from("scheduled_interviews").update({ status: "cancelled" }).eq("id", iv.id);
  const { data: cancelled } = await client
    .from("scheduled_interviews")
    .select("id,status")
    .eq("id", iv.id)
    .maybeSingle();
  log("SCH-CANCEL", "probe:cancel", "cancelled persists", {
    status: cancelled?.status ?? null,
  });
}

// --- BILLING: create-order probe (expect auth/product validation, not localhost) ---
const order = await fetch(`${url}/functions/v1/razorpay-create-order`, {
  method: "POST",
  headers: { ...headers, "x-idempotency-key": `probe-rzp-${Date.now()}` },
  body: JSON.stringify({ product_type: "credits_10" }),
});
const orderText = await order.text();
log("BILL", "probe:create-order", "razorpay create-order", {
  status: order.status,
  body: orderText.slice(0, 400),
  hasLocalhost: /localhost|127\.0\.0\.1|7070|37857/i.test(orderText),
});

// --- SESSIONS: list one and fetch by id ---
const { data: sessions } = await client
  .from("interview_sessions")
  .select("id,status,session_type,created_at")
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .limit(1);
const sid = sessions?.[0]?.id;
log("SES", "probe:list-session", "latest session", {
  found: Boolean(sid),
  id: sid ?? null,
  status: sessions?.[0]?.status ?? null,
});
if (sid) {
  const { data: detail, error: dErr } = await client
    .from("interview_sessions")
    .select("id,status,overall_score,duration_seconds")
    .eq("id", sid)
    .eq("user_id", userId)
    .maybeSingle();
  log("SES", "probe:get-session", "detail by id+owner", {
    ok: Boolean(detail?.id),
    err: dErr?.message ?? null,
  });
}

// --- HELP: free plan duplicates ---
const { data: helpRows } = await client
  .from("help_articles")
  .select("id,slug,question,is_published")
  .ilike("question", "%free plan%");
log("HELP", "probe:help-dupes", "free plan articles", {
  count: helpRows?.length ?? 0,
  published: (helpRows ?? []).filter((r) => r.is_published).length,
  rows: (helpRows ?? []).map((r) => ({ slug: r.slug, published: r.is_published })),
});

console.log("DONE");
