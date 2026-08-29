/**
 * Focused post-fix checks with walkthrough dismissal (aecfaa).
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
    location: "scripts/_pw_verify2_aecfaa.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    try {
      sessionStorage.setItem("clarify:walkthrough-done-session", "1");
      localStorage.setItem("clarify:whats-new-dismissed", "99.0.0");
      // Mark all known walkthrough keys complete
      const raw = localStorage.getItem("Clarify AI-app-walkthrough-v1");
      const map = raw ? JSON.parse(raw) : {};
      for (const k of Object.keys(localStorage)) {
        if (k.includes("supabase.auth") || k.includes("sb-")) {
          try {
            const v = JSON.parse(localStorage.getItem(k) || "{}");
            const uid = v?.user?.id || v?.currentSession?.user?.id;
            if (uid) map[uid] = true;
          } catch {
            /* ignore */
          }
        }
      }
      // Also stamp a wildcard-ish completion for any user id present in auth store dumps
      localStorage.setItem("Clarify AI-app-walkthrough-v1", JSON.stringify({ ...map, "*": true }));
    } catch {
      /* ignore */
    }
  });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape").catch(() => null);
    const btn = page.getByRole("button", {
      name: /skip|close|got it|dismiss|next|finish|done/i,
    });
    if (await btn.count()) {
      await btn.first().click({ force: true }).catch(() => null);
    }
    // Remove inert overlay if still present
    await page.evaluate(() => {
      document.querySelectorAll(".fixed.inset-0").forEach((el) => {
        const t = el.textContent || "";
        if (/quick tour|walkthrough|what.?s new/i.test(t)) {
          el.remove();
        }
      });
    });
  }
}

const qa = load(".env.qa.local");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[name="email"]').first().fill(qa.QA_PRO_EMAIL);
  await page.locator('input[name="password"]').first().fill(qa.QA_PRO_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
  await dismissOverlays(page);

  // Capture user id and mark walkthrough
  const uid = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      try {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        const id = v?.user?.id || v?.currentSession?.user?.id;
        if (id) return id;
      } catch {
        /* ignore */
      }
    }
    return null;
  });
  if (uid) {
    await page.evaluate((userId) => {
      const raw = localStorage.getItem("Clarify AI-app-walkthrough-v1");
      const map = raw ? JSON.parse(raw) : {};
      map[userId] = true;
      localStorage.setItem("Clarify AI-app-walkthrough-v1", JSON.stringify(map));
      sessionStorage.setItem("clarify:walkthrough-done-session", "1");
    }, uid);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOverlays(page);

  // SCH
  await page.goto(`${BASE}/app/interviews/new`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(1000);
  const companyInput = page.locator("#company, input[name='company'], [aria-label*='Company' i]").first();
  // NewInterview uses Input components — find by label text
  const labels = page.locator("label");
  const companyLabel = page.getByText(/^Company/i).first();
  let schOk = { invalidMsg: 0, tz: 0 };
  if (await companyLabel.count()) {
    const companyField = page.locator("input").nth(0);
    // Prefer explicit placeholders
    const allInputs = page.locator("form input[type='text'], form input:not([type])");
    const count = await allInputs.count();
    if (count >= 2) {
      await allInputs.nth(0).fill("5555");
      await allInputs.nth(1).fill("TTTTTT");
    }
    await page.getByRole("button", { name: /schedule interview|save|update/i }).first().click({ force: true }).catch(() => null);
    await page.waitForTimeout(600);
    schOk.invalidMsg = await page.getByText(/real company|real role|placeholder|required/i).count();
    schOk.tz = await page.locator("#schedule-timezone").count();
  }
  log("H-SCH-VAL", "validation_and_tz", schOk);

  // PREP
  await page.goto(`${BASE}/app/prep/rephraser`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(1500);
  const ta = page.locator("textarea").first();
  const hasTa = (await ta.count()) > 0;
  log("H-PREP-HIST", "rephraser_page", { hasTa, url: page.url() });
  if (hasTa) {
    await ta.fill(
      "I led a migration that reduced deploy time and improved service reliability for the whole platform team.",
    );
    await page.getByRole("button", { name: /Generate 3 alternatives/i }).click({ force: true });
    await page.waitForTimeout(20000);
    const before = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.includes("rephrase"))
        .map((k) => ({
          k,
          hasFormal: (localStorage.getItem(k) || "").includes('"formal"'),
          len: (localStorage.getItem(k) || "").length,
        })),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    await page.waitForTimeout(2000);
    const afterVal = await page.locator("textarea").first().inputValue().catch(() => "");
    const altVisible = await page.getByText(/Formal/i).count();
    const after = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.includes("rephrase"))
        .map((k) => ({
          k,
          hasFormal: (localStorage.getItem(k) || "").includes('"formal"'),
          len: (localStorage.getItem(k) || "").length,
        })),
    );
    log("H-PREP-HIST", "persist_after_refresh", {
      before,
      afterValLen: afterVal.length,
      altVisible,
      after,
    });
  }

  // GOV-009 — go through generate with exam preselected via search then step
  await page.goto(`${BASE}/app/mock-test/generate`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(1000);
  const search = page.getByLabel("Search government exams");
  if (await search.count()) {
    await search.fill("SSC CGL");
    await page.waitForTimeout(6000);
    const opt = page.locator('[role="option"]').first();
    if (await opt.count()) await opt.click({ force: true });
    // Click continue-like buttons
    for (const name of [/Continue/i, /Next/i, /Custom Practice/i, /Quick/i]) {
      const b = page.getByRole("button", { name });
      if (await b.count()) {
        await b.first().click({ force: true }).catch(() => null);
        await page.waitForTimeout(400);
      }
    }
  }
  const qInput = page.locator('input[type="number"]').first();
  if (await qInput.count()) {
    await qInput.fill("999999999999999999");
    await page.waitForTimeout(1000);
    const val = await qInput.inputValue();
    const sci = await page.getByText(/e\+/i).count();
    log("H-GOV-BOUND", "clamped_ui", { val, sci });
  } else {
    log("H-GOV-BOUND", "no_number_input", { url: page.url() });
  }
} catch (e) {
  log("H-ENV", "verify2_error", {
    error: e instanceof Error ? e.message : String(e),
  });
} finally {
  await browser.close();
}
