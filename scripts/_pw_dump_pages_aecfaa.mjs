import fs from "node:fs";
import { chromium } from "playwright";

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

function log(message, data) {
  const line = JSON.stringify({
    sessionId: "aecfaa",
    runId: "post-fix",
    hypothesisId: "H-ENV",
    location: "scripts/_pw_dump_pages_aecfaa.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync("debug-aecfaa.log", line + "\n");
  console.log(line);
}

const qa = load(".env.qa.local");
const BASE = process.env.DEBUG_BASE_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.locator('input[name="email"]').first().fill(qa.QA_PRO_EMAIL);
await page.locator('input[name="password"]').first().fill(qa.QA_PRO_PASSWORD);
await page.getByRole("button", { name: /sign in|log in/i }).first().click();
await page.waitForURL(/\/app\//, { timeout: 45_000 });
await page.evaluate(() => {
  sessionStorage.setItem("clarify:walkthrough-done-session", "1");
  localStorage.setItem("clarify:cookie-consent", JSON.stringify({ essential: true }));
  document.querySelectorAll(".fixed.inset-0, [data-testid='cookie-consent-banner']").forEach((el) =>
    el.remove(),
  );
});

for (const path of [
  "/app/interviews/new",
  "/app/prep/rephraser",
  "/app/mock-test/generate",
]) {
  await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.evaluate(() => {
    document
      .querySelectorAll(".fixed.inset-0, [data-testid='cookie-consent-banner']")
      .forEach((el) => el.remove());
  });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.textContent || null,
    textareas: document.querySelectorAll("textarea").length,
    numberInputs: document.querySelectorAll("input[type=number]").length,
    timezone: !!document.querySelector("#schedule-timezone"),
    companyLabel: !!document.querySelector("label"),
    bodySnippet: (document.body?.innerText || "").slice(0, 800),
  }));
  log(path, info);

  if (path === "/app/interviews/new") {
    await page.evaluate(() => {
      document
        .querySelectorAll(".fixed.inset-0, [data-testid='cookie-consent-banner']")
        .forEach((el) => el.remove());
    });
    const company = page.getByLabel(/Company name/i);
    await company.fill("5555");
    await page.getByLabel(/Role \/ position/i).fill("TTTTTT");
    await page.getByRole("button", { name: /Schedule interview/i }).click({ force: true });
    await page.waitForTimeout(500);
    const msg = await page.getByText(/real company|real role/i).count();
    log("sch_validation_click", { msg, timezone: info.timezone });
  }
}

await browser.close();
