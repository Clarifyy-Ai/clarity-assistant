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

if (!url || !anon || !qa.QA_PRO_EMAIL) {
  console.log("MISSING_ENV", {
    url: !!url,
    anon: !!anon,
    email: !!qa.QA_PRO_EMAIL,
  });
  process.exit(1);
}

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

// Profile probe (DEF-001)
const tProfile = Date.now();
const { data: profile, error: profileErr } = await client
  .from("profiles")
  .select("id, email, plan_id, region, timezone, locale, credits")
  .eq("id", data.user.id)
  .maybeSingle();
console.log(
  JSON.stringify({
    profile_ms: Date.now() - tProfile,
    profile_ok: !!profile,
    profile_error: profileErr?.message || null,
    region: profile?.region ?? null,
  }),
);

for (const q of ["", "upsc", "ssc", "ibps", "zzznojunk"]) {
  const t0 = Date.now();
  const r = await fetch(`${url}/functions/v1/search-exams`, {
    method: "POST",
    headers,
    body: JSON.stringify({ q, page: 1, pageSize: 20 }),
  });
  const text = await r.text();
  let preview = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    preview = JSON.stringify({
      success: j.success,
      count: j.count,
      codes: (j.results || []).slice(0, 5).map((x) => x.code),
      code: j.code,
      message: j.message,
    });
  } catch {
    /* keep raw */
  }
  console.log(
    JSON.stringify({ q, status: r.status, ms: Date.now() - t0, preview }),
  );
}
