process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BASE = "https://clarify.ai.sltfinanceindia.com";

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
};

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill(password);
  const t0 = Date.now();
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
  await page.waitForTimeout(2500);
  return Date.now() - t0;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const consoleHits = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/content security policy|refused to/i.test(t)) consoleHits.push(t);
  });

  const out = [];

  const adminMs = await login(page, env.QA_ADMIN_EMAIL, env.QA_ADMIN_PASSWORD);
  await page.goto(`${BASE}/app/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const adminTxt = await page.locator("body").innerText();
  out.push({
    id: "Admin UI /app/admin",
    ms: adminMs,
    url: page.url(),
    accessDenied: /access denied/i.test(adminTxt),
    looksLikeAdmin: /users|revenue|audit|feature flag|questions/i.test(adminTxt),
    snip: adminTxt.slice(0, 280).replace(/\s+/g, " "),
  });

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());

  const freeMs = await login(page, env.QA_FREE_EMAIL, env.QA_FREE_PASSWORD);
  await page.goto(`${BASE}/app/companies`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const companies = await page.locator("body").innerText();
  out.push({
    id: "Free /app/companies",
    ms: freeMs,
    url: page.url(),
    snip: companies.slice(0, 280).replace(/\s+/g, " "),
  });

  await page.goto(`${BASE}/app/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const shell = await page.locator("aside, header").allInnerTexts().catch(() => []);
  out.push({
    id: "Free shell consistency",
    shell: (shell.join(" | ") || "").slice(0, 400),
  });

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  const maxMs = await login(page, env.QA_MAX_EMAIL, env.QA_MAX_PASSWORD);
  await page.goto(`${BASE}/app/usage`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const usage = await page.locator("body").innerText();
  out.push({
    id: "Max /app/usage",
    ms: maxMs,
    url: page.url(),
    snip: usage.slice(0, 280).replace(/\s+/g, " "),
  });

  const outPath = path.join(root, "docs", "qa", "audits", "live-audit-extra-roles.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ out, consoleHits }, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
