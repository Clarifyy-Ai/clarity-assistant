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
  fs.appendFileSync(
    "debug-fcd48a.log",
    JSON.stringify({
      sessionId: "fcd48a",
      runId: "prompt05-proceed",
      hypothesisId,
      location: "probe-resume",
      message,
      data,
      timestamp: Date.now(),
    }) + "\n",
  );
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
};

const { data: resumes, error: rErr } = await client
  .from("resumes")
  .select("id,name,file_path,content,content_hash")
  .eq("user_id", auth.user.id)
  .order("created_at", { ascending: false })
  .limit(3);
log("DOC-RESUME", "list resumes", {
  err: rErr?.message ?? null,
  count: resumes?.length ?? 0,
  rows: (resumes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    path: r.file_path,
    hasContent: Boolean(r.content),
  })),
});

const target = (resumes ?? []).find((r) => r.file_path);
if (target) {
  const ext = String(target.file_path).split(".").pop()?.toLowerCase();
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
  const res = await fetch(`${url}/functions/v1/parse-resume`, {
    method: "POST",
    headers: {
      ...headers,
      "x-idempotency-key": `probe-resume-${Date.now()}`,
    },
    body: JSON.stringify({
      resume_id: target.id,
      file_path: target.file_path,
      mime_type: mime,
    }),
  });
  const text = await res.text();
  log("DOC-RESUME", "parse-resume call", {
    status: res.status,
    body: text.slice(0, 500),
  });
} else {
  log("DOC-RESUME", "no resume with file_path", {});
}

// Session detail path used by UI
const { data: sess } = await client
  .from("sessions")
  .select("id,status,title,overall_score")
  .eq("user_id", auth.user.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
log("SES", "latest session for eye navigation", {
  id: sess?.id ?? null,
  status: sess?.status ?? null,
  detailPath: sess?.id ? `/app/sessions/${sess.id}` : null,
});
