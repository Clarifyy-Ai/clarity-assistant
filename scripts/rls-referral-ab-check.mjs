#!/usr/bin/env node
/**
 * Referral RLS A/B spot check:
 * - User A can read own referrals / dashboard
 * - User B cannot read User A's referral rows
 * - Clients cannot insert referral_rewards / referral_events
 *
 * Run: node --use-system-ca scripts/rls-referral-ab-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = {
  ...loadEnvFile(path.resolve(process.cwd(), ".env.local")),
  ...loadEnvFile(path.resolve(process.cwd(), ".env.qa.local")),
  ...process.env,
};

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const emailA = env.QA_USER_A_EMAIL;
const passA = env.QA_USER_A_PASSWORD;
const emailB = env.QA_USER_B_EMAIL;
const passB = env.QA_USER_B_PASSWORD;

if (!url || !anon || !emailA || !passA || !emailB || !passB) {
  console.error("Need VITE_SUPABASE_URL, anon key, QA_USER_A/B credentials");
  process.exit(1);
}

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(email, password) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`signIn ${email}: ${error?.message}`);
  return { client, user: data.user };
}

async function main() {
  const a = await signIn(emailA, passA);
  const b = await signIn(emailB, passB);

  const { data: dashA, error: dashErr } = await a.client.rpc("get_referral_dashboard");
  record("A get_referral_dashboard", !dashErr && dashA?.account != null, dashErr?.message);

  const { data: ownRefs, error: ownErr } = await a.client
    .from("referrals")
    .select("id, referrer_id")
    .eq("referrer_id", a.user.id)
    .limit(5);
  record("A select own referrals", !ownErr, ownErr?.message);

  const { data: cross, error: crossErr } = await b.client
    .from("referrals")
    .select("id, referrer_id")
    .eq("referrer_id", a.user.id);
  const leaked = (cross ?? []).length > 0;
  record("B cannot read A referrals", !crossErr && !leaked, crossErr?.message ?? `rows=${(cross ?? []).length}`);

  const { error: insertEvt } = await a.client.from("referral_events").insert({
    event_type: "probe",
    event_status: "rejected",
    metadata: {},
  });
  record("A cannot insert referral_events", Boolean(insertEvt), insertEvt?.message ?? "unexpected allow");

  const { error: insertRew } = await a.client.from("referral_rewards").insert({
    attribution_id: "00000000-0000-0000-0000-000000000001",
    beneficiary_user_id: a.user.id,
    reward_type: "probe",
    reward_amount: 1,
    idempotency_key: `probe:${Date.now()}`,
  });
  record("A cannot insert referral_rewards", Boolean(insertRew), insertRew?.message ?? "unexpected allow");

  const { data: prog, error: progErr } = await a.client
    .from("referral_programmes")
    .select("version, status")
    .eq("status", "active")
    .limit(1);
  record("A can read active programme", !progErr, progErr?.message ?? `count=${(prog ?? []).length}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
