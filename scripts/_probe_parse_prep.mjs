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

const local = load(".env.local");
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

const probes = [
  ["parse-document", { document_id: "00000000-0000-0000-0000-000000000000" }],
  ["parse-resume", { resume_id: "00000000-0000-0000-0000-000000000000" }],
  ["prep-tool", { tool: "rephrase", text: "I led a team of five engineers." }],
  ["ping", {}],
];

for (const [fn, body] of probes) {
  const t0 = Date.now();
  const r = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(
    JSON.stringify({
      fn,
      status: r.status,
      ms: Date.now() - t0,
      body: text.slice(0, 280),
    }),
  );
}
