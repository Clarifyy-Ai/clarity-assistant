#!/usr/bin/env node
/** One-off billing deploy verification — never prints secret values. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "qzgvjrvtkwlzxpmlddkx";

function loadEnv(file) {
  const p = path.join(ROOT, file);
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

const local = loadEnv(".env.local");
const prod = loadEnv(".env.production");
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  local.SUPABASE_ACCESS_TOKEN ||
  prod.SUPABASE_ACCESS_TOKEN;

const out = { checks: [] };

function pass(id, detail) {
  out.checks.push({ id, status: "OK", detail });
}
function fail(id, detail) {
  out.checks.push({ id, status: "FAIL", detail });
}

if (!token) {
  fail("SUPABASE_TOKEN", "missing");
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

// Edge secrets (names only)
const secretsRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  headers,
});
const secrets = await secretsRes.json();
const names = Array.isArray(secrets) ? secrets.map((s) => s.name) : [];
for (const name of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
  if (names.includes(name)) pass(`SECRET_${name}`, "present");
  else fail(`SECRET_${name}`, "missing");
}

// Deployed function versions
const fnRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, { headers });
const fns = await fnRes.json();
const targets = ["razorpay-create-order", "razorpay-verify-payment", "razorpay-webhook"];
for (const slug of targets) {
  const fn = (Array.isArray(fns) ? fns : []).find((f) => f.slug === slug);
  if (fn?.status === "ACTIVE" && fn.version >= 70) {
    pass(`FN_${slug}`, `v${fn.version} ACTIVE`);
  } else if (fn) {
    pass(`FN_${slug}`, `v${fn.version} ${fn.status}`);
  } else {
    fail(`FN_${slug}`, "not found");
  }
}

// Local index.html CSP
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
if (indexHtml.includes("https://*.razorpay.com")) {
  pass("LOCAL_CSP", "razorpay wildcard present");
} else {
  fail("LOCAL_CSP", "missing https://*.razorpay.com");
}

// Hosted index.html CSP (if reachable)
const siteUrl =
  prod.VITE_APP_URL ||
  prod.PUBLIC_URL ||
  prod.SITE_URL ||
  "https://trycareerpilot.com";
try {
  const r = await fetch(siteUrl.replace(/\/$/, "") + "/", { signal: AbortSignal.timeout(15000) });
  const html = await r.text();
  if (r.status === 200 && html.includes("https://*.razorpay.com")) {
    pass("HOSTED_CSP", `${siteUrl} has razorpay CSP`);
  } else if (r.status === 200) {
    fail("HOSTED_CSP", `${siteUrl} missing razorpay wildcard CSP — frontend redeploy needed`);
  } else {
    fail("HOSTED_CSP", `http ${r.status}`);
  }
} catch (e) {
  out.checks.push({ id: "HOSTED_CSP", status: "SKIP", detail: String(e.message || e) });
}

// Billing preflight with production env vars (no values printed)
const preflightEnv = { ...process.env, ...prod, APP_ENV: "production", ENVIRONMENT: "production" };
const preflightChecks = [];
function checkPreflight(name, value, opts) {
  const present = Boolean(value && String(value).trim());
  let ok = present;
  if (present && opts.forbidTestPrefix && String(value).startsWith("rzp_test_")) ok = false;
  if (present && opts.pattern && !opts.pattern.test(String(value).trim())) ok = false;
  preflightChecks.push({ name, ok });
}
checkPreflight("RAZORPAY_KEY_ID", preflightEnv.RAZORPAY_KEY_ID, {
  pattern: /^rzp_(live|test)_/,
  forbidTestPrefix: true,
});
checkPreflight("RAZORPAY_KEY_SECRET", preflightEnv.RAZORPAY_KEY_SECRET, {});
checkPreflight("RAZORPAY_WEBHOOK_SECRET", preflightEnv.RAZORPAY_WEBHOOK_SECRET, { required: true });
const preflightFails = preflightChecks.filter((c) => !c.ok);
if (preflightFails.length === 0) pass("LOCAL_PREFLIGHT_PROD", "razorpay config compatible");
else fail("LOCAL_PREFLIGHT_PROD", preflightFails.map((c) => c.name).join(", "));

out.summary = {
  passed: out.checks.filter((c) => c.status === "OK").length,
  failed: out.checks.filter((c) => c.status === "FAIL").length,
  skipped: out.checks.filter((c) => c.status === "SKIP").length,
};

console.log(JSON.stringify(out, null, 2));
process.exit(out.summary.failed > 0 ? 1 : 0);
