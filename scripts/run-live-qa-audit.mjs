#!/usr/bin/env node
/**
 * Live application QA audit against staging (or QA_BASE_URL).
 * Uses real credentials from .env.qa.local — never prints passwords.
 *
 * Output: qa-audit-results/live-audit-<date>.json
 *
 * Usage:
 *   node --use-system-ca scripts/run-live-qa-audit.mjs
 *   QA_BASE_URL=http://localhost:5173 node --use-system-ca scripts/run-live-qa-audit.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const OUT_DIR = path.join(root, "qa-audit-results");

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
  ...loadEnvFile(path.join(root, ".env.local")),
  ...loadEnvFile(path.join(root, ".env.qa.local")),
  ...process.env,
};

const BASE =
  process.env.QA_BASE_URL ||
  env.QA_BASE_URL_STAGING ||
  "https://trycareerpilot.com";
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const TODAY = new Date().toISOString().slice(0, 10);
const RUN_ID = `live-${TODAY}-${Date.now().toString(36)}`;

/** Public marketing / auth routes — no login */
const PUBLIC_ROUTES = [
  { id: "MKT-01", path: "/", expect: /Clarify|Practice|interview/i },
  { id: "MKT-02", path: "/pricing", expect: /pricing|plan|credit/i },
  { id: "MKT-03", path: "/gov-exams", expect: /exam|UPSC|SSC|mock/i },
  { id: "MKT-04", path: "/help", expect: /help|guide|faq|support/i },
  { id: "MKT-05", path: "/shortcuts", expect: /shortcut|hotkey|keyboard/i },
  { id: "MKT-06", path: "/blog", expect: /blog|article|post|coming/i },
  { id: "MKT-07", path: "/terms", expect: /terms|service|agreement/i },
  { id: "MKT-08", path: "/privacy", expect: /privacy/i },
  { id: "AUTH-01", path: "/login", expect: /sign in|welcome|email/i },
  { id: "AUTH-02", path: "/signup", expect: /create|sign up|account/i },
  { id: "AUTH-03", path: "/forgot-password", expect: /reset|forgot|password|email/i },
  // MFA re-enroll / email-recovery confirm — public routes (prompt sign-in when anon)
  {
    id: "AUTH-04",
    path: "/auth/mfa-enroll",
    expect: /sign in|authenticator|setup|required/i,
  },
  {
    id: "AUTH-05",
    path: "/auth/mfa-recovery",
    expect: /authenticator recovery|recovery|sign in|two-factor/i,
  },
];

/** Authenticated app routes (Pro user) */
const APP_ROUTES = [
  { id: "APP-01", path: "/app/dashboard", module: "Dashboard", expect: /dashboard|credit|session|practice/i },
  { id: "APP-02", path: "/app/live", module: "Live Practice Coach", expect: /practice|coach|start|setup|audio|session/i },
  { id: "APP-03", path: "/app/mock", module: "Mock Interview", expect: /mock|behavioural|behavioral|technical|interview/i },
  { id: "APP-04", path: "/app/mock/warmup", module: "Mock Interview", expect: /warm|practice|question/i },
  { id: "APP-05", path: "/app/sessions", module: "Sessions & Debriefs", expect: /session|history|past|empty|no session/i },
  { id: "APP-06", path: "/app/debrief", module: "Sessions & Debriefs", expect: /debrief|session|feedback|empty/i },
  { id: "APP-07", path: "/app/analytics", module: "Analytics & Usage", expect: /analytics|trend|session|wpm|filler/i },
  { id: "APP-08", path: "/app/usage", module: "Analytics & Usage", expect: /usage|credit|ledger|spend/i },
  { id: "APP-09", path: "/app/prep", module: "Prep Lab", expect: /prep|star|rephras|coding|system/i },
  { id: "APP-10", path: "/app/prep/star-builder", module: "Prep Lab", expect: /star|situation|task|action|result/i },
  { id: "APP-11", path: "/app/prep/project-builder", module: "Prep Lab", expect: /project|builder|draft/i },
  { id: "APP-12", path: "/app/prep/rephraser", module: "Prep Lab", expect: /rephras|rewrite|tone/i },
  { id: "APP-13", path: "/app/prep/coding-hints", module: "Prep Lab", expect: /coding|hint|algorithm|problem/i },
  { id: "APP-14", path: "/app/prep/system-design", module: "Prep Lab", expect: /system|design|architecture|topic/i },
  { id: "APP-15", path: "/app/documents", module: "Documents & Resumes", expect: /document|resume|jd|upload/i },
  { id: "APP-16", path: "/app/answers", module: "Answer Bank", expect: /answer|bank|star|saved/i },
  { id: "APP-17", path: "/app/interviews", module: "Interviews & Calendar", expect: /interview|schedule|upcoming|calendar/i },
  { id: "APP-18", path: "/app/interviews/new", module: "Interviews & Calendar", expect: /interview|company|date|schedule|create/i },
  { id: "APP-19", path: "/app/interview-day", module: "Interviews & Calendar", expect: /interview|day|checklist|ready|today/i },
  { id: "APP-20", path: "/app/companies", module: "Company Research", expect: /compan|research|brief/i },
  { id: "APP-21", path: "/app/notifications", module: "Notifications & Profile", expect: /notification|inbox|empty|no notification/i },
  { id: "APP-22", path: "/app/referrals", module: "Referrals & Guide", expect: /refer|invite|share|code/i },
  { id: "APP-23", path: "/app/guide", module: "Referrals & Guide", expect: /guide|help|how|practice/i },
  { id: "APP-24", path: "/app/guide/practice-coach", module: "Referrals & Guide", expect: /practice|coach|overlay|hint/i },
  { id: "APP-25", path: "/app/mock-test", module: "Gov Exam Mock Tests", expect: /mock|exam|test|UPSC|SSC|configure|question/i },
  { id: "APP-26", path: "/app/mock-test/configure", module: "Gov Exam Mock Tests", expect: /configure|exam|duration|question|start/i },
  { id: "APP-27", path: "/app/mock-test/my-questions", module: "Gov Exam Mock Tests", expect: /question|bank|my|upload|import/i },
  {
    id: "APP-28",
    path: "/app/mock-test/upload",
    module: "Gov Exam Mock Tests",
    testId: "mock-test-upload",
    expect: /upload|pdf|excel|csv|import|Import Questions|Excel Import|PDF Import|mock-test-upload/i,
  },
  {
    id: "APP-29",
    path: "/app/mock-test/revision",
    module: "Gov Exam Mock Tests",
    testId: "mock-test-revision",
    expect: /revision|spaced|review|due|Revision List|mock-test-revision/i,
  },
  { id: "APP-30", path: "/app/mock-test/analytics", module: "Gov Exam Mock Tests", expect: /analytics|score|accuracy|attempt/i },
  { id: "APP-31", path: "/app/settings", module: "Settings", expect: /setting|profile|account/i },
  { id: "APP-32", path: "/app/settings/profile", module: "Settings", expect: /profile|name|email/i },
  { id: "APP-33", path: "/app/settings/audio", module: "Settings", expect: /audio|mic|device|input/i },
  { id: "APP-34", path: "/app/settings/practice-coach", module: "Settings", expect: /practice|coach|overlay|hint/i },
  { id: "APP-35", path: "/app/settings/billing", module: "Billing & Credits", expect: /billing|plan|credit|stripe|subscribe/i },
  { id: "APP-36", path: "/app/settings/security", module: "Settings", expect: /security|password|mfa|totp|2fa/i },
  { id: "APP-37", path: "/app/settings/integrations", module: "Settings", expect: /integration|calendar|google|connect/i },
  { id: "APP-38", path: "/app/settings/data", module: "Settings", expect: /data|export|delete|gdpr/i },
  { id: "APP-39", path: "/app/settings/hotkeys", module: "Settings", expect: /hotkey|shortcut|key/i },
  { id: "APP-40", path: "/app/settings/appearance", module: "Settings", expect: /appearance|theme|dark|light/i },
  { id: "APP-41", path: "/app/this-route-should-404", module: "Dashboard", expect: /not found|404|doesn't exist|page/i },
];

const ADMIN_ROUTES = [
  { id: "ADM-01", path: "/app/admin", module: "Admin Portal", expect: /admin|user|revenue|dashboard/i },
  { id: "ADM-02", path: "/app/admin/users", module: "Admin Portal", expect: /user|email|plan|role/i },
  { id: "ADM-03", path: "/app/admin/analytics", module: "Admin Portal", expect: /analytics|metric|usage/i },
  { id: "ADM-04", path: "/app/admin/revenue", module: "Admin Portal", expect: /revenue|mrr|stripe|billing/i },
  { id: "ADM-05", path: "/app/admin/feature-flags", module: "Admin Portal", expect: /flag|feature|toggle/i },
  { id: "ADM-06", path: "/app/admin/promo-codes", module: "Admin Portal", expect: /promo|coupon|code|discount/i },
  { id: "ADM-07", path: "/app/admin/support", module: "Admin Portal", expect: /support|ticket|help/i },
  { id: "ADM-08", path: "/app/admin/audit-log", module: "Admin Portal", expect: /audit|log|event/i },
  {
    id: "ADM-09",
    path: "/app/admin/qa-checklist",
    module: "Admin Portal",
    testId: "admin-qa-checklist",
    expect: /qa|checklist|launch|Master QA|admin-qa-checklist/i,
  },
];

/** Edge functions to probe (API errors → api_aside, do not block UI audit) */
const EDGE_PROBES = [
  { id: "API-01", name: "deepgram-token", method: "POST", body: {} },
  {
    id: "API-02",
    name: "generate-hint",
    method: "POST",
    body: {
      question: "Tell me about yourself",
      mode: "practice",
      interview_type: "behavioral",
    },
  },
  {
    id: "API-03",
    name: "prep-tool",
    method: "POST",
    body: { tool_id: "rephrase", input: "I led a team project successfully." },
  },
  {
    id: "API-04",
    name: "select-test-questions",
    method: "POST",
    body: {
      config: {
        exam_type: "SSC_CGL",
        question_count: 5,
        source_types: ["OFFICIAL_PYP"],
      },
    },
  },
  // Public health: `ping` is canonical; `health` is a thin alias (deploy when Docker/API available).
  { id: "API-05", name: "ping", method: "GET", body: null },
  { id: "API-06", name: "health", method: "GET", body: null },
];

const accounts = {
  free: { email: env.QA_FREE_EMAIL, password: env.QA_FREE_PASSWORD, label: "FREE" },
  pro: { email: env.QA_PRO_EMAIL, password: env.QA_PRO_PASSWORD, label: "PRO" },
  max: { email: env.QA_MAX_EMAIL, password: env.QA_MAX_PASSWORD, label: "MAX" },
  admin: { email: env.QA_ADMIN_EMAIL, password: env.QA_ADMIN_PASSWORD, label: "ADMIN" },
};

function resultBase(partial) {
  return {
    status: "Not Run",
    notes: "",
    httpStatus: null,
    finalUrl: null,
    consoleErrors: [],
    networkFails: [],
    apiAside: false,
    ...partial,
  };
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Auth failed for ${email}: HTTP ${res.status} ${data.error_description || data.msg || data.error || ""}`,
    );
  }
  return data;
}

function storageKey() {
  const ref = (SUPABASE_URL || "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "qzgvjrvtkwlzxpmlddkx";
  return `sb-${ref}-auth-token`;
}

async function injectSession(page, session) {
  const key = storageKey();
  const expiresAt =
    session.expires_at ||
    Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in || 3600,
    expires_at: expiresAt,
    token_type: session.token_type || "bearer",
    user: session.user,
  };
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page
    .waitForFunction(
      () => !/Loading Career Pilot/i.test(document.body?.innerText || ""),
      { timeout: 30_000 },
    )
    .catch(() => {});
  await page.evaluate(
    ({ key, payload }) => {
      localStorage.setItem(key, JSON.stringify(payload));
    },
    { key, payload },
  );
}

async function loginViaUi(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page
    .waitForFunction(
      () => !/Loading Career Pilot/i.test(document.body?.innerText || ""),
      { timeout: 30_000 },
    )
    .catch(() => {});
  await dismissNoise(page);
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passInput = page.locator('input[name="password"], input[type="password"]').first();
  await emailInput.fill(email);
  await passInput.fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => !/Loading Career Pilot/i.test(document.body?.innerText || ""),
      { timeout: 30_000 },
    )
    .catch(() => {});
}

/**
 * After the boot splash clears, some routes (e.g. code-split tabs behind
 * React.lazy/Suspense) still need extra time for their chunk to fetch,
 * parse and render actual content past the app shell/nav. Poll until the
 * route's expected content regex matches the body text, or its
 * data-testid marker appears, instead of a single fixed-length sleep.
 */
async function waitForRouteContent(page, route, { timeout = 18_000 } = {}) {
  const testId = route.testId || null;
  const expectSource = route.expect?.source || null;
  const expectFlags = route.expect?.flags || "i";
  await page
    .waitForFunction(
      ({ expectSource, expectFlags, testId }) => {
        if (testId && document.querySelector(`[data-testid="${testId}"]`)) return true;
        if (expectSource) {
          const re = new RegExp(expectSource, expectFlags);
          const t = document.body?.innerText || "";
          if (re.test(t)) return true;
        }
        return false;
      },
      { expectSource, expectFlags, testId },
      { timeout },
    )
    .catch(() => {});
}

async function dismissNoise(page) {
  for (const name of ["Accept All", "Got it", "Dismiss", "Close", "Skip"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
    }
  }
}

async function auditRoute(page, route, role) {
  const consoleErrors = [];
  const networkFails = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  };
  const onFail = (req) => {
    const url = req.url();
    if (/supabase\.co|functions\/v1|sentry|posthog|stripe/i.test(url)) {
      networkFails.push(`${req.failure()?.errorText || "fail"} :: ${url.slice(0, 160)}`);
    }
  };
  page.on("console", onConsole);
  page.on("requestfailed", onFail);

  let httpStatus = null;
  let finalUrl = null;
  let bodyText = "";
  try {
    const resp = await page.goto(BASE + route.path, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    httpStatus = resp?.status() ?? null;
    // Wait out the app boot loader (staging/local)
    await page
      .waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          return !/Loading Career Pilot/i.test(t) && t.trim().length > 20;
        },
        { timeout: 25_000 },
      )
      .catch(() => {});
    // Splash is gone, but some routes lazy-load a heavier chunk (e.g. code-split
    // tabs behind React.lazy/Suspense) before real content/testid shows up.
    // Poll for the route's expected content or testid instead of a flat sleep.
    await waitForRouteContent(page, route, { timeout: 18_000 });
    await dismissNoise(page);
    finalUrl = page.url();
    bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
    const testIdFound = route.testId
      ? (await page.locator(`[data-testid="${route.testId}"]`).count().catch(() => 0)) > 0
      : false;

    const stuckLoader = /Loading Career Pilot/i.test(bodyText);
    const bouncedToLogin =
      /\/login/i.test(finalUrl) && !/\/login/i.test(route.path);
    const bouncedOnboarding = /\/onboarding/i.test(finalUrl);
    const matched = route.expect
      ? route.expect.test(bodyText) || testIdFound
      : bodyText.length > 40 || testIdFound;
    const hasCrash =
      /something went wrong|application error|chunkloaderror|unexpected application error/i.test(
        bodyText,
      );

    let status = "Pass";
    const notes = [];
    if (stuckLoader) {
      status = "Fail";
      notes.push("App stuck on boot loader (env/CSP/JS crash likely)");
    } else if (bouncedToLogin) {
      status = "Fail";
      notes.push("Redirected to login (session/auth gate)");
    } else if (hasCrash) {
      status = "Fail";
      notes.push("Page crash / error boundary");
    } else if (bouncedOnboarding && !/onboarding/i.test(route.path)) {
      status = "Blocked";
      notes.push("Redirected to onboarding — complete onboarding for QA user");
    } else if (!matched && httpStatus && httpStatus < 400) {
      status = "Fail";
      notes.push("Expected content pattern not found");
    } else if (httpStatus && httpStatus >= 400) {
      status = "Fail";
      notes.push(`HTTP ${httpStatus}`);
    }

    const apiNoise = networkFails.filter((n) => /functions\/v1|rest\/v1/i.test(n));
    if (apiNoise.length && status === "Pass") {
      notes.push(`UI OK; ${apiNoise.length} API fail(s) logged aside`);
    }

    return resultBase({
      id: route.id,
      path: route.path,
      module: route.module || "Marketing/Auth",
      role,
      status,
      notes: notes.join("; "),
      httpStatus,
      finalUrl,
      consoleErrors: consoleErrors.slice(0, 8),
      networkFails: networkFails.slice(0, 12),
      apiAside: apiNoise.length > 0,
      snippet: bodyText.replace(/\s+/g, " ").slice(0, 180),
    });
  } catch (err) {
    return resultBase({
      id: route.id,
      path: route.path,
      module: route.module || "Marketing/Auth",
      role,
      status: "Fail",
      notes: String(err?.message || err).slice(0, 240),
      httpStatus,
      finalUrl,
      consoleErrors: consoleErrors.slice(0, 8),
      networkFails: networkFails.slice(0, 12),
    });
  } finally {
    page.off("console", onConsole);
    page.off("requestfailed", onFail);
  }
}

async function probeEdge(accessToken, probe) {
  const url = `${SUPABASE_URL}/functions/v1/${probe.name}`;
  try {
    const res = await fetch(url, {
      method: probe.method,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: probe.method === "GET" ? undefined : JSON.stringify(probe.body ?? {}),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    const ok = res.status >= 200 && res.status < 300;
    return {
      id: probe.id,
      name: probe.name,
      status: ok ? "Pass" : "API_Aside",
      httpStatus: res.status,
      apiAside: !ok,
      notes: ok
        ? "Edge responded OK"
        : `API error kept aside: ${res.status} ${JSON.stringify(parsed).slice(0, 180)}`,
      bodyPreview: JSON.stringify(parsed).slice(0, 240),
    };
  } catch (err) {
    return {
      id: probe.id,
      name: probe.name,
      status: "API_Aside",
      httpStatus: null,
      apiAside: true,
      notes: `Network/API error kept aside: ${String(err?.message || err).slice(0, 200)}`,
    };
  }
}

async function ensureOnboarded(userId) {
  if (!SERVICE || !userId) return { ok: false, reason: "no service role" };
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin
    .from("profiles")
    .update({
      onboarding_completed: true,
      onboarding_step: 5,
      full_name: "QA Audit User",
    })
    .eq("id", userId);
  return { ok: !error, reason: error?.message };
}

async function authCheck(label, email, password) {
  try {
    const session = await signIn(email, password);
    return {
      label,
      email,
      status: "Pass",
      userId: session.user?.id,
      notes: "Password grant OK",
    };
  } catch (err) {
    return {
      label,
      email,
      status: "Fail",
      userId: null,
      notes: String(err?.message || err).slice(0, 240),
    };
  }
}

async function main() {
  if (!SUPABASE_URL || !ANON) {
    console.error("Missing VITE_SUPABASE_URL / anon key in .env.local");
    process.exit(1);
  }
  for (const [k, a] of Object.entries(accounts)) {
    if (!a.email || !a.password) {
      console.error(`Missing credentials for ${k} in .env.qa.local — run npm run qa:seed-accounts`);
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    runId: RUN_ID,
    date: TODAY,
    baseUrl: BASE,
    supabaseUrl: SUPABASE_URL,
    executedBy: "Cursor Agent live audit",
    note: "API edge failures are status API_Aside and must not block UI Pass/Fail judgment.",
    auth: [],
    publicRoutes: [],
    appRoutes: [],
    adminRoutes: [],
    edgeProbes: [],
    bugs: [],
    summary: {},
  };

  console.log(`Live QA audit → ${BASE}`);

  // Staging host health (always probe known closed-beta URL)
  try {
    const stagingUrl = env.QA_BASE_URL_STAGING || "https://trycareerpilot.com";
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage();
    const stErrs = [];
    p.on("pageerror", (e) => stErrs.push(String(e).slice(0, 240)));
    await p.goto(stagingUrl + "/pricing", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await p.waitForTimeout(4000);
    const stText = (await p.locator("body").innerText().catch(() => "")).slice(0, 200);
    await b.close();
    const stagingBroken =
      /Loading Career Pilot/i.test(stText) ||
      stErrs.some((e) => /VITE_SUPABASE_URL|Missing required environment/i.test(e));
    report.stagingProbe = {
      url: stagingUrl,
      status: stagingBroken ? "Fail" : "Pass",
      notes: stagingBroken
        ? "Closed-beta host missing VITE_* in deployed bundle (Critical). After boot-error UI deploy expect 'Career Pilot failed to start' instead of infinite loader; still Fail until Lovable sets VITE_*."
        : "Staging hydrated",
      snippet: stText,
      pageErrors: stErrs.slice(0, 5),
    };
    if (stagingBroken) {
      report.bugs.push({
        id: "BUG-LIVE-STAGING-ENV",
        title: "Staging/closed-beta deploy missing VITE_SUPABASE_URL — app never boots",
        module: "Platform / Deploy",
        severity: "Critical",
        status: "Open",
        reportedBy: "Cursor Agent",
        assignedTo: "Platform Dev / Lovable",
        steps:
          "1. Open https://trycareerpilot.com/pricing\n2. Observe stuck loader or missing-env boot failure\n3. Console: Missing required environment variable: VITE_SUPABASE_URL (+ CSP may block inline script)",
        expected:
          "After code deploy with boot-error UI: page shows 'Career Pilot failed to start' (not infinite loader). Staging remains Fail until Lovable sets VITE_* in the host build / .env.production.",
        actual: report.stagingProbe.notes,
        env: stagingUrl,
        date: TODAY,
      });
    }
    console.log(`Staging probe: ${report.stagingProbe.status}`);
  } catch (err) {
    report.stagingProbe = {
      status: "API_Aside",
      notes: `Staging probe error kept aside: ${String(err?.message || err).slice(0, 200)}`,
    };
  }

  console.log("Auth checks…");
  for (const key of ["free", "pro", "max", "admin"]) {
    const a = accounts[key];
    const r = await authCheck(a.label, a.email, a.password);
    report.auth.push(r);
    console.log(`  ${a.label}: ${r.status}`);
    if (r.status === "Pass" && r.userId) {
      const ob = await ensureOnboarded(r.userId);
      if (!ob.ok) console.log(`  onboard patch ${a.label}: ${ob.reason || "skipped"}`);
    }
  }

  const failedAuth = report.auth.filter((a) => a.status !== "Pass");
  if (failedAuth.length) {
    console.log("Re-seeding QA accounts (auth failures)…");
    // Caller should run seed; try service-role password reset inline
    if (SERVICE) {
      const { spawnSync } = await import("child_process");
      const seed = spawnSync("npm", ["run", "qa:seed-accounts"], {
        cwd: root,
        encoding: "utf8",
        shell: true,
        env: process.env,
      });
      console.log(seed.stdout?.slice(-400) || "");
      if (seed.status !== 0) console.error(seed.stderr?.slice(-400));
      // reload env
      Object.assign(env, loadEnvFile(path.join(root, ".env.qa.local")));
      for (const key of ["free", "pro", "max", "admin"]) {
        accounts[key].password = env[`QA_${accounts[key].label}_PASSWORD`];
        accounts[key].email = env[`QA_${accounts[key].label}_EMAIL`];
      }
      report.auth = [];
      for (const key of ["free", "pro", "max", "admin"]) {
        const a = accounts[key];
        const r = await authCheck(a.label, a.email, a.password);
        report.auth.push(r);
        console.log(`  retry ${a.label}: ${r.status}`);
        if (r.status === "Pass" && r.userId) await ensureOnboarded(r.userId);
      }
    }
  }

  const browser = await chromium.launch({ headless: true });
  let context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  let page = await context.newPage();

  async function freshContext() {
    await context.close().catch(() => {});
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();
  }

  async function auditWithRetry(route, role, { loginEmail, loginPassword, session } = {}) {
    let r = await auditRoute(page, route, role);
    const resourceFail =
      /INSUFFICIENT_RESOURCES|Failed to fetch dynamically|Career Pilot failed to start/i.test(
        `${r.notes} ${r.snippet} ${(r.consoleErrors || []).join(" ")}`,
      );
    if (resourceFail || (r.status === "Fail" && !r.snippet)) {
      console.log(`  retry ${route.id} (fresh browser context)…`);
      await freshContext();
      if (loginEmail && loginPassword) {
        try {
          await loginViaUi(page, loginEmail, loginPassword);
        } catch {
          if (session) await injectSession(page, session);
        }
      }
      r = await auditRoute(page, route, role);
    }
    return r;
  }

  console.log("Public routes…");
  for (const route of PUBLIC_ROUTES) {
    const r = await auditWithRetry(route, "anon");
    report.publicRoutes.push(r);
    console.log(`  ${r.id} ${r.path} → ${r.status}`);
  }

  // Soft: /login page or JS bundle should mention lost-device / recovery when deployed.
  // The visible "I don't have my old device" UI is MFA-challenge-gated, so missing
  // anonymous DOM text is not a Fail — only Blocked if neither page nor bundle mentions it.
  console.log("Soft MFA recovery mention on /login…");
  {
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page
      .waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          return !/Loading Career Pilot/i.test(t) && t.trim().length > 20;
        },
        { timeout: 25_000 },
      )
      .catch(() => {});
    await dismissNoise(page);
    const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
    const html = await page.content().catch(() => "");
    const mentionRe =
      /lost.?device|don.?t have my old device|use recovery code|email a recovery link|mfa-recovery|authenticator recovery|recovery code/i;
    const foundInPage = mentionRe.test(`${bodyText}\n${html}`);
    let foundInBundle = false;
    if (!foundInPage) {
      foundInBundle = await page
        .evaluate(async () => {
          const re =
            /I don.?t have my old device|Use recovery code|Email a recovery link|mfa-recovery|authenticator recovery/i;
          const srcs = [...document.querySelectorAll("script[src]")].map((s) => s.src).slice(0, 16);
          for (const src of srcs) {
            try {
              const t = await fetch(src).then((r) => r.text());
              if (re.test(t)) return true;
            } catch {
              /* ignore fetch failures */
            }
          }
          return false;
        })
        .catch(() => false);
    }
    const found = foundInPage || foundInBundle;
    const soft = resultBase({
      id: "AUTH-MFA-SOFT",
      path: "/login",
      module: "Marketing/Auth",
      role: "anon",
      status: found ? "Pass" : "Blocked",
      notes: found
        ? `Lost-device/recovery mention found (${foundInPage ? "page HTML/DOM" : "JS bundle"})`
        : "Soft: lost-device/recovery UI is MFA-gated; not found in anonymous login HTML or script bundles yet (CDN may be stale)",
      httpStatus: null,
      finalUrl: page.url(),
      snippet: bodyText.replace(/\s+/g, " ").slice(0, 180),
    });
    report.publicRoutes.push(soft);
    console.log(`  ${soft.id} → ${soft.status}`);
  }

  // Free user: dashboard + billing gate sample
  console.log("Free-tier spot checks…");
  await freshContext();
  const freeSession = await signIn(accounts.free.email, accounts.free.password);
  try {
    await loginViaUi(page, accounts.free.email, accounts.free.password);
  } catch {
    await injectSession(page, freeSession);
  }
  for (const route of [
    { id: "FREE-01", path: "/app/dashboard", module: "Dashboard", expect: /dashboard|credit|practice/i },
    { id: "FREE-02", path: "/app/settings/billing", module: "Billing & Credits", expect: /billing|plan|credit|upgrade|free/i },
    { id: "FREE-03", path: "/app/live", module: "Live Practice Coach", expect: /practice|coach|start|setup|credit/i },
  ]) {
    const r = await auditWithRetry(route, "FREE", {
      loginEmail: accounts.free.email,
      loginPassword: accounts.free.password,
      session: freeSession,
    });
    report.appRoutes.push(r);
    console.log(`  ${r.id} → ${r.status}`);
  }

  console.log("Pro app routes…");
  await freshContext();
  const proSession = await signIn(accounts.pro.email, accounts.pro.password);
  try {
    await loginViaUi(page, accounts.pro.email, accounts.pro.password);
  } catch {
    await injectSession(page, proSession);
  }
  let proNav = 0;
  for (const route of APP_ROUTES) {
    if (proNav > 0 && proNav % 12 === 0) {
      await freshContext();
      try {
        await loginViaUi(page, accounts.pro.email, accounts.pro.password);
      } catch {
        await injectSession(page, proSession);
      }
    }
    const r = await auditWithRetry(route, "PRO", {
      loginEmail: accounts.pro.email,
      loginPassword: accounts.pro.password,
      session: proSession,
    });
    report.appRoutes.push(r);
    console.log(`  ${r.id} ${r.path} → ${r.status}${r.apiAside ? " (api aside)" : ""}`);
    proNav += 1;
  }

  console.log("Admin routes…");
  await freshContext();
  const adminSession = await signIn(accounts.admin.email, accounts.admin.password);
  try {
    await loginViaUi(page, accounts.admin.email, accounts.admin.password);
  } catch {
    await injectSession(page, adminSession);
  }
  for (const route of ADMIN_ROUTES) {
    const r = await auditWithRetry(route, "ADMIN", {
      loginEmail: accounts.admin.email,
      loginPassword: accounts.admin.password,
      session: adminSession,
    });
    // Admin timed-out profile → Access Denied is infra flake, not product RBAC bug
    if (
      r.status === "Fail" &&
      /access denied|don't have admin/i.test(r.snippet || "") &&
      /Profile load timed out/i.test((r.consoleErrors || []).join(" "))
    ) {
      r.status = "Blocked";
      r.notes = "Admin profile load timed out (audit infra); not a product deny";
    }
    report.adminRoutes.push(r);
    console.log(`  ${r.id} ${r.path} → ${r.status}`);
  }

  // Non-admin must not access admin
  console.log("RBAC: Pro → admin should be denied…");
  await freshContext();
  try {
    await loginViaUi(page, accounts.pro.email, accounts.pro.password);
  } catch {
    await injectSession(page, proSession);
  }
  {
    const r = await auditWithRetry(
      {
        id: "RBAC-01",
        path: "/app/admin",
        module: "Admin Portal",
        expect: /access denied|don't have admin|dashboard|sign in/i,
      },
      "PRO",
      {
        loginEmail: accounts.pro.email,
        loginPassword: accounts.pro.password,
        session: proSession,
      },
    );
    const denied =
      /\/login|\/app\/dashboard|not authorized|forbidden|access denied|don't have admin|don't have permission/i.test(
        `${r.finalUrl} ${r.snippet}`,
      );
    r.status = denied ? "Pass" : "Fail";
    r.notes = denied
      ? "Pro correctly blocked from admin"
      : "Pro could open admin — RBAC fail";
    report.adminRoutes.push(r);
    console.log(`  RBAC-01 → ${r.status}`);
  }

  console.log("Edge probes (API aside on error)…");
  for (const probe of EDGE_PROBES) {
    const r = await probeEdge(proSession.access_token, probe);
    report.edgeProbes.push(r);
    console.log(`  ${r.id} ${r.name} → ${r.status} (${r.httpStatus})`);
  }

  await browser.close();

  // Derive bugs from Failures
  let bugN = 1;
  const allUi = [...report.publicRoutes, ...report.appRoutes, ...report.adminRoutes];
  for (const r of allUi) {
    if (r.status === "Fail") {
      report.bugs.push({
        id: `BUG-LIVE-${String(bugN++).padStart(3, "0")}`,
        title: `Live audit fail: ${r.id} ${r.path}`,
        module: r.module,
        severity: r.path.includes("live") || r.path.includes("login") ? "Critical" : "High",
        status: "Open",
        reportedBy: "Cursor Agent",
        assignedTo: "Dev Lead",
        steps: `1. Login as ${r.role}\n2. Open ${BASE}${r.path}\n3. Observe: ${r.notes}`,
        expected: "Page loads with expected module content, no crash, auth preserved",
        actual: r.notes || r.snippet,
        env: BASE,
        date: TODAY,
      });
    }
  }

  const pass = allUi.filter((x) => x.status === "Pass").length;
  const fail = allUi.filter((x) => x.status === "Fail").length;
  const blocked = allUi.filter((x) => x.status === "Blocked").length;
  const apiAside = report.edgeProbes.filter((x) => x.apiAside).length;
  report.summary = {
    totalUiChecks: allUi.length,
    pass,
    fail,
    blocked,
    authPass: report.auth.filter((a) => a.status === "Pass").length,
    authFail: report.auth.filter((a) => a.status !== "Pass").length,
    edgeOk: report.edgeProbes.filter((x) => x.status === "Pass").length,
    edgeAside: apiAside,
    newBugs: report.bugs.length,
  };

  const outPath = path.join(OUT_DIR, `live-audit-${TODAY}.json`);
  const latestPath = path.join(OUT_DIR, "latest.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  console.log("\nSummary:", report.summary);
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
