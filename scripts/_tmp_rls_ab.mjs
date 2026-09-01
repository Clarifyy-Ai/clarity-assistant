import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const qa = load(".env.qa.local");
const local = load(".env.local");
const supabaseUrl = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const emailA = qa.QA_USER_A_EMAIL;
const passA = qa.QA_USER_A_PASSWORD;
const emailB = qa.QA_USER_B_EMAIL;
const passB = qa.QA_USER_B_PASSWORD;

async function signIn(email, password) {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  return { status: r.status, userId: j.user?.id || null, token: j.access_token || null, error: j.error_description || j.msg };
}

async function rest(token, table, query) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await r.text();
  return { status: r.status, text: text.slice(0, 300) };
}

const a = await signIn(emailA, passA);
const b = await signIn(emailB, passB);
console.log(JSON.stringify({
  a: { status: a.status, userId: a.userId, err: a.error || null },
  b: { status: b.status, userId: b.userId, err: b.error || null },
}));
if (!a.token || !b.token) process.exit(2);

const aDocs = await rest(a.token, "documents", "select=id,user_id&limit=5");
const bStealDocs = await rest(b.token, "documents", `select=id,user_id&user_id=eq.${a.userId}`);
const aJobs = await rest(a.token, "gov_paper_generation_jobs", "select=id,user_id&limit=5");
const bStealJobs = await rest(b.token, "gov_paper_generation_jobs", `select=id,user_id&user_id=eq.${a.userId}`);
const aSessions = await rest(a.token, "sessions", "select=id,user_id&limit=5");
const bStealSessions = await rest(b.token, "sessions", `select=id,user_id&user_id=eq.${a.userId}`);
const aCredits = await rest(a.token, "credit_transactions", "select=id,user_id&limit=5");
const bStealCredits = await rest(b.token, "credit_transactions", `select=id,user_id&user_id=eq.${a.userId}`);

function count(text) {
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j.length : -1;
  } catch {
    return -2;
  }
}

console.log(JSON.stringify({
  aDocs: { status: aDocs.status, n: count(aDocs.text) },
  bStealDocs: { status: bStealDocs.status, n: count(bStealDocs.text), sample: bStealDocs.text.slice(0, 80) },
  aJobs: { status: aJobs.status, n: count(aJobs.text) },
  bStealJobs: { status: bStealJobs.status, n: count(bStealJobs.text), sample: bStealJobs.text.slice(0, 80) },
  aSessions: { status: aSessions.status, n: count(aSessions.text) },
  bStealSessions: { status: bStealSessions.status, n: count(bStealSessions.text) },
  aCredits: { status: aCredits.status, n: count(aCredits.text) },
  bStealCredits: { status: bStealCredits.status, n: count(bStealCredits.text), sample: bStealCredits.text.slice(0, 80) },
}));

const leak =
  count(bStealDocs.text) > 0 ||
  count(bStealJobs.text) > 0 ||
  count(bStealSessions.text) > 0 ||
  count(bStealCredits.text) > 0;
process.exit(leak ? 5 : 0);
