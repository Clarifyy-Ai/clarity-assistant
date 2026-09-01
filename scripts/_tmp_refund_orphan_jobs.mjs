import fs from "node:fs";

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

const env = { ...load(".env.local"), ...load(".env.qa.local") };
const base = (env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || "").replace(/\/$/, "");
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = env.QA_PRO_EMAIL || env.QA_MAX_EMAIL;
const password = env.QA_PRO_PASSWORD || env.QA_MAX_PASSWORD;
const jobs = [
  "4a3e1a98-4e8c-426f-8818-54f6a3433359",
  "b1423bf9-e94e-493f-9321-864434ae1561",
];

const auth = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const session = await auth.json();
const token = session.access_token;
for (const jobId of jobs) {
  const res = await fetch(`${base}/functions/v1/cancel-paper-generation-job`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId }),
  });
  const text = await res.text();
  console.log(jobId.slice(0, 8), res.status, text.slice(0, 180));
}
