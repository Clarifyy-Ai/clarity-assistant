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
if (error) throw error;
const tok = data.session.access_token;
const uid = data.user.id;

const { data: courses, error: cErr } = await client
  .from("learning_courses")
  .select("id,title")
  .limit(5);
console.log("courses", cErr?.message || courses);

if (courses?.[0]) {
  const r = await fetch(`${url}/functions/v1/issue-course-certificate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ course_id: courses[0].id }),
  });
  console.log("issue-cert", r.status, (await r.text()).slice(0, 500));
}

const { data: certs } = await client
  .from("course_certificates")
  .select("certificate_code,course_id")
  .eq("user_id", uid)
  .limit(3);
console.log("certs", certs);

if (certs?.[0]?.certificate_code) {
  const v = await client.rpc("verify_course_certificate", {
    p_code: certs[0].certificate_code,
  });
  console.log("verify", v.error?.message || v.data);
  const bad = await client.rpc("verify_course_certificate", {
    p_code: "INVALID-CODE-XYZ",
  });
  console.log("verify-invalid", bad.error?.message || bad.data);
}
