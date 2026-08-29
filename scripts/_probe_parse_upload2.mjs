import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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
if (error) throw error;
const userId = data.user.id;
const tok = data.session.access_token;

const resumeId = randomUUID();
const path = `${userId}/${resumeId}.txt`;
const text = `Jane Doe
Senior Backend Engineer
Skills: TypeScript, Node.js, PostgreSQL, AWS
Experience:
Acme Corp — Backend Engineer (2020-2024)
Built payment APIs and reduced latency 40%.
Education:
MIT — BS Computer Science
`;
const up = await client.storage.from("documents").upload(path, new Blob([text], { type: "text/plain" }), {
  contentType: "text/plain",
  upsert: true,
});
console.log("upload", up.error?.message || "ok", path);

const { error: insErr } = await client.from("resumes").insert({
  id: resumeId,
  user_id: userId,
  name: "probe-txt",
  file_path: path,
  url: path,
  is_primary: false,
});
console.log("resume insert", insErr?.message || "ok", resumeId);

const r = await fetch(`${url}/functions/v1/parse-resume`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tok}`,
    apikey: anon,
    "Content-Type": "application/json",
    "x-idempotency-key": `probe-txt-${resumeId}`,
  },
  body: JSON.stringify({
    resume_id: resumeId,
    file_path: path,
    mime_type: "text/plain",
  }),
});
console.log("parse-resume-txt", r.status, (await r.text()).slice(0, 800));

// prep-tool again with detail
const p = await fetch(`${url}/functions/v1/prep-tool`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tok}`,
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tool_id: "rephrase",
    input: "I led a team of five engineers delivering a payments API under tight deadlines.",
  }),
});
console.log("prep-tool", p.status, (await p.text()).slice(0, 500));
console.log("credits", (await client.from("profiles").select("credits").eq("id", userId).single()).data);
