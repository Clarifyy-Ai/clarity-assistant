/**
 * Live smoke for session start eligibility / end / restore.
 * Prints status/codes only (no tokens).
 * Usage: node --use-system-ca scripts/session-lifecycle-live-smoke.mjs
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
const freeEmail = env.QA_FREE_EMAIL;
const freePassword = env.QA_FREE_PASSWORD;
const proEmail = env.QA_PRO_EMAIL;
const proPassword = env.QA_PRO_PASSWORD;
const emailB = env.QA_USER_B_EMAIL;
const passwordB = env.QA_USER_B_PASSWORD;

function originHeaders(extra = {}) {
  return {
    apikey: anon,
    "Content-Type": "application/json",
    Origin: "https://clarityapp.ai",
    ...extra,
  };
}

async function signIn(email, password) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: originHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return {
    status: res.status,
    access: body.access_token,
    userId: body.user?.id,
    error: body.error_description || body.msg || body.error || null,
  };
}

async function call(fn, token, payload, extraHeaders = {}) {
  const res = await fetch(`${base}/functions/v1/${fn}`, {
    method: "POST",
    headers: originHeaders({
      Authorization: token ? `Bearer ${token}` : `Bearer ${anon}`,
      ...extraHeaders,
    }),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return {
    status: res.status,
    code: json?.code || json?.reason || null,
    allowed: json?.allowed,
    reused: json?.reused,
    session_id: json?.session_id ? "present" : null,
    already_terminal: json?.already_terminal ?? null,
    duration_seconds: json?.duration_seconds ?? null,
    found: json?.found,
    cors: res.headers.get("access-control-allow-origin"),
    used: json?.used ?? null,
    limit: json?.limit ?? null,
    hasReset: Boolean(json?.reset_at),
  };
}

if (!base || !anon) {
  console.log(JSON.stringify({ ok: false, reason: "missing_qa_env" }));
  process.exit(2);
}

const results = {};

const options = await fetch(`${base}/functions/v1/start-session`, {
  method: "OPTIONS",
  headers: {
    Origin: "https://clarityapp.ai",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type,apikey",
  },
});
results.options = {
  status: options.status,
  cors: options.headers.get("access-control-allow-origin"),
};

const unapproved = await fetch(`${base}/functions/v1/start-session`, {
  method: "POST",
  headers: {
    apikey: anon,
    "Content-Type": "application/json",
    Origin: "https://evil.example",
  },
  body: JSON.stringify({ action: "eligibility" }),
});
results.unapproved_origin = {
  status: unapproved.status,
  cors: unapproved.headers.get("access-control-allow-origin"),
};

results.missing_jwt = await call("start-session", null, { action: "eligibility" });

const freeAuth = freeEmail && freePassword ? await signIn(freeEmail, freePassword) : null;
const proAuth = proEmail && proPassword ? await signIn(proEmail, proPassword) : null;
const bAuth = emailB && passwordB ? await signIn(emailB, passwordB) : null;

results.auth = {
  free: freeAuth ? { status: freeAuth.status, hasToken: Boolean(freeAuth.access) } : "skipped",
  pro: proAuth ? { status: proAuth.status, hasToken: Boolean(proAuth.access) } : "skipped",
  userB: bAuth ? { status: bAuth.status, hasToken: Boolean(bAuth.access) } : "skipped",
};

if (proAuth?.access) {
  results.pro_eligibility = await call("start-session", proAuth.access, { action: "eligibility" });
  const startA = await call("start-session", proAuth.access, {
    action: "start",
    session_type: "mock",
    type: "mock",
    duration_minutes: 5,
    question_count: 5,
  }, { "Idempotency-Key": "smoke-start-1" });
  results.pro_start = startA;
  const startDup = await call("start-session", proAuth.access, {
    action: "start",
    session_type: "mock",
    type: "mock",
    duration_minutes: 5,
    question_count: 5,
  }, { "Idempotency-Key": "smoke-start-1" });
  results.pro_duplicate_start = startDup;
  results.pro_restore = await call("start-session", proAuth.access, {
    action: "restore",
    session_type: "mock",
    type: "mock",
  });
  if (startA.session_id === "present") {
    const end1 = await fetch(`${base}/functions/v1/end-session`, {
      method: "POST",
      headers: originHeaders({ Authorization: `Bearer ${proAuth.access}` }),
      body: JSON.stringify({
        session_id: (await (await fetch(`${base}/rest/v1/sessions?select=id&order=created_at.desc&limit=1`, {
          headers: { apikey: anon, Authorization: `Bearer ${proAuth.access}` },
        })).json())[0]?.id,
        terminal_reason: "USER_ENDED",
      }),
    });
    const endJson = await end1.json();
    results.pro_end = {
      status: end1.status,
      code: endJson.code || null,
      already_terminal: endJson.already_terminal ?? null,
      duration_seconds: endJson.duration_seconds ?? null,
      terminal_reason: endJson.terminal_reason || null,
    };
    const end2 = await fetch(`${base}/functions/v1/end-session`, {
      method: "POST",
      headers: originHeaders({ Authorization: `Bearer ${proAuth.access}` }),
      body: JSON.stringify({
        session_id: endJson.session_id,
        terminal_reason: "USER_ENDED",
      }),
    });
    const endJson2 = await end2.json();
    results.pro_duplicate_end = {
      status: end2.status,
      already_terminal: endJson2.already_terminal ?? null,
      terminal_reason: endJson2.terminal_reason || null,
    };

    if (bAuth?.access && endJson.session_id) {
      const cross = await fetch(`${base}/functions/v1/end-session`, {
        method: "POST",
        headers: originHeaders({ Authorization: `Bearer ${bAuth.access}` }),
        body: JSON.stringify({
          session_id: endJson.session_id,
          terminal_reason: "USER_ENDED",
        }),
      });
      const crossJson = await cross.json();
      results.user_b_cannot_end_user_a = {
        status: cross.status,
        code: crossJson.code || null,
      };
    }
  }
}

if (freeAuth?.access) {
  results.free_eligibility = await call("start-session", freeAuth.access, { action: "eligibility" });
  if (results.free_eligibility.code === "DAILY_LIMIT_REACHED" || results.free_eligibility.used >= 3) {
    results.free_start_at_limit = await call("start-session", freeAuth.access, {
      action: "start",
      session_type: "warmup",
      type: "warmup",
      duration_minutes: 5,
      question_count: 5,
    });
  }
}

const ok =
  results.options.status &&
  results.options.status < 400 &&
  results.missing_jwt.status === 401 &&
  (!results.pro_start || results.pro_start.status !== 502) &&
  (!results.free_eligibility || results.free_eligibility.status !== 502);

console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
