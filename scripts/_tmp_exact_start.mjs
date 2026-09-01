import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file) {
  const p = path.join(ROOT, file);
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
    )
      v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const base = local.VITE_SUPABASE_URL.replace(/\/$/, "");
const anon = local.VITE_SUPABASE_ANON_KEY;

const sign = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: qa.QA_PRO_EMAIL, password: qa.QA_PRO_PASSWORD }),
});
const s = await sign.json();
if (!s.access_token) {
  console.log("signin failed", sign.status);
  process.exit(1);
}

async function call(label, body, extra = {}) {
  const r = await fetch(`${base}/functions/v1/start-session`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${s.access_token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": extra.idem || `exact-${label}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  console.log(
    label,
    r.status,
    json.code || json.session_id,
    "reused=" + json.reused,
    json.error || "",
  );
  if (r.status >= 400) console.log("  body", JSON.stringify(json).slice(0, 500));
}

const resumeId = "8b1df310-7f8d-4bf8-985d-adbac3d12e3e";
const jdId = "b6c7920a-dd8f-41d4-9e85-81447c7590b2";

await call("practice-coach-exact", {
  session_type: "rehearsal",
  type: "rehearsal",
  is_practice: true,
  interview_type: "behavioral",
  company: null,
  role: "Software Engineer",
  resume_id: resumeId,
  jd_id: jdId,
  model: "gpt-4o",
  duration_minutes: 30,
  session_call_type: "interview",
});

await call("mock-wizard", {
  session_type: "mock",
  type: "mock",
  is_practice: true,
  resume_id: resumeId,
  jd_id: jdId,
  model: "gpt-4o",
});

await call("practice-coach-hint-style", {
  session_type: "rehearsal",
  type: "rehearsal",
  is_practice: true,
  interview_type: "behavioral",
  role: "Software Engineer",
  resume_id: resumeId,
  jd_id: jdId,
  model: "gpt-4o",
  duration_minutes: 30,
  session_call_type: "interview",
  hint_style: "short_hints",
});
