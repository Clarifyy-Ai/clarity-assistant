#!/usr/bin/env node
/**
 * Runtime CORS verification against deployed Edge Functions.
 *
 * Usage:
 *   node scripts/verify-edge-cors.mjs
 *   node scripts/verify-edge-cors.mjs --base https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1
 */

const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";
const DEFAULT_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const APPROVED_ORIGIN = "https://clarityapp.ai";
const LOCAL_ORIGIN = "http://127.0.0.1:5000";
const UNAPPROVED_ORIGIN = "https://evil.example";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = (baseIdx >= 0 ? args[baseIdx + 1] : DEFAULT_BASE).replace(/\/+$/, "");

const BROWSER_FUNCTIONS = [
  "search-exams",
  "submit-test",
  "create-exam-paper",
  "generate-topic-practice",
  "select-test-questions",
  "generate-questions",
  "generate-answer",
  "prep-tool",
  "company-research",
  "export-user-data",
  "parse-resume",
  "health",
  "ping",
  "create-test",
  "razorpay-create-order",
];

function header(res, name) {
  return res.headers.get(name);
}

async function check(name, reqInit) {
  const res = await fetch(`${BASE}/${name}`, reqInit);
  return {
    status: res.status,
    acao: header(res, "access-control-allow-origin"),
    creds: header(res, "access-control-allow-credentials"),
    vary: header(res, "vary"),
    methods: header(res, "access-control-allow-methods"),
    correlation: header(res, "x-request-id") || header(res, "x-correlation-id"),
    body: await res.text().catch(() => ""),
  };
}

async function main() {
  const failures = [];
  console.log(`[verify-edge-cors] base=${BASE}`);

  for (const fn of BROWSER_FUNCTIONS) {
    const preflight = await check(fn, {
      method: "OPTIONS",
      headers: {
        Origin: APPROVED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "authorization,apikey,content-type,x-client-info,x-idempotency-key,x-request-id",
      },
    });

    if (preflight.status >= 400 || preflight.acao !== APPROVED_ORIGIN) {
      failures.push(`${fn} OPTIONS approved: status=${preflight.status} acao=${preflight.acao}`);
    }
    if (preflight.acao === "*") {
      failures.push(`${fn} OPTIONS used wildcard origin`);
    }

    const rejected = await check(fn, {
      method: "OPTIONS",
      headers: {
        Origin: UNAPPROVED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    if (rejected.acao === UNAPPROVED_ORIGIN || rejected.acao === "*") {
      failures.push(`${fn} OPTIONS unapproved granted CORS acao=${rejected.acao}`);
    }

    const unauth = await check(fn, {
      method: "POST",
      headers: {
        Origin: LOCAL_ORIGIN,
        "Content-Type": "application/json",
        apikey: "anon",
      },
      body: "{}",
    });
    if (![200, 400, 401, 402, 403, 404, 405, 410, 422, 429, 500, 502, 503].includes(unauth.status)) {
      failures.push(`${fn} POST unauth unexpected status ${unauth.status}`);
    }
    if (unauth.acao && unauth.acao !== LOCAL_ORIGIN && unauth.acao !== "*") {
      failures.push(`${fn} POST unauth acao=${unauth.acao}`);
    }
    if (unauth.acao === LOCAL_ORIGIN && unauth.creds === "true" && /postgres|service_role|stack/i.test(unauth.body)) {
      failures.push(`${fn} leaked internals in body`);
    }

    console.log(
      `  ${fn.padEnd(24)} OPTIONS ${preflight.status}/${preflight.acao ?? "-"}  POST ${unauth.status}/${unauth.acao ?? "-"} corr=${unauth.correlation ?? "-"}`,
    );
  }

  if (failures.length) {
    console.error("[verify-edge-cors] FAILED:");
    for (const f of failures) console.error("  -", f);
    process.exit(1);
  }
  console.log("[verify-edge-cors] OK");
}

main().catch((err) => {
  console.error("[verify-edge-cors] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
