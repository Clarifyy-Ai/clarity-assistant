#!/usr/bin/env node
/**
 * Deep live UI QA audit — covers checklist items previously Blocked as
 * "not covered by automated route audit".
 *
 * Credentials: .env.qa.local (never prints passwords)
 * Output: qa-audit-results/ui-deep-audit-latest.json
 *
 * Usage:
 *   node --use-system-ca scripts/run-live-ui-deep-audit.mjs
 *   QA_BASE_URL=http://localhost:5000 node --use-system-ca scripts/run-live-ui-deep-audit.mjs
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

async function pickBaseUrl() {
  if (process.env.QA_BASE_URL) return process.env.QA_BASE_URL;
  for (const candidate of [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(2500) });
      const text = await res.text();
      if (res.ok && /Clarify|clarity-assistant|Loading Clarify/i.test(text)) {
        console.log(`Preferring local Vite at ${candidate}`);
        return candidate;
      }
    } catch {
      /* not up */
    }
  }
  return (
    env.QA_BASE_URL_STAGING || "https://clarify.ai.sltfinanceindia.com"
  );
}

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const TODAY = new Date().toISOString().slice(0, 10);
const RUN_ID = `ui-deep-${TODAY}-${Date.now().toString(36)}`;

const accounts = {
  free: { email: env.QA_FREE_EMAIL, password: env.QA_FREE_PASSWORD, label: "FREE" },
  pro: { email: env.QA_PRO_EMAIL, password: env.QA_PRO_PASSWORD, label: "PRO" },
  max: { email: env.QA_MAX_EMAIL, password: env.QA_MAX_PASSWORD, label: "MAX" },
  admin: { email: env.QA_ADMIN_EMAIL, password: env.QA_ADMIN_PASSWORD, label: "ADMIN" },
};

/** CSP structured-data noise on stale tip — ignore in severe console checks */
const IGNORE_CONSOLE = [
  /structured-data/i,
  /Refused to execute inline script.*Content Security Policy/i,
  /Failed to load resource:.*favicon/i,
  /Download the React DevTools/i,
  /\[PostHog\]/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
  /ResizeObserver loop/i,
];

function isSevereConsole(text) {
  if (!text) return false;
  if (IGNORE_CONSOLE.some((re) => re.test(text))) return false;
  return /TypeError|ReferenceError|ChunkLoadError|Uncaught|Something went wrong|Missing required environment|failed to start/i.test(
    text,
  );
}

function resultBase(partial) {
  return {
    status: "Not Run",
    notes: "",
    httpStatus: null,
    finalUrl: null,
    consoleErrors: [],
    pageErrors: [],
    ...partial,
  };
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
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
  const ref =
    (SUPABASE_URL || "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
    "qzgvjrvtkwlzxpmlddkx";
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
      () => !/Loading Clarify AI/i.test(document.body?.innerText || ""),
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
      () => !/Loading Clarify AI/i.test(document.body?.innerText || ""),
      { timeout: 30_000 },
    )
    .catch(() => {});
  await dismissNoise(page);
  await page.locator('input[name="email"], input[type="email"]').first().fill(email);
  await page.locator('input[name="password"], input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => !/Loading Clarify AI/i.test(document.body?.innerText || ""),
      { timeout: 30_000 },
    )
    .catch(() => {});
}

async function dismissNoise(page) {
  await page
    .evaluate(() => {
      try {
        localStorage.setItem("clarify_cookie_consent", "accepted");
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
  for (const name of ["Accept All", "Got it", "Dismiss", "Close", "Skip"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
    }
  }
}

async function waitBoot(page) {
  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || "";
        return !/Loading Clarify AI/i.test(t) && t.trim().length > 20;
      },
      { timeout: 30_000 },
    )
    .catch(() => {});
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

let BASE = "https://clarify.ai.sltfinanceindia.com";

/**
 * Navigate + collect console/page errors. Returns body text + metadata.
 */
async function gotoCollect(page, urlPath, { timeout = 45_000 } = {}) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  };
  const onPage = (err) => pageErrors.push(String(err?.message || err).slice(0, 300));
  page.on("console", onConsole);
  page.on("pageerror", onPage);
  let httpStatus = null;
  let finalUrl = null;
  let bodyText = "";
  try {
    const resp = await page.goto(BASE + urlPath, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    httpStatus = resp?.status() ?? null;
    await waitBoot(page);
    await page.waitForTimeout(800);
    await dismissNoise(page);
    finalUrl = page.url();
    bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 5000);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPage);
  }
  const severe = [...consoleErrors, ...pageErrors].filter(isSevereConsole);
  return { httpStatus, finalUrl, bodyText, consoleErrors, pageErrors, severe };
}

function failIfBlankOrCrash({ bodyText, httpStatus, finalUrl, path: p }) {
  const notes = [];
  if (/Loading Clarify AI/i.test(bodyText)) notes.push("Stuck on boot loader");
  if (/something went wrong|application error|chunkloaderror|unexpected application error/i.test(bodyText)) {
    notes.push("Crash / error boundary");
  }
  if (/\/login/i.test(finalUrl || "") && !/\/login/i.test(p)) notes.push("Bounced to login");
  if (httpStatus && httpStatus >= 500) notes.push(`HTTP ${httpStatus}`);
  const trimmed = (bodyText || "").replace(/\s+/g, " ").trim();
  if (trimmed.length < 30) notes.push("Blank / near-empty page");
  return notes;
}

async function check(id, module, fn) {
  try {
    const r = await fn();
    return resultBase({ id, module, ...r });
  } catch (err) {
    return resultBase({
      id,
      module,
      status: "Fail",
      notes: String(err?.message || err).slice(0, 240),
    });
  }
}

async function main() {
  BASE = await pickBaseUrl();

  if (!SUPABASE_URL || !ANON) {
    console.error("Missing VITE_SUPABASE_URL / anon key in .env.local");
    process.exit(1);
  }
  for (const [k, a] of Object.entries(accounts)) {
    if (!a.email || !a.password) {
      console.error(`Missing credentials for ${k} in .env.qa.local`);
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    runId: RUN_ID,
    date: TODAY,
    baseUrl: BASE,
    supabaseUrl: SUPABASE_URL,
    executedBy: "Cursor Agent UI deep audit",
    note: "Deep UI checks for previously Blocked checklist items. Severe console ignores known CSP structured-data on stale tip.",
    checks: [],
    bugs: [],
    summary: {},
    remainingManual: [
      "OAuth / Google Calendar connect (requires live secrets + human consent)",
      "Stripe / Razorpay checkout purchase flow (real payment)",
      "Email delivery (reset / verify) inbox verification",
      "Desktop Electron overlay + global hotkeys",
      "Mic / Deepgram live STT quality judgment",
      "Cross-browser Safari / Firefox visual QA",
    ],
  };

  console.log(`UI deep audit → ${BASE}`);

  // Onboard all QA users
  for (const key of ["free", "pro", "max", "admin"]) {
    const a = accounts[key];
    try {
      const session = await signIn(a.email, a.password);
      if (session.user?.id) await ensureOnboarded(session.user.id);
      console.log(`  auth ${a.label}: OK`);
    } catch (err) {
      console.error(`  auth ${a.label}: FAIL ${String(err.message).slice(0, 120)}`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  let context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  let page = await context.newPage();

  async function freshContext(viewport = { width: 1440, height: 900 }) {
    await context.close().catch(() => {});
    context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
    page = await context.newPage();
  }

  async function loginAs(roleKey) {
    const a = accounts[roleKey];
    const session = await signIn(a.email, a.password);
    try {
      await loginViaUi(page, a.email, a.password);
    } catch {
      await injectSession(page, session);
    }
    return session;
  }

  // ─── FREE: companies upgrade gate + dashboard + bottom nav / More ───
  console.log("FREE deep checks…");
  await freshContext();
  await loginAs("free");

  report.checks.push(
    await check("DEEP-FREE-01", "Company Research", async () => {
      const g = await gotoCollect(page, "/app/companies");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/companies" });
      const gate =
        /upgrade|pro feature|requires? pro|unlock this feature|plan/i.test(g.bodyText) ||
        (await page.locator('button:has-text("Upgrade"), [aria-label*="Upgrade"]').count()) > 0;
      const not500 = !(g.httpStatus >= 500);
      const ok = not500 && notes.length === 0 && (gate || /compan/i.test(g.bodyText));
      // Prefer seeing an upgrade gate for Free; still Pass if page loads with company UI
      // (gate may be blur overlay with "Pro Feature")
      let status = "Pass";
      const n = [...notes];
      if (!not500 || notes.some((x) => /Crash|Blank|Stuck|HTTP 5/.test(x))) {
        status = "Fail";
      } else if (!gate) {
        status = "Fail";
        n.push("Free /app/companies missing upgrade gate (expected PlanGate / Upgrade CTA)");
      } else {
        n.push("Upgrade gate present for Free");
      }
      return {
        path: "/app/companies",
        role: "FREE",
        status,
        notes: n.join("; "),
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        pageErrors: g.pageErrors.slice(0, 5),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 200),
      };
    }),
  );

  report.checks.push(
    await check("DEEP-FREE-02", "Dashboard", async () => {
      const g = await gotoCollect(page, "/app/dashboard");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/dashboard" });
      const matched = /dashboard|credit|practice|session/i.test(g.bodyText);
      const status =
        notes.length === 0 && matched ? "Pass" : "Fail";
      if (!matched) notes.push("Expected dashboard content missing");
      return {
        path: "/app/dashboard",
        role: "FREE",
        status,
        notes: notes.join("; ") || "Dashboard OK",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  // Mobile bottom nav + More sheet (375px)
  await freshContext({ width: 375, height: 812 });
  await loginAs("free");
  report.checks.push(
    await check("DEEP-FREE-03", "Mobile Nav", async () => {
      const g = await gotoCollect(page, "/app/dashboard");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/dashboard" });
      // Dismiss walkthrough / cookies that can intercept bottom-nav clicks
      await dismissNoise(page);
      for (const sel of [
        '[data-sonner-toast] button',
        'button:has-text("Skip")',
        'button:has-text("Got it")',
        'button:has-text("Accept All")',
        '[aria-label="Close"]',
      ]) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click({ force: true }).catch(() => {});
        }
      }
      const nav = page.locator('nav[aria-label="Mobile navigation"]');
      const navVisible = await nav.isVisible().catch(() => false);
      const home = await nav.getByLabel(/Home/i).isVisible().catch(() => false);
      const moreBtn = page.locator('button[aria-label="More navigation"]');
      const moreVisible = await moreBtn.isVisible().catch(() => false);
      let moreSheetOk = false;
      if (moreVisible) {
        await moreBtn.click({ force: true, timeout: 10_000 }).catch(async () => {
          await moreBtn.evaluate((node) => node.click());
        });
        await page.waitForTimeout(600);
        moreSheetOk =
          (await page.getByRole("heading", { name: /^More$/i }).isVisible().catch(() => false)) ||
          (await page.locator('[role="dialog"]').getByText(/Settings|Documents|Answer|Log out/i).count()) > 0 ||
          (await page.getByText(/^Settings$/).first().isVisible().catch(() => false));
        await page.keyboard.press("Escape").catch(() => {});
      }
      const status =
        notes.length === 0 && navVisible && home && moreVisible && moreSheetOk
          ? "Pass"
          : "Fail";
      if (!navVisible) notes.push("Bottom nav not visible at 375px");
      if (!home) notes.push("Home tab missing");
      if (!moreVisible) notes.push("More button missing");
      if (!moreSheetOk) notes.push("More sheet did not open / missing links");
      return {
        path: "/app/dashboard",
        role: "FREE",
        viewport: "375x812",
        status,
        notes: notes.join("; ") || "Bottom nav + More sheet OK",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 160),
      };
    }),
  );

  // ─── ADMIN loads; PRO denied ───
  console.log("Admin / RBAC…");
  await freshContext();
  await loginAs("admin");
  report.checks.push(
    await check("DEEP-ADM-01", "Admin Portal", async () => {
      const g = await gotoCollect(page, "/app/admin");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/admin" });
      const denied = /access denied/i.test(g.bodyText);
      const adminOk = /admin|user|revenue|dashboard|feature|promo/i.test(g.bodyText) && !denied;
      const status = notes.length === 0 && adminOk ? "Pass" : "Fail";
      if (denied) notes.push("Admin saw Access Denied (role/profile issue)");
      if (!adminOk) notes.push("Admin dashboard content missing");
      return {
        path: "/app/admin",
        role: "ADMIN",
        status,
        notes: notes.join("; ") || "Admin portal loads",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  await freshContext();
  await loginAs("pro");
  report.checks.push(
    await check("DEEP-RBAC-01", "Admin Portal", async () => {
      const g = await gotoCollect(page, "/app/admin");
      const denied =
        /access denied|don't have admin|don't have permission|not authorized/i.test(
          g.bodyText,
        );
      const bounced =
        /\/app\/dashboard/i.test(g.finalUrl || "") &&
        !/\/app\/admin/i.test(g.finalUrl || "");
      const status = denied || bounced ? "Pass" : "Fail";
      return {
        path: "/app/admin",
        role: "PRO",
        status,
        notes: status === "Pass" ? "Pro correctly Access Denied" : "Pro could open admin — RBAC fail",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  // ─── Answer bank: list or EmptyState + search/filter ───
  console.log("Pro content surfaces…");
  report.checks.push(
    await check("DEEP-ANS-01", "Answer Bank", async () => {
      const g = await gotoCollect(page, "/app/answers");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/answers" });
      const hasContent =
        /answer|bank|empty|no saved|star|saved/i.test(g.bodyText) ||
        (await page.locator("text=/No .* yet|Add answer|Search answers/i").count()) > 0;
      const search = await page
        .locator('input[aria-label="Search answers"], input[placeholder*="Search answers"]')
        .count();
      const filters =
        (await page.getByRole("button", { name: /Behavioural|Behavioral|Technical|All/i }).count()) >
        0;
      if (!hasContent) notes.push("Missing list/EmptyState content");
      if (!search) notes.push("Search control missing");
      if (!filters) notes.push("Category filter controls missing");
      const status = notes.length === 0 ? "Pass" : "Fail";
      return {
        path: "/app/answers",
        role: "PRO",
        status,
        notes: notes.join("; ") || "Answer bank list/EmptyState + filters OK",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  // ─── Settings appearance theme controls ───
  report.checks.push(
    await check("DEEP-SET-01", "Settings", async () => {
      const g = await gotoCollect(page, "/app/settings/appearance");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/settings/appearance" });
      const theme =
        /appearance|theme|light|dark|system/i.test(g.bodyText) &&
        ((await page.getByRole("button", { name: /Light|Dark|System/i }).count()) > 0 ||
          (await page.locator("text=/Light|Dark|System/").count()) > 0);
      if (!theme) notes.push("Theme controls missing");
      const status = notes.length === 0 ? "Pass" : "Fail";
      return {
        path: "/app/settings/appearance",
        role: "PRO",
        status,
        notes: notes.join("; ") || "Appearance theme controls present",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  // ─── Invalid route → NotFound ───
  report.checks.push(
    await check("DEEP-404-01", "Not Found", async () => {
      const g = await gotoCollect(page, "/app/this-is-not-a-route");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/this-is-not-a-route" });
      const notFound = /page not found|404|couldn't find|does not exist|doesn't exist/i.test(
        g.bodyText,
      );
      if (!notFound) notes.push("NotFound UI missing");
      const status = notes.length === 0 ? "Pass" : "Fail";
      return {
        path: "/app/this-is-not-a-route",
        role: "PRO",
        status,
        notes: notes.join("; ") || "NotFound UI shown",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  // ─── /app/live: title, back link, mobile notice ───
  report.checks.push(
    await check("DEEP-LIVE-01", "Live Practice Coach", async () => {
      const g = await gotoCollect(page, "/app/live");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/live" });
      const title = /practice coach|live|rehearsal|overlay/i.test(g.bodyText);
      const back =
        (await page.getByRole("link", { name: /back to dashboard|dashboard/i }).count()) > 0 ||
        /Back to dashboard/i.test(g.bodyText);
      if (!title) notes.push("Title / Practice Coach heading missing");
      if (!back) notes.push("Back link missing");
      const status = notes.length === 0 ? "Pass" : "Fail";
      return {
        path: "/app/live",
        role: "PRO",
        status,
        notes: notes.join("; ") || "Live page title + back link OK",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  await freshContext({ width: 375, height: 812 });
  await loginAs("pro");
  report.checks.push(
    await check("DEEP-LIVE-02", "Live Practice Coach", async () => {
      const g = await gotoCollect(page, "/app/live");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/live" });
      const mobileNotice =
        /mobile|desktop app|overlay|best on desktop|limited|floating overlay/i.test(
          g.bodyText,
        );
      if (!mobileNotice) notes.push("Mobile limitation notice missing at 375px");
      const status = notes.length === 0 ? "Pass" : "Fail";
      return {
        path: "/app/live",
        role: "PRO",
        viewport: "375x812",
        status,
        notes: notes.join("; ") || "Mobile limitation notice present",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
        snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
  );

  // ─── sessions / notifications / documents EmptyState or list ───
  await freshContext();
  await loginAs("pro");
  for (const route of [
    {
      id: "DEEP-SESS-01",
      path: "/app/sessions",
      module: "Sessions & Debriefs",
      expect: /session|history|empty|no session|start/i,
    },
    {
      id: "DEEP-NOTIF-01",
      path: "/app/notifications",
      module: "Notifications & Profile",
      expect: /notification|inbox|empty|no notification|remind/i,
    },
    {
      id: "DEEP-DOC-01",
      path: "/app/documents",
      module: "Documents & Resumes",
      expect: /document|resume|jd|upload|empty|no /i,
    },
  ]) {
    report.checks.push(
      await check(route.id, route.module, async () => {
        const g = await gotoCollect(page, route.path);
        const notes = failIfBlankOrCrash({ ...g, path: route.path });
        const matched = route.expect.test(g.bodyText);
        const whiteBlank =
          (g.bodyText || "").trim().length < 40 &&
          !/empty|no /i.test(g.bodyText || "");
        if (!matched) notes.push("Expected EmptyState/list content missing");
        if (whiteBlank) notes.push("Blank white page");
        const status = notes.length === 0 ? "Pass" : "Fail";
        return {
          path: route.path,
          role: "PRO",
          status,
          notes: notes.join("; ") || "List or EmptyState OK",
          httpStatus: g.httpStatus,
          finalUrl: g.finalUrl,
          consoleErrors: g.severe.slice(0, 8),
          snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 180),
        };
      }),
    );
  }

  // ─── Terms / Privacy: not all-caps, left aligned ───
  console.log("Legal typography…");
  await freshContext();
  for (const route of [
    { id: "DEEP-LEGAL-01", path: "/terms", module: "Marketing/Auth" },
    { id: "DEEP-LEGAL-02", path: "/privacy", module: "Marketing/Auth" },
  ]) {
    report.checks.push(
      await check(route.id, route.module, async () => {
        const g = await gotoCollect(page, route.path);
        const notes = failIfBlankOrCrash({ ...g, path: route.path });
        const style = await page.evaluate(() => {
          const article = document.querySelector("article") || document.querySelector("main");
          const p =
            article?.querySelector("p") ||
            document.querySelector(".prose p") ||
            document.querySelector("p");
          if (!p) return null;
          const cs = getComputedStyle(p);
          return {
            textAlign: cs.textAlign,
            textTransform: cs.textTransform,
            sample: (p.textContent || "").slice(0, 80),
          };
        });
        if (!style) {
          notes.push("No body paragraph found for style check");
        } else {
          if (style.textTransform === "uppercase") {
            notes.push("Body text is uppercase (should be sentence case)");
          }
          if (style.textAlign === "center" || style.textAlign === "right") {
            notes.push(`Body text-align is ${style.textAlign} (expected left/start)`);
          }
          const sample = style.sample || "";
          const letters = sample.replace(/[^a-zA-Z]/g, "");
          if (
            letters.length > 20 &&
            letters === letters.toUpperCase() &&
            /[A-Z]/.test(letters)
          ) {
            notes.push("Body sample appears ALL-CAPS");
          }
        }
        const status = notes.length === 0 ? "Pass" : "Fail";
        return {
          path: route.path,
          role: "anon",
          status,
          notes: notes.join("; ") || `Legal prose left-aligned, not all-caps (${style?.textAlign})`,
          httpStatus: g.httpStatus,
          finalUrl: g.finalUrl,
          consoleErrors: g.severe.slice(0, 8),
          style,
          snippet: g.bodyText.replace(/\s+/g, " ").slice(0, 160),
        };
      }),
    );
  }

  // ─── Mobile 375: landing, login, dashboard, bottom nav ───
  console.log("Mobile 375 viewport…");
  await freshContext({ width: 375, height: 812 });
  report.checks.push(
    await check("DEEP-MOB-01", "Marketing/Auth", async () => {
      const g = await gotoCollect(page, "/");
      const notes = failIfBlankOrCrash({ ...g, path: "/" });
      const ok = /Clarify|Practice|interview|Sign/i.test(g.bodyText);
      if (!ok) notes.push("Landing content missing at 375px");
      return {
        path: "/",
        role: "anon",
        viewport: "375x812",
        status: notes.length === 0 ? "Pass" : "Fail",
        notes: notes.join("; ") || "Landing OK at 375px",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
      };
    }),
  );
  report.checks.push(
    await check("DEEP-MOB-02", "Marketing/Auth", async () => {
      const g = await gotoCollect(page, "/login");
      const notes = failIfBlankOrCrash({ ...g, path: "/login" });
      const ok =
        /sign in|email|password/i.test(g.bodyText) &&
        (await page.locator('input[type="email"], input[name="email"]').count()) > 0;
      if (!ok) notes.push("Login form missing at 375px");
      return {
        path: "/login",
        role: "anon",
        viewport: "375x812",
        status: notes.length === 0 ? "Pass" : "Fail",
        notes: notes.join("; ") || "Login OK at 375px",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
      };
    }),
  );
  await loginAs("pro");
  report.checks.push(
    await check("DEEP-MOB-03", "Dashboard", async () => {
      const g = await gotoCollect(page, "/app/dashboard");
      const notes = failIfBlankOrCrash({ ...g, path: "/app/dashboard" });
      const nav = page.locator('nav[aria-label="Mobile navigation"]');
      const navVisible = await nav.isVisible().catch(() => false);
      if (!/dashboard|credit|practice/i.test(g.bodyText)) notes.push("Dashboard content missing");
      if (!navVisible) notes.push("Bottom nav not visible");
      return {
        path: "/app/dashboard",
        role: "PRO",
        viewport: "375x812",
        status: notes.length === 0 ? "Pass" : "Fail",
        notes: notes.join("; ") || "Dashboard + bottom nav OK at 375px",
        httpStatus: g.httpStatus,
        finalUrl: g.finalUrl,
        consoleErrors: g.severe.slice(0, 8),
      };
    }),
  );

  // Console severe sample on a few key pages
  report.checks.push(
    await check("DEEP-CON-01", "Platform / Console", async () => {
      const paths = ["/", "/login", "/app/dashboard", "/pricing"];
      const severeAll = [];
      for (const p of paths) {
        const g = await gotoCollect(page, p);
        for (const s of g.severe) severeAll.push(`${p}: ${s}`);
      }
      const status = severeAll.length === 0 ? "Pass" : "Fail";
      return {
        path: paths.join(", "),
        role: "mixed",
        status,
        notes:
          status === "Pass"
            ? "No severe page/console errors (CSP structured-data ignored)"
            : `${severeAll.length} severe error(s)`,
        consoleErrors: severeAll.slice(0, 12),
      };
    }),
  );

  await browser.close();

  // Derive bugs
  let bugN = 1;
  for (const r of report.checks) {
    if (r.status === "Fail") {
      report.bugs.push({
        id: `BUG-DEEP-${String(bugN++).padStart(3, "0")}`,
        title: `Deep UI fail: ${r.id} ${r.path || ""}`,
        module: r.module,
        severity: /admin|live|login|companies/i.test(`${r.id} ${r.path}`)
          ? "High"
          : "Medium",
        status: "Open",
        reportedBy: "Cursor Agent",
        steps: `1. Role ${r.role}\n2. Open ${BASE}${r.path || ""}\n3. ${r.notes}`,
        expected: "UI checklist item passes with expected controls / EmptyState / gate",
        actual: r.notes || r.snippet,
        env: BASE,
        date: TODAY,
      });
    }
  }

  const pass = report.checks.filter((x) => x.status === "Pass").length;
  const fail = report.checks.filter((x) => x.status === "Fail").length;
  const blocked = report.checks.filter((x) => x.status === "Blocked").length;
  report.summary = {
    totalChecks: report.checks.length,
    pass,
    fail,
    blocked,
    newBugs: report.bugs.length,
  };

  const latestPath = path.join(OUT_DIR, "ui-deep-audit-latest.json");
  const datedPath = path.join(OUT_DIR, `ui-deep-audit-${TODAY}.json`);
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(datedPath, JSON.stringify(report, null, 2));
  console.log("\nSummary:", report.summary);
  console.log("Wrote", latestPath);
  for (const c of report.checks) {
    console.log(`  ${c.id} → ${c.status}${c.notes ? ` (${c.notes.slice(0, 80)})` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
