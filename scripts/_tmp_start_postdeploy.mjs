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
async function call(body) {
  const r = await fetch(`${base}/functions/v1/start-session`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${s.access_token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `postdeploy-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return { status: r.status, code: j.code, id: j.session_id, reused: j.reused, error: j.error };
}
console.log("mock coding", await call({ session_type: "mock", type: "mock", is_practice: true, interview_type: "coding" }));
console.log("rehearsal product", await call({ session_type: "rehearsal", type: "rehearsal", is_practice: true, interview_type: "product", duration_minutes: 15 }));
