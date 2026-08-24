/**
 * Release verification probe — runtime evidence for fix sweep.
 */
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
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const results = [];

function note(id, status, detail) {
  results.push({ id, status, detail });
}

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: proSess } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
const proToken = proSess.session?.access_token;
const headers = {
  Authorization: `Bearer ${proToken}`,
  apikey: anon,
  "Content-Type": "application/json",
};

// GOV search
const se = await fetch(`${url}/functions/v1/search-exams?q=SSC%20CGL`, { headers });
const seBody = await se.json();
note(
  "GOV-001",
  se.status === 200 && (seBody.results?.length ?? 0) > 0 ? "FIXED" : "NOT_FIXED",
  `http=${se.status} count=${seBody.results?.length ?? 0}`,
);

// Availability
const exam = seBody.results?.[0];
const stageId = exam?.stages?.[0]?.id;
const av = await fetch(`${url}/functions/v1/check-exam-paper-availability`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    examId: exam.examId,
    stageId,
    mode: "custom_mock",
    questionCount: 10,
    language: "en",
  }),
});
const avBody = await av.json();
note(
  "GOV-002-preflight",
  av.status === 200 && avBody.blocked !== true ? "FIXED" : "NOT_FIXED",
  `http=${av.status} available=${avBody.available} blocked=${avBody.blocked}`,
);

// Hybrid health (admin)
await client.auth.signOut();
const { data: adminSess } = await client.auth.signInWithPassword({
  email: qa.QA_ADMIN_EMAIL,
  password: qa.QA_ADMIN_PASSWORD,
});
const adminToken = adminSess.session?.access_token;
const hh = await fetch(`${url}/functions/v1/hybrid-health`, {
  headers: { Authorization: `Bearer ${adminToken}`, apikey: anon },
});
const hhBody = await hh.json();
const hmacOk = hhBody?.python?.hmac_ok;
const hmacStatus = hhBody?.python?.signed_internal?.status;
note(
  "PY-HMAC",
  hmacOk === true ? "FIXED" : hmacOk === false ? "NOT_FIXED" : "PARTIALLY_FIXED",
  `hmac_ok=${hmacOk} signed_status=${hmacStatus} python_status=${hhBody?.python?.status}`,
);

// Signed probe from local
const secret = local.DOCUMENT_INTELLIGENCE_AUTH_SECRET;
const base = (local.VITE_SCRAPER_URL || "").replace(/\/$/, "");
if (secret && base) {
  const crypto = await import("node:crypto");
  const method = "GET";
  const path = "/internal/gov-exams/health";
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `verify-${crypto.randomBytes(6).toString("hex")}`;
  const digest = crypto.createHash("sha256").update("").digest("hex");
  const msg = [method, path, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      "X-Internal-Timestamp": ts,
      "X-Request-ID": rid,
      "X-Internal-Signature": `sha256=${sig}`,
    },
  });
  note(
    "RENDER-HMAC-LOCAL",
    r.status === 200 ? "FIXED" : "NOT_FIXED",
    `http=${r.status} body=${(await r.text()).slice(0, 120)}`,
  );
} else {
  note("RENDER-HMAC-LOCAL", "BLOCKED", "missing secret or scraper url locally");
}

await client.auth.signOut();
console.log(JSON.stringify({ results }, null, 2));
process.exit(results.some((r) => r.status === "NOT_FIXED" && r.id === "PY-HMAC") ? 2 : 0);
