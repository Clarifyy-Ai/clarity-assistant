/**
 * Post-fix browser verification for aecfaa fixes.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const LOG = path.resolve("debug-aecfaa.log");
const BASE = process.env.DEBUG_BASE_URL || "http://127.0.0.1:5173";

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

function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: "aecfaa",
    runId: "post-fix",
    hypothesisId,
    location: "scripts/_pw_verify_aecfaa.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
}

const qa = load(".env.qa.local");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const searchStatuses = [];
const availStatuses = [];

page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/functions/v1/search-exams") && res.request().method() !== "OPTIONS") {
    searchStatuses.push(res.status());
  }
  if (
    url.includes("/functions/v1/check-exam-paper-availability") &&
    res.request().method() !== "OPTIONS"
  ) {
    availStatuses.push(res.status());
  }
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[name="email"]').first().fill(qa.QA_PRO_EMAIL);
  await page.locator('input[name="password"]').first().fill(qa.QA_PRO_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });

  await page.evaluate(({ userId }) => {
    try {
      localStorage.setItem("clarify:whats-new-dismissed", "1.5.0");
      localStorage.setItem(
        "Clarify AI-app-walkthrough-v1",
        JSON.stringify({ [userId]: true }),
      );
    } catch {
      /* ignore */
    }
  }, { userId: "qa" });
  // Kill any visible tour modal
  await page.keyboard.press("Escape").catch(() => null);
  const skipTour = page.getByRole("button", { name: /skip|close|got it|dismiss/i });
  if (await skipTour.count()) {
    await skipTour.first().click({ force: true }).catch(() => null);
  }

  // GOV-002 consecutive
  await page.goto(`${BASE}/app/mock-test`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const input = page.getByLabel("Search government exams");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  for (const q of ["SSC CGL", "APPSC GROUP2", "UPSC"]) {
    await input.fill(q);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(10000);
  const tooMany = await page.getByText(/Too many searches/i).count();
  const spinner = await page.locator(".animate-spin").count();
  log("H-GOV-UI", "consecutive_settled", {
    tooMany,
    spinner,
    searchStatuses: [...searchStatuses],
    allOk: searchStatuses.every((s) => s === 200),
  });

  // GOV-009 via generate wizard with exam query param if possible
  await page.goto(`${BASE}/app/mock-test/generate`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  // Select first exam from combobox browse
  const genSearch = page.getByLabel("Search government exams");
  if (await genSearch.count()) {
    await genSearch.click();
    await page.waitForTimeout(3000);
    const opt = page.locator('[role="option"]').first();
    if (await opt.count()) {
      await opt.click();
      // advance steps to customize if buttons exist
      const next = page.getByRole("button", { name: /continue|next|custom/i }).first();
      for (let i = 0; i < 3; i++) {
        if (await next.isVisible().catch(() => false)) {
          await next.click().catch(() => null);
          await page.waitForTimeout(500);
        }
      }
    }
  }
  const qInput = page.locator('input[type="number"]').first();
  if (await qInput.count()) {
    await qInput.fill("999999999999999999");
    await page.waitForTimeout(800);
    const val = await qInput.inputValue();
    const sci = await page.getByText(/5e\+|e\+55/i).count();
    log("H-GOV-BOUND", "clamped_value", {
      val,
      sci,
      availStatuses: [...availStatuses],
      has429: availStatuses.includes(429),
    });
  } else {
    log("H-GOV-BOUND", "no_number_input", { url: page.url() });
  }

  // PREP-003
  await page.goto(`${BASE}/app/prep/rephraser`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);
  const ta = page.locator("textarea").first();
  log("H-PREP-HIST", "rephraser_page", {
    url: page.url(),
    hasTextarea: (await ta.count()) > 0,
    title: await page.title(),
  });
  if (await ta.count()) {
    await ta.fill(
      "I led a migration that reduced deploy time and improved service reliability for the team.",
    );
    const btn = page.getByRole("button", { name: /Generate 3 alternatives/i });
    await btn.click();
    await page.waitForTimeout(15000);
    const storedBefore = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.includes("rephrase"));
      return keys.map((k) => ({
        k,
        hasFormal: (localStorage.getItem(k) || "").includes('"formal"'),
        len: (localStorage.getItem(k) || "").length,
      }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const restored = await page.locator("textarea").first().inputValue();
    const altVisible = await page.getByText(/Formal/i).count();
    const storedAfter = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.includes("rephrase"));
      return keys.map((k) => ({
        k,
        hasFormal: (localStorage.getItem(k) || "").includes('"formal"'),
        len: (localStorage.getItem(k) || "").length,
      }));
    });
    log("H-PREP-HIST", "persist_after_refresh", {
      storedBefore,
      restoredLen: restored.length,
      altVisible,
      storedAfter,
    });
  }

  // SCH validation
  await page.goto(`${BASE}/app/interviews/new`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const company = page.locator('input').filter({ hasText: "" }).first();
  // Prefer labeled fields
  const companyInput = page.getByLabel(/company/i).first();
  const roleInput = page.getByLabel(/role|position/i).first();
  if (await companyInput.count()) {
    await companyInput.fill("5555");
    await roleInput.fill("TTTTTT");
    await page.getByRole("button", { name: /schedule|save|create/i }).first().click();
    await page.waitForTimeout(800);
    const invalidMsg = await page.getByText(/real company|real role|placeholder/i).count();
    const tz = await page.getByLabel(/timezone/i).count();
    log("H-SCH-VAL", "validation_and_tz", { invalidMsg, tz });
  } else {
    log("H-SCH-VAL", "form_missing", { url: page.url() });
  }
} catch (e) {
  log("H-ENV", "verify_error", {
    error: e instanceof Error ? e.message : String(e),
  });
} finally {
  await browser.close();
}
