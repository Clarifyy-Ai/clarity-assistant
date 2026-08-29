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

const local = { ...load(".env.local"), ...load(".env") };
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
console.log("auth", error?.message || "ok");
const tok = data?.session?.access_token;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

for (const fn of ["hybrid-health", "ai-key-check", "ping"]) {
  const r = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers,
    body: "{}",
  });
  console.log(fn, r.status, (await r.text()).slice(0, 500));
}

// Correct prep-tool body
{
  const r = await fetch(`${url}/functions/v1/prep-tool`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tool_id: "rephrase",
      input: "I led a team of five engineers delivering a payments API.",
    }),
  });
  console.log("prep-tool", r.status, (await r.text()).slice(0, 400));
}
