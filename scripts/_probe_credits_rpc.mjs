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
const service = local.SUPABASE_SERVICE_ROLE_KEY;
if (!service) {
  console.error("no service role");
  process.exit(1);
}

const userClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await userClient.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (error) throw error;
const userId = data.user.id;
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const attempts = [
  {
    name: "deduct_credits_service",
    args: {
      p_user_id: userId,
      p_action: "rephraser",
      p_cost: 3,
      p_session_id: null,
      p_idempotency_key: `probe-svc-${Date.now()}`,
      p_request_hash: null,
    },
  },
  {
    name: "deduct_credits_service",
    args: {
      p_user_id: userId,
      p_action: "resume_analysis",
      p_cost: 5,
      p_session_id: null,
      p_idempotency_key: `probe-resume-${Date.now()}`,
      p_request_hash: null,
    },
  },
];

for (const a of attempts) {
  const res = await admin.rpc(a.name, a.args);
  console.log(
    JSON.stringify({
      name: a.name,
      action: a.args.p_action,
      err: res.error?.message ?? null,
      data: res.data,
    }),
  );
}

const { data: profile } = await admin
  .from("profiles")
  .select("credits, plan_id, subscription_status")
  .eq("id", userId)
  .single();
console.log("profile", profile);

// list functions matching deduct
const { data: funcs, error: fErr } = await admin.rpc("pg_catalog").catch?.(() => ({}));
void funcs;
void fErr;
const q = await admin.from("profiles").select("id").limit(1);
console.log("admin ok", !q.error);
