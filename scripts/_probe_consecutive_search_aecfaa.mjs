/**
 * Runtime probe: consecutive search-exams calls (TC-GOV-002).
 * Writes NDJSON evidence to debug-aecfaa.log
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const LOG = path.resolve("debug-aecfaa.log");
const SESSION = "aecfaa";

function load(p) {
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
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: SESSION,
    runId: "probe-consecutive",
    hypothesisId,
    location: "scripts/_probe_consecutive_search_aecfaa.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;

if (!url || !anon || !qa.QA_PRO_EMAIL) {
  log("H-ENV", "missing_env", { url: !!url, anon: !!anon, email: !!qa.QA_PRO_EMAIL });
  process.exit(1);
}

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (error) {
  log("H-ENV", "auth_fail", { error: error.message });
  process.exit(1);
}

const tok = data.session.access_token;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

const queries = ["SSC CGL", "APPSC GROUP2", "UPSC", "IBPS", "RRB"];
const results = [];

for (const q of queries) {
  const t0 = Date.now();
  const r = await fetch(`${url}/functions/v1/search-exams`, {
    method: "POST",
    headers,
    body: JSON.stringify({ q, page: 1, pageSize: 20 }),
  });
  const text = await r.text();
  let code = null;
  let success = null;
  let count = null;
  try {
    const j = JSON.parse(text);
    code = j.code ?? null;
    success = j.success;
    count = j.count ?? j.results?.length ?? null;
  } catch {
    /* ignore */
  }
  const row = {
    q,
    status: r.status,
    ms: Date.now() - t0,
    code,
    success,
    count,
  };
  results.push(row);
  log("H-GOV-RL", "search_call", row);
}

// Rapid-fire (no await between starts) to mimic back-to-back typeahead
const rapidQs = ["APPSC", "UPSC", "SSC"];
const rapidStarted = Date.now();
const rapid = await Promise.all(
  rapidQs.map(async (q) => {
    const t0 = Date.now();
    const r = await fetch(`${url}/functions/v1/search-exams`, {
      method: "POST",
      headers,
      body: JSON.stringify({ q, page: 1, pageSize: 20 }),
    });
    const text = await r.text();
    let code = null;
    let success = null;
    try {
      const j = JSON.parse(text);
      code = j.code ?? null;
      success = j.success;
    } catch {
      /* ignore */
    }
    return { q, status: r.status, ms: Date.now() - t0, code, success };
  }),
);
log("H-GOV-RL", "rapid_parallel_search", {
  totalMs: Date.now() - rapidStarted,
  results: rapid,
});

log("H-GOV-RL", "summary", {
  sequentialFail: results.filter((r) => r.status >= 400).length,
  sequentialOk: results.filter((r) => r.status === 200).length,
  rapidFail: rapid.filter((r) => r.status >= 400).length,
});
