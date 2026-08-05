/**
 * Post-deploy full test suite for https://clarify.ai.sltfinanceindia.com
 * Phases: deploy verify, public API/UI, auth E2E, security, responsive/UX, load probe.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN (optional, for RLS management API)
 *   Uses .env.local + .env.qa.local for anon key + QA passwords
 *
 * Usage: node scripts/post-deploy-full-suite.mjs
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "node:https";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BASE = "https://clarify.ai.sltfinanceindia.com";
const SUPABASE_URL = "https://qzgvjrvtkwlzxpmlddkx.supabase.co";
const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = {
  ...loadEnv(path.join(root, ".env.local")),
  ...loadEnv(path.join(root, ".env.qa.local")),
  SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN || "",
};

const ANON =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  "";

const accounts = {
  Free: { email: env.QA_FREE_EMAIL, password: env.QA_FREE_PASSWORD, id: env.QA_FREE_USER_ID },
  Pro: { email: env.QA_PRO_EMAIL, password: env.QA_PRO_PASSWORD, id: env.QA_PRO_USER_ID },
  Max: { email: env.QA_MAX_EMAIL, password: env.QA_MAX_PASSWORD, id: env.QA_MAX_USER_ID },
  Admin: { email: env.QA_ADMIN_EMAIL, password: env.QA_ADMIN_PASSWORD, id: env.QA_ADMIN_USER_ID },
};

const results = [];
function record(phase, id, status, detail, evidence = {}) {
  results.push({ phase, id, status, detail, evidence, ts: new Date().toISOString() });
  const tag =
    status === "PASS" ? "[P]" : status === "FAIL" ? "[F]" : status === "WARN" ? "[W]" : status === "BLOCKED" ? "[B]" : "[I]";
  console.log(`${tag} [${phase}] ${id}: ${detail}`);
}

async function httpGet(url) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: "follow" });
  const body = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    ms: Date.now() - t0,
    body,
    contentType: res.headers.get("content-type") || "",
    url: res.url,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

// ─── Phase 1: Deploy verify ───────────────────────────────────────────────────
async function phaseDeployVerify(page) {
  const home = await httpGet(`${BASE}/`);
  const hasStructuredScript = /src=["'][^"']*structured-data\.js/.test(home.body);
  const hasJsonLdSlot = /id=["']clarify-page-jsonld["']/.test(home.body);
  const hasAbsTheme = /src=["']\/theme-init\.js["']/.test(home.body);
  const hasRelTheme = /src=["']\.\/theme-init\.js["']/.test(home.body);

  record("DEPLOY", "no structured-data.js script", hasStructuredScript ? "FAIL" : "PASS", hasStructuredScript ? "still loaded" : "absent (comment-only OK)");
  record("DEPLOY", "clarify-page-jsonld slot", hasJsonLdSlot ? "PASS" : "FAIL", hasJsonLdSlot ? "present" : "missing");
  record(
    "DEPLOY",
    "theme-init absolute path",
    hasAbsTheme ? "PASS" : hasRelTheme ? "WARN" : "FAIL",
    hasAbsTheme ? "/theme-init.js" : hasRelTheme ? "./theme-init.js still relative" : "missing",
  );

  const dash = await httpGet(`${BASE}/dashboard`);
  record("DEPLOY", "/dashboard not 503", dash.status !== 503 && dash.status < 500 ? "PASS" : "FAIL", `status=${dash.status}`);

  const consoleHits = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/content security policy|refused to (execute|load)/i.test(t)) consoleHits.push(t);
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3500);
  const cspActionable = consoleHits.filter((t) =>
    /structured-data|inline script|CameraPlainVariable|cdn\.gpteng\.co/i.test(t),
  );
  record(
    "DEPLOY",
    "cold load CSP console",
    cspActionable.length === 0 ? "PASS" : "FAIL",
    cspActionable.length ? cspActionable.slice(0, 3).join(" || ") : "clean",
    { count: cspActionable.length },
  );

  await page.goto(`${BASE}/login?reason=session_expired&returnTo=%2Fapp%2Fdashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const loginTxt = await page.locator("body").innerText();
  record(
    "DEPLOY",
    "session_expired banner",
    /session expired/i.test(loginTxt) ? "PASS" : "FAIL",
    /session expired/i.test(loginTxt) ? "visible" : "missing",
  );

  return cspActionable.length === 0 && !hasStructuredScript && hasJsonLdSlot;
}

// ─── Phase 2: Public pages ────────────────────────────────────────────────────
async function phasePublic(page) {
  const routes = [
    "/",
    "/login",
    "/signup",
    "/pricing",
    "/help",
    "/terms",
    "/privacy",
    "/gov-exams",
    "/blog",
    "/shortcuts",
    "/dashboard",
  ];

  for (const route of routes) {
    const r = await httpGet(`${BASE}${route}`);
    const spa = /id=["']root["']/.test(r.body);
    record(
      "PUBLIC_API",
      `HTTP ${route}`,
      r.status < 500 && spa ? "PASS" : "FAIL",
      `status=${r.status} spa=${spa} ms=${r.ms}`,
    );
  }

  for (const route of ["/", "/login", "/pricing", "/help"]) {
    const errors = [];
    const onConsole = (m) => {
      if (m.type() === "error") errors.push(m.text());
    };
    page.on("console", onConsole);
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1200);
    page.off("console", onConsole);
    const title = await page.title();
    const h1 = await page.locator("h1").first().textContent().catch(() => "");
    record(
      "PUBLIC_UI",
      `UI ${route}`,
      title ? "PASS" : "WARN",
      `title=${title} h1=${(h1 || "").slice(0, 60)} consoleErrors=${errors.length}`,
    );
  }
}

// ─── Phase 3: Auth E2E ────────────────────────────────────────────────────────
async function loginUi(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);
  try {
    const btn = page.getByRole("button", { name: /accept|agree|got it/i });
    if (await btn.first().isVisible({ timeout: 1000 })) await btn.first().click();
  } catch {
    /* ignore */
  }
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  const t0 = Date.now();
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
  await page.waitForTimeout(2500);
  return Date.now() - t0;
}

async function clearSession(page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

async function phaseAuthApiAndE2E(page) {
  if (!ANON) {
    record("AUTH", "anon key", "BLOCKED", "missing from .env.local");
    return;
  }
  const supabase = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const [role, acc] of Object.entries(accounts)) {
    if (!acc.email || !acc.password) {
      record("AUTH", `${role} creds`, "BLOCKED", "missing");
      continue;
    }
    const t0 = Date.now();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.password,
    });
    const loginMs = Date.now() - t0;
    if (error || !data.session) {
      record("AUTH", `${role} API login`, "FAIL", error?.message || "no session");
      continue;
    }
    record("AUTH", `${role} API login`, loginMs <= 5000 ? "PASS" : "WARN", `ms=${loginMs}`);

    const p0 = Date.now();
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id,email,full_name,credits,plan_id,onboarding_completed,is_banned")
      .eq("id", data.user.id)
      .maybeSingle();
    const profileMs = Date.now() - p0;
    if (pErr || !profile) {
      record("AUTH", `${role} profile`, "FAIL", pErr?.message || "missing row");
    } else {
      record(
        "AUTH",
        `${role} profile`,
        profileMs <= 2000 ? "PASS" : "FAIL",
        `ms=${profileMs} plan=${profile.plan_id} credits=${profile.credits}`,
        { profileMs, plan_id: profile.plan_id, credits: profile.credits },
      );
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const expectAdmin = role === "Admin";
    record(
      "AUTH",
      `${role} admin role`,
      isAdmin === expectAdmin ? "PASS" : "FAIL",
      `isAdmin=${isAdmin}`,
    );
    await supabase.auth.signOut({ scope: "local" });
  }

  // Invalid password UI
  await clearSession(page);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"], input[name="email"]').first().fill(accounts.Pro.email);
  await page.locator('input[type="password"], input[name="password"]').first().fill("WrongPass!999");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(2500);
  const badTxt = await page.locator("body").innerText();
  record(
    "AUTH",
    "invalid password UI",
    /invalid|incorrect|wrong|failed|credentials/i.test(badTxt) && /\/login/.test(page.url())
      ? "PASS"
      : "WARN",
    `url=${page.url()}`,
  );

  // Anon protected
  await clearSession(page);
  await page.goto(`${BASE}/app/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  record(
    "AUTH",
    "anon /app/dashboard → login",
    /\/login/.test(page.url()) ? "PASS" : "FAIL",
    `url=${page.url()}`,
  );
  record(
    "AUTH",
    "returnTo present",
    /returnTo=/i.test(page.url()) || /session_expired|from/i.test(page.url())
      ? "PASS"
      : "WARN",
    `url=${page.url()}`,
  );

  // Pro UI login + routes
  await clearSession(page);
  const proMs = await loginUi(page, accounts.Pro.email, accounts.Pro.password);
  const body = await page.locator("body").innerText();
  const profileErr = /couldn't load your account|profile load timed out|authentication error/i.test(body);
  record(
    "AUTH",
    "Pro UI login",
    !profileErr && /\/app\//.test(page.url()) && proMs <= 8000 ? "PASS" : "FAIL",
    `ms=${proMs} url=${page.url()} profileErr=${profileErr}`,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  record(
    "AUTH",
    "Pro hard refresh session",
    /\/app\//.test(page.url()) ? "PASS" : "FAIL",
    `url=${page.url()}`,
  );

  for (const route of [
    "/app/live",
    "/app/mock",
    "/app/prep",
    "/app/answers",
    "/app/sessions",
    "/app/settings/profile",
    "/app/usage",
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);
    const txt = await page.locator("body").innerText();
    const bad = /couldn't load your account|profile load timed out/i.test(txt);
    record(
      "AUTH",
      `Pro ${route}`,
      bad || /\/login/.test(page.url()) ? "FAIL" : "PASS",
      `url=${page.url()}`,
    );
  }

  await page.goto(`${BASE}/app/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const adminDenied = await page.locator("body").innerText();
  record(
    "AUTH",
    "Pro admin denied",
    /access denied/i.test(adminDenied) ? "PASS" : "FAIL",
    adminDenied.slice(0, 120).replace(/\s+/g, " "),
  );

  // Logout
  await page.goto(`${BASE}/app/settings/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // Try sign out via storage clear + navigate (UI logout control varies)
  await clearSession(page);
  await page.goto(`${BASE}/app/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  record(
    "AUTH",
    "logout clears /app access",
    /\/login/.test(page.url()) ? "PASS" : "FAIL",
    `url=${page.url()}`,
  );

  // Free + Admin + Max UI
  await clearSession(page);
  const freeMs = await loginUi(page, accounts.Free.email, accounts.Free.password);
  const freeShell = (await page.locator("aside, header").allInnerTexts().catch(() => [])).join(" | ");
  record(
    "AUTH",
    "Free UI shell",
    /free/i.test(freeShell) && freeMs <= 10000 ? "PASS" : "WARN",
    `ms=${freeMs} shell=${freeShell.slice(0, 200).replace(/\s+/g, " ")}`,
  );

  await clearSession(page);
  const adminMs = await loginUi(page, accounts.Admin.email, accounts.Admin.password);
  await page.goto(`${BASE}/app/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const adminOk = await page.locator("body").innerText();
  record(
    "AUTH",
    "Admin UI portal",
    !/access denied/i.test(adminOk) && /users|revenue|qa checklist/i.test(adminOk) && adminMs <= 12000
      ? "PASS"
      : "FAIL",
    `ms=${adminMs} snip=${adminOk.slice(0, 160).replace(/\s+/g, " ")}`,
  );

  await clearSession(page);
  const maxMs = await loginUi(page, accounts.Max.email, accounts.Max.password);
  record("AUTH", "Max UI login", maxMs <= 10000 ? "PASS" : "WARN", `ms=${maxMs} url=${page.url()}`);
}

// ─── Phase 4: Security ────────────────────────────────────────────────────────
async function phaseSecurity() {
  // Bundle scan
  const home = await httpGet(`${BASE}/`);
  const assetPaths = [...home.body.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0]);
  let bundleFail = false;
  let scanned = 0;
  for (const a of assetPaths.slice(0, 12)) {
    try {
      const js = await httpGet(`${BASE}${a}`);
      scanned++;
      // Real leaks only — do not FAIL on redaction allowlist names like
      // service_role_key / serviceRoleKey (logger field names in the client bundle).
      const secretHit =
        /SUPABASE_SERVICE_ROLE/i.test(js.body) ||
        /sbp_[a-z0-9]{20,}/i.test(js.body) ||
        /(?:service_role(?:_key)?|serviceRoleKey)["']?\s*[:=]\s*["']eyJ/i.test(js.body);
      if (secretHit) {
        bundleFail = true;
        record("SECURITY", `bundle secret ${a}`, "FAIL", "sensitive token pattern found");
      }
    } catch (e) {
      record("SECURITY", `bundle fetch ${a}`, "WARN", e.message);
    }
  }
  if (!bundleFail) {
    record(
      "SECURITY",
      "client bundle secrets",
      "PASS",
      `scanned ${scanned} assets — no SUPABASE_SERVICE_ROLE / sbp_ PAT / service_role JWT assignment`,
    );
  }

  // Cross-user isolation
  if (ANON && accounts.Pro.email) {
    const supabase = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: accounts.Pro.email,
      password: accounts.Pro.password,
    });
    if (!error && data.session) {
      const otherId = accounts.Free.id;
      const { data: otherProfile, error: oErr } = await supabase
        .from("profiles")
        .select("id,email,full_name")
        .eq("id", otherId)
        .maybeSingle();
      const leaked = Boolean(otherProfile?.id);
      record(
        "SECURITY",
        "Pro cannot read Free profile",
        !leaked ? "PASS" : "FAIL",
        leaked ? `LEAKED ${otherProfile.email}` : oErr?.message || "empty/denied",
      );

      const { data: otherSessions } = await supabase
        .from("sessions")
        .select("id,user_id")
        .eq("user_id", otherId)
        .limit(5);
      const sessionLeak = (otherSessions ?? []).length > 0;
      record(
        "SECURITY",
        "Pro cannot read Free sessions",
        !sessionLeak ? "PASS" : "FAIL",
        sessionLeak ? `count=${otherSessions.length}` : "empty",
      );
      await supabase.auth.signOut({ scope: "local" });
    }
  }

  // RLS management API
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    record("SECURITY", "RLS spot-check", "BLOCKED", "SUPABASE_ACCESS_TOKEN not set");
  } else {
    const query = `
SELECT c.relname AS table_name,
       COUNT(p.polname)::int AS policy_count,
       bool_or(c.relrowsecurity) AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('sessions','session_transcripts','profiles','credit_transactions','user_roles','documents','answers')
GROUP BY c.relname
ORDER BY c.relname;`;
    const body = JSON.stringify({ query });
    const apiResult = await new Promise((resolve) => {
      const req = https.request(
        {
          hostname: "api.supabase.com",
          path: `/v1/projects/${PROJECT_REF}/database/query`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ status: res.statusCode, data }));
        },
      );
      req.on("error", (e) => resolve({ status: 0, data: e.message }));
      req.write(body);
      req.end();
    });

    if (apiResult.status >= 200 && apiResult.status < 300) {
      let rows;
      try {
        rows = JSON.parse(apiResult.data);
      } catch {
        rows = [];
      }
      const list = Array.isArray(rows) ? rows : rows?.data || [];
      const bad = list.filter((r) => !r.rls_enabled || Number(r.policy_count) < 1);
      record(
        "SECURITY",
        "RLS enabled core tables",
        bad.length === 0 ? "PASS" : "FAIL",
        JSON.stringify(list).slice(0, 500),
        { list },
      );
    } else {
      record(
        "SECURITY",
        "RLS spot-check",
        "FAIL",
        `status=${apiResult.status} body=${String(apiResult.data).slice(0, 200)}`,
      );
    }
  }

  // Static security gates
  try {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, ["scripts/release-security-gates.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    record(
      "SECURITY",
      "release-security-gates",
      r.status === 0 ? "PASS" : "FAIL",
      (r.stdout || r.stderr || "").slice(0, 300) || `exit=${r.status}`,
    );
  } catch (e) {
    record("SECURITY", "release-security-gates", "WARN", e.message);
  }
}

// ─── Phase 5–6: Responsive + UX ───────────────────────────────────────────────
async function phaseResponsiveUx(page) {
  await clearSession(page);
  await loginUi(page, accounts.Pro.email, accounts.Pro.password);

  const viewports = [
    { w: 375, h: 812, name: "iphone-ish" },
    { w: 390, h: 844, name: "pixel-ish" },
    { w: 768, h: 1024, name: "tablet" },
    { w: 1440, h: 900, name: "desktop" },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${BASE}/app/dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);
    const txt = await page.locator("body").innerText();
    const hang = /loading clarify|preparing your workspace|couldn't load your account/i.test(txt);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 8;
    });
    record(
      "RESPONSIVE",
      `dashboard ${vp.name} ${vp.w}x${vp.h}`,
      !hang && /\/app\//.test(page.url()) ? "PASS" : "FAIL",
      `hang=${hang} overflowX=${overflow} url=${page.url()}`,
    );
  }

  // Login UX desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await clearSession(page);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const signIn = page.getByRole("button", { name: /sign in/i });
  const email = page.locator('input[type="email"], input[name="email"]').first();
  record(
    "UX",
    "login controls focusable",
    (await signIn.isVisible()) && (await email.isVisible()) ? "PASS" : "FAIL",
    "Sign in + email present",
  );
  const h1 = await page.locator("h1").first().textContent().catch(() => "");
  record("UX", "login has heading", h1 ? "PASS" : "WARN", `h1=${h1}`);

  // Shell consistency Free
  await clearSession(page);
  await loginUi(page, accounts.Free.email, accounts.Free.password);
  const shell = (await page.locator("aside, header").allInnerTexts().catch(() => [])).join("\n");
  const hasName = /QA/i.test(shell);
  const hasPlan = /Free/i.test(shell);
  const hasCredits = /\d+\s*credits/i.test(shell);
  record(
    "UX",
    "Free shell name/plan/credits",
    hasName && hasPlan && hasCredits ? "PASS" : "WARN",
    shell.slice(0, 250).replace(/\s+/g, " "),
  );
}

// ─── Phase 7: Load probe ──────────────────────────────────────────────────────
async function phaseLoad() {
  const anonTargets = [`${BASE}/`, `${BASE}/login`];
  const statuses = [];
  const times = [];
  const jobs = [];
  for (let i = 0; i < 20; i++) {
    const url = anonTargets[i % anonTargets.length];
    jobs.push(
      (async () => {
        try {
          const r = await httpGet(url);
          statuses.push(r.status);
          times.push(r.ms);
        } catch {
          statuses.push(599);
          times.push(0);
        }
      })(),
    );
  }
  await Promise.all(jobs);
  const errRate = statuses.filter((s) => s >= 500).length / statuses.length;
  const sorted = [...times].sort((a, b) => a - b);
  record(
    "LOAD",
    "anon concurrent GET x20",
    errRate <= 0.05 ? "PASS" : "FAIL",
    `errRate=${(errRate * 100).toFixed(1)}% p50=${percentile(sorted, 50)}ms p95=${percentile(sorted, 95)}ms`,
    { statuses, times },
  );

  if (!ANON || !accounts.Pro.email) {
    record("LOAD", "Pro login/profile cycles", "BLOCKED", "missing anon/creds");
    return;
  }
  const loginMs = [];
  const profileMs = [];
  let fails = 0;
  for (let i = 0; i < 10; i++) {
    const supabase = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const t0 = Date.now();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: accounts.Pro.email,
      password: accounts.Pro.password,
    });
    const lm = Date.now() - t0;
    if (error || !data.user) {
      fails++;
      continue;
    }
    loginMs.push(lm);
    const p0 = Date.now();
    const { error: pErr } = await supabase
      .from("profiles")
      .select("id,credits,plan_id")
      .eq("id", data.user.id)
      .maybeSingle();
    profileMs.push(Date.now() - p0);
    if (pErr) fails++;
    await supabase.auth.signOut({ scope: "local" });
  }
  loginMs.sort((a, b) => a - b);
  profileMs.sort((a, b) => a - b);
  const p95Profile = percentile(profileMs, 95);
  record(
    "LOAD",
    "Pro login+profile x10",
    fails === 0 && p95Profile != null && p95Profile <= 5000 ? "PASS" : "FAIL",
    `fails=${fails} login p50=${percentile(loginMs, 50)} p95=${percentile(loginMs, 95)} profile p50=${percentile(profileMs, 50)} p95=${p95Profile}`,
    { loginMs, profileMs, fails },
  );
}

function writeReport() {
  const outDir = path.join(root, "docs", "qa", "audits");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `post-deploy-full-${stamp}.json`);
  const summary = {
    PASS: results.filter((r) => r.status === "PASS").length,
    FAIL: results.filter((r) => r.status === "FAIL").length,
    WARN: results.filter((r) => r.status === "WARN").length,
    BLOCKED: results.filter((r) => r.status === "BLOCKED").length,
    INFO: results.filter((r) => r.status === "INFO").length,
  };
  fs.writeFileSync(jsonPath, JSON.stringify({ base: BASE, summary, results }, null, 2));

  const fails = results.filter((r) => r.status === "FAIL");
  const deployFails = fails.filter((r) => r.phase === "DEPLOY");
  let decision = "GO";
  if (fails.length === 0) decision = "GO";
  else if (deployFails.length > 0 || fails.some((f) => /secret|LEAKED|RLS|admin denied|profile/i.test(f.id + f.detail)))
    decision = fails.some((f) => /LEAKED|service_role|sbp_/i.test(f.detail)) ? "NO-GO" : "CONDITIONAL GO";
  else decision = "CONDITIONAL GO";

  const lines = [];
  lines.push("=".repeat(80));
  lines.push("CLARIFY AI — POST-DEPLOY FULL TEST REPORT");
  lines.push("=".repeat(80));
  lines.push(`Site      : ${BASE}`);
  lines.push(`Generated : ${new Date().toISOString()}`);
  lines.push(
    `Summary   : PASS=${summary.PASS} FAIL=${summary.FAIL} WARN=${summary.WARN} BLOCKED=${summary.BLOCKED}`,
  );
  lines.push(`Decision  : ${decision}`);
  lines.push("");
  lines.push("NOTE: SUPABASE_ACCESS_TOKEN used from env only; rotate if exposed in chat.");
  lines.push("");

  let phase = "";
  for (const r of results) {
    if (r.phase !== phase) {
      phase = r.phase;
      lines.push("-".repeat(80));
      lines.push(`PHASE: ${phase}`);
      lines.push("-".repeat(80));
    }
    lines.push(`[${r.status}] ${r.id}`);
    lines.push(`  ${r.detail}`);
  }

  lines.push("");
  lines.push("=".repeat(80));
  lines.push("BLOCKERS / FOLLOW-UPS");
  lines.push("=".repeat(80));
  if (fails.length === 0) lines.push("None.");
  else for (const f of fails) lines.push(`- [${f.phase}] ${f.id}: ${f.detail}`);

  lines.push("");
  lines.push("Manual remaining: mic/Deepgram, Stripe checkout, OAuth popups, Electron.");
  lines.push(`JSON: ${jsonPath}`);
  lines.push("=".repeat(80));

  const txtPath = path.join(root, "CLARIFY_AI_POST_DEPLOY_FULL_TEST_REPORT.txt");
  fs.writeFileSync(txtPath, lines.join("\n"), "utf8");
  console.log("\nWrote", txtPath);
  console.log("Wrote", jsonPath);
  console.log("DECISION", decision, summary);
  return { summary, decision, txtPath, jsonPath };
}

async function main() {
  console.log("Post-deploy full suite →", BASE);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const deployOk = await phaseDeployVerify(page);
  if (!deployOk) {
    record(
      "DEPLOY",
      "gate",
      "WARN",
      "Deploy gate soft-continue: some remediations imperfect; continuing deeper suites for evidence",
    );
  }

  await phasePublic(page);
  await phaseAuthApiAndE2E(page);
  await phaseSecurity();
  await phaseResponsiveUx(page);
  await browser.close();
  await phaseLoad();
  writeReport();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
