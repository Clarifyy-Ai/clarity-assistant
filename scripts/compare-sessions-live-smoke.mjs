/**
 * Live smoke for compare-sessions. Prints status/codes only (no tokens).
 * Usage: node --use-system-ca scripts/compare-sessions-live-smoke.mjs
 */
import { existsSync, readFileSync } from "node:fs";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, idx).trim()] = value;
  }
  return out;
}

const env = {
  ...loadEnv(".env"),
  ...loadEnv(".env.local"),
  ...loadEnv(".env.qa.local"),
};

const base = (env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || "").replace(/\/$/, "");
const anon =
  env.VITE_SUPABASE_ANON_KEY ||
  env.QA_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = env.QA_PRO_EMAIL;
const password = env.QA_PRO_PASSWORD;
const emailB = env.QA_USER_B_EMAIL;
const passwordB = env.QA_USER_B_PASSWORD;

if (!base || !anon || !email || !password) {
  console.log(
    JSON.stringify({
      ok: false,
      reason: "missing_qa_env",
      hasBase: Boolean(base),
      hasAnon: Boolean(anon),
      hasPro: Boolean(email && password),
    }),
  );
  process.exit(2);
}

async function signIn(e, p) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: e, password: p }),
  });
  const body = await res.json();
  return {
    status: res.status,
    access: body.access_token,
    error: body.error_description || body.msg || body.error || null,
  };
}

async function compare(token, payload) {
  const res = await fetch(`${base}/functions/v1/compare-sessions`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 240) };
  }
  return {
    status: res.status,
    code: json.code ?? null,
    error: json.error ?? null,
    source_version: json.source_version ?? null,
    baseline_rule: json.baseline_rule ?? null,
    hasPgrst: /PGRST|session_questions/i.test(text),
  };
}

const a = await signIn(email, password);
if (!a.access) {
  console.log(JSON.stringify({ ok: false, reason: "pro_login_failed", status: a.status, error: a.error }));
  process.exit(3);
}

const ids = [
  "0cf49c48-4a1b-420e-8b78-e4b2d9bf9c9b",
  "d6aedf64-5b81-48d0-ae94-be3c25b30625",
];
const incomplete = "500e2382-2a55-4d4d-896f-0b33339b14c2";

const unauth = await fetch(`${base}/functions/v1/compare-sessions`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ session_a_id: ids[0], session_b_id: ids[1] }),
});
const unauthBody = await unauth.text();

const completed = await compare(a.access, {
  session_a_id: ids[0],
  session_b_id: ids[1],
  timezone: "Asia/Kolkata",
});
const notCompleted = await compare(a.access, {
  session_a_id: ids[0],
  session_b_id: incomplete,
  timezone: "Asia/Kolkata",
});
const duplicate = await compare(a.access, {
  session_a_id: ids[0],
  session_b_id: ids[0],
});

let isolation = null;
if (emailB && passwordB) {
  const b = await signIn(emailB, passwordB);
  isolation = b.access
    ? await compare(b.access, { session_a_id: ids[0], session_b_id: ids[1] })
    : { status: b.status, error: b.error, skipped: "user_b_login_failed" };
}

console.log(
  JSON.stringify(
    {
      ok: true,
      unauth: {
        status: unauth.status,
        hasPgrst: /PGRST|session_questions/i.test(unauthBody),
      },
      completed,
      notCompleted,
      duplicate,
      isolation,
    },
    null,
    2,
  ),
);
