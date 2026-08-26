import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function load(p) {
  const o = {};
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
const jobId = process.argv[2] || "7abee03a-4779-4433-9ae3-55b313f5fca5";

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: auth } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
const headers = {
  Authorization: `Bearer ${auth.session.access_token}`,
  apikey: anon,
  "Content-Type": "application/json",
};

for (let i = 0; i < 18; i++) {
  if (i === 0 || i === 2 || i === 5) {
    const kick = await fetch(`${url}/functions/v1/process-paper-generation-job`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jobId }),
    });
    console.log("KICK", kick.status, (await kick.text()).slice(0, 220));
  }
  const r = await fetch(
    `${url}/functions/v1/get-paper-generation-job?jobId=${jobId}`,
    { headers },
  );
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* ignore */
  }
  console.log(
    "POLL",
    i,
    r.status,
    j?.status,
    j?.progressStage,
    j?.errorCode || "",
    (j?.errorMessage || "").slice(0, 120),
    j?.mockTestId || j?.paperId || "",
  );
  const st = String(j?.status || "");
  if (
    ["completed", "ready", "succeeded", "failed", "failed_permanent", "cancelled"].includes(
      st,
    )
  ) {
    console.log("FINAL", JSON.stringify(j).slice(0, 500));
    process.exit(st.startsWith("fail") || st === "cancelled" ? 2 : 0);
  }
  await new Promise((r) => setTimeout(r, 8000));
}
process.exit(3);
