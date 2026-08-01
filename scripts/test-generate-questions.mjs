#!/usr/bin/env node
import fs from "node:fs";

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.qa.local") };
const base = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: env.QA_PRO_EMAIL,
    password: env.QA_PRO_PASSWORD,
  }),
});
const auth = await authRes.json();
if (!auth.access_token) {
  console.log(JSON.stringify({ ok: false, step: "auth", auth }));
  process.exit(1);
}

const t0 = Date.now();
const res = await fetch(`${base}/functions/v1/generate-questions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${auth.access_token}`,
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "behavioral",
    count: 2,
    role: "Engineer",
    free_session: true,
  }),
});
const text = await res.text();
console.log(
  JSON.stringify({
    status: res.status,
    ms: Date.now() - t0,
    body: text.slice(0, 500),
  }),
);
