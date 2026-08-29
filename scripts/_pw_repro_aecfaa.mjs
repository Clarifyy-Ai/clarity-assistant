/**
 * Browser reproduction for TC-GOV-002 / GOV-009 / PREP-003 against local Vite.
 * Appends NDJSON to debug-aecfaa.log
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
    runId: "pw-repro",
    hypothesisId,
    location: "scripts/_pw_repro_aecfaa.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
}

const qa = load(".env.qa.local");
const email = qa.QA_PRO_EMAIL;
const password = qa.QA_PRO_PASSWORD;
if (!email || !password) {
  log("H-ENV", "missing_qa_creds", {});
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const searchCalls = [];

page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes("/functions/v1/search-exams")) return;
  if (res.request().method() === "OPTIONS") return;
  let code = null;
  try {
    const j = await res.json();
    code = j?.code ?? null;
  } catch {
    /* ignore */
  }
  searchCalls.push({ status: res.status(), code, url: url.slice(-40) });
  log("H-GOV-RL", "search_exams_response", {
    status: res.status(),
    code,
  });
});

page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes("/functions/v1/check-exam-paper-availability")) return;
  if (res.request().method() === "OPTIONS") return;
  log("H-GOV-BOUND", "availability_response", { status: res.status() });
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
  log("H-ENV", "logged_in", { path: new URL(page.url()).pathname });

  // Dismiss overlays
  await page.evaluate(() => {
    try {
      localStorage.setItem("clarify:whats-new-dismissed", "1.5.0");
      localStorage.setItem("Clarify AI-app-walkthrough-v1", "{}");
    } catch {
      /* ignore */
    }
  });

  // ── TC-GOV-002 consecutive searches ──
  await page.goto(`${BASE}/app/mock-test`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const input = page.getByLabel("Search government exams");
  await input.waitFor({ state: "visible", timeout: 30_000 });

  for (const q of ["SSC CGL", "APPSC GROUP2", "UPSC"]) {
    await input.fill("");
    await input.fill(q);
    await page.waitForTimeout(900);
    const spinner = await page.locator(".animate-spin").count();
    const tooMany = await page.getByText(/Too many searches/i).count();
    const unavailable = await page.getByText(/temporarily unavailable/i).count();
    log("H-GOV-UI", "after_search", {
      q,
      spinner,
      tooMany,
      unavailable,
      searchCalls: searchCalls.length,
      lastStatus: searchCalls.at(-1)?.status ?? null,
      lastCode: searchCalls.at(-1)?.code ?? null,
    });
  }

  // Wait for last search to settle
  await page.waitForTimeout(8000);
  const finalSpinner = await page.locator(".animate-spin").count();
  const finalTooMany = await page.getByText(/Too many searches/i).count();
  const errorBanners = await page.getByText(/Too many searches|temporarily unavailable|Exam search failed/i).count();
  log("H-GOV-DUP", "settled", {
    finalSpinner,
    finalTooMany,
    errorBanners,
    searchCalls: searchCalls.length,
    statuses: searchCalls.map((c) => c.status),
    codes: searchCalls.map((c) => c.code),
  });

  // ── TC-GOV-009 boundary (navigate to generate if possible) ──
  await page.goto(`${BASE}/app/mock-test/generate`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  }).catch(() => null);
  const qInput = page.locator('input[type="number"]').first();
  if (await qInput.count()) {
    await qInput.fill("5e55");
    await page.waitForTimeout(1500);
    const overflow = await page.getByText(/5e\+?55|AI-generated:/i).count();
    const val = await qInput.inputValue();
    log("H-GOV-BOUND", "question_overflow", { val, overflowTextHits: overflow });
  } else {
    log("H-GOV-BOUND", "question_input_missing", { path: page.url() });
  }

  // ── TC-PREP-003 rephraser persistence ──
  await page.goto(`${BASE}/app/prep/rephraser`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const ta = page.locator("textarea").first();
  if (await ta.count()) {
    const sample =
      "I led a team migration that reduced deploy time and improved reliability across services.";
    await ta.fill(sample);
    const btn = page.getByRole("button", { name: /Generate 3 alternatives/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await page.waitForTimeout(12000);
    }
    const before = await page.evaluate(() => {
      const keys = Object.keys(sessionStorage).filter((k) =>
        k.includes("rephrase"),
      );
      return keys.map((k) => ({
        k,
        len: (sessionStorage.getItem(k) || "").length,
        hasAlts: (sessionStorage.getItem(k) || "").includes("formal"),
      }));
    });
    log("H-PREP-HIST", "before_refresh", { before });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const afterAlts = await page.getByText(/Formal|Confident|Concise/i).count();
    const afterStore = await page.evaluate(() => {
      const keys = Object.keys(sessionStorage).filter((k) =>
        k.includes("rephrase"),
      );
      return keys.map((k) => ({
        k,
        len: (sessionStorage.getItem(k) || "").length,
        hasAlts: (sessionStorage.getItem(k) || "").includes("formal"),
      }));
    });
    log("H-PREP-HIST", "after_refresh", { afterAlts, afterStore });
  } else {
    log("H-PREP-HIST", "rephraser_missing", {});
  }
} catch (e) {
  log("H-ENV", "repro_error", {
    error: e instanceof Error ? e.message : String(e),
  });
} finally {
  await browser.close();
}
