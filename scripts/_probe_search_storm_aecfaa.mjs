/**
 * Storm search-exams to try to reproduce 503 / RATE_LIMIT* (TC-GOV-002).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const LOG = path.resolve("debug-aecfaa.log");

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

function log(message, data) {
  const line = JSON.stringify({
    sessionId: "aecfaa",
    runId: "probe-storm",
    hypothesisId: "H-GOV-RL",
    location: "scripts/_probe_search_storm_aecfaa.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const client = createClient(local.VITE_SUPABASE_URL, local.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (error) {
  log("auth_fail", { error: error.message });
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${data.session.access_token}`,
  apikey: local.VITE_SUPABASE_ANON_KEY,
  "Content-Type": "application/json",
};
const url = `${local.VITE_SUPABASE_URL}/functions/v1/search-exams`;

// 40 near-simultaneous requests (typeahead storm + network retries)
const N = 40;
const started = Date.now();
const settled = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const q = ["SSC", "UPSC", "APPSC", "IBPS", "RRB"][i % 5] + (i > 20 ? ` ${i}` : "");
    const t0 = Date.now();
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ q, page: 1, pageSize: 20 }),
      });
      const text = await r.text();
      let code = null;
      try {
        code = JSON.parse(text)?.code ?? null;
      } catch {
        /* ignore */
      }
      return { i, q, status: r.status, ms: Date.now() - t0, code };
    } catch (e) {
      return {
        i,
        q,
        status: 0,
        ms: Date.now() - t0,
        code: "FETCH_ERR",
        err: e instanceof Error ? e.message : String(e),
      };
    }
  }),
);

const byStatus = {};
for (const row of settled) {
  byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
}
const fails = settled.filter((r) => r.status !== 200);
log("storm_summary", {
  totalMs: Date.now() - started,
  n: N,
  byStatus,
  failSample: fails.slice(0, 8),
});
