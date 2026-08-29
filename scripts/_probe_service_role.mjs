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
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const service = local.SUPABASE_SERVICE_ROLE_KEY;

function decodeJwt(tok) {
  try {
    const payload = tok.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

console.log("anon role", decodeJwt(anon)?.role, "ref", decodeJwt(anon)?.ref);
console.log("service role", decodeJwt(service)?.role, "ref", decodeJwt(service)?.ref);
console.log("keys equal?", anon === service);
console.log("service len", service?.length, "anon len", anon?.length);

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Direct SQL via rpc if available
for (const q of [
  "select current_user as u, current_setting('role', true) as r, current_setting('request.jwt.claim.role', true) as jwt_role, auth.role() as auth_role",
]) {
  const r = await fetch(`${url}/rest/v1/rpc/is_service_role_request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  console.log("is_service_role_request", r.status, await r.text());
}

// Try getting spendable credits
const qa = load(".env.qa.local");
const userClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data } = await userClient.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
const uid = data.user.id;

const spend = await admin.rpc("get_spendable_credits", { p_user_id: uid });
console.log("get_spendable_credits", spend.error?.message || spend.data);

const deduct = await admin.rpc("deduct_credits_service", {
  p_user_id: uid,
  p_action: "rephraser",
  p_cost: 3,
  p_session_id: null,
  p_idempotency_key: `probe-role-${Date.now()}`,
  p_request_hash: null,
});
console.log("deduct", deduct.data);

// Check auth.jwt via a trivial select using Prefer
const rest = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
  headers: {
    Authorization: `Bearer ${service}`,
    apikey: service,
  },
});
console.log("profiles as service", rest.status);
