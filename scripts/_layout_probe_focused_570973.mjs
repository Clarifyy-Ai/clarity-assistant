/**
 * Focused layout evidence for session 570973.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG = path.join(ROOT, "debug-570973.log");
const BASE = process.env.LAYOUT_PROBE_BASE || "http://127.0.0.1:5001";
const SHOTS = path.join(ROOT, "_layout_shots_570973");

function loadQa() {
  const env = fs.readFileSync(path.join(ROOT, ".env.qa.local"), "utf8");
  const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return { email: get("QA_PRO_EMAIL"), password: get("QA_PRO_PASSWORD") };
}

function log(hypothesisId, location, message, data) {
  fs.appendFileSync(
    LOG,
    JSON.stringify({
      sessionId: "570973",
      runId: "post-fix",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }) + "\n",
    "utf8",
  );
}

async function dismissOverlays(page) {
  // Walkthrough / install / whats-new modals block clicks
  for (let i = 0; i < 4; i++) {
    const skip = page.getByRole("button", { name: /skip tour|skip|dismiss|close|got it|not now|later/i });
    if (await skip.count()) {
      await skip.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    } else break;
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    sessionStorage.setItem("clarify:walkthrough-done-session", "1");
    try {
      localStorage.setItem("clarify:walkthrough-completed", "1");
    } catch {}
  }).catch(() => {});
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await Promise.all([
    page.waitForURL(/\/app\//, { timeout: 60000 }).catch(() => null),
    page.getByRole("button", { name: /log ?in|sign ?in|continue/i }).first().click(),
  ]);
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  log("E", "auth", "after login", { url: page.url() });
}

async function snap(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.basename(file);
}

async function measure(page, route, vw, vh, hypothesisHints) {
  await page.setViewportSize({ width: vw, height: vh });
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);

  await dismissOverlays(page);

  if (route.includes("dashboard")) {
    const more = page.getByRole("button", { name: /^More$/i });
    if (await more.count()) {
      await more.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const moreBtn = btns.find((b) => /More/i.test(b.textContent || "") && b.getAttribute("aria-expanded") === "false");
      moreBtn?.click();
    });
    await page.waitForTimeout(400);
  }

  const data = await page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        w: Math.round(b.width),
        h: Math.round(b.height),
        x: Math.round(b.x),
        y: Math.round(b.y),
        right: b.right,
        left: b.left,
        top: b.top,
        bottom: b.bottom,
      };
    };
    const overlaps = (a, b) => {
      if (!a || !b) return false;
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    };
    const main = document.querySelector("#main-content");
    const shell = document.querySelector("#main-content > div");
    const pageRoot =
      document.querySelector("[data-testid='page-width-root']") ||
      document.querySelector("#main-content [class*='max-w']") ||
      shell;
    const desktop = document.querySelector("[data-testid='desktop-installer-card']");
    const copy = document.querySelector("[data-testid='desktop-installer-copy']");
    const controls = document.querySelector("[data-testid='desktop-installer-controls']");
    const header = document.querySelector("[data-testid='page-header']");
    const title = header?.querySelector("h1") || null;
    const actions = document.querySelector("[data-testid='page-header-actions']");
    const trust = document.querySelector("[data-testid='session-trust-banner']");
    const free = document.querySelector("[data-testid='mock-free-banner']");
    const options = document.querySelector("[data-testid='mock-session-options']");
    const quick = document.querySelector("[data-testid='wizard-quick-start']");
    const settings = document.querySelector("[data-testid='settings-layout']");
    const aside = settings?.querySelector("aside") || null;
    const settingsContent = document.querySelector("[data-testid='settings-content']");

    // Fallback: find "Desktop app" text card even without testid (old markup)
    let desktopFallback = null;
    if (!desktop) {
      const p = [...document.querySelectorAll("p")].find((el) =>
        /Desktop app/i.test(el.textContent || ""),
      );
      if (p) {
        const card = p.closest("div.flex, div.rounded-2xl, div[class*='border']");
        desktopFallback = r(card || p);
      }
    }

    const copyR = r(copy);
    const controlsR = r(controls);
    const titleR = r(title);
    const actionsR = r(actions);
    const shellR = r(shell);
    const pageR = r(pageRoot);

    const trustEl = trust;
    const freeP = free?.querySelector("p") || free;

    // Approximate relative luminance contrast vs white/black from computed color
    const parseRgb = (c) => {
      const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const lum = ([rr, gg, bb]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(rr) + 0.7152 * f(gg) + 0.0722 * f(bb);
    };
    const contrast = (fg, bg) => {
      const a = parseRgb(fg);
      const b = parseRgb(bg);
      if (!a || !b) return null;
      const L1 = lum(a);
      const L2 = lum(b);
      const hi = Math.max(L1, L2);
      const lo = Math.min(L1, L2);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };

    return {
      url: location.href,
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      mainExists: Boolean(main),
      shell: shellR,
      page: pageR,
      utilization:
        shellR && pageR && shellR.w > 0 ? Math.round((pageR.w / shellR.w) * 100) / 100 : null,
      desktop: desktop
        ? {
            present: true,
            card: r(desktop),
            copy: copyR,
            controls: controlsR,
            copyW: copyR?.w ?? 0,
            squished: (copyR?.w ?? 0) > 0 && (copyR?.w ?? 0) < 90,
            collide: overlaps(copy?.getBoundingClientRect(), controls?.getBoundingClientRect()),
            flexWrap: getComputedStyle(desktop).flexWrap,
            flexDirection: getComputedStyle(desktop).flexDirection,
          }
        : { present: false, fallback: desktopFallback },
      header: header
        ? {
            present: true,
            title: titleR,
            actions: actionsR,
            colliding: overlaps(title?.getBoundingClientRect(), actions?.getBoundingClientRect()),
            headerFlex: getComputedStyle(
              header.querySelector(".flex.items-start.justify-between") || header,
            ).flexDirection,
            headerH: r(header)?.h,
          }
        : { present: false },
      mock: {
        trust: trust
          ? {
              color: getComputedStyle(trust).color,
              bg: getComputedStyle(trust).backgroundColor,
              contrastOnBg: contrast(
                getComputedStyle(trust).color,
                getComputedStyle(trust).backgroundColor,
              ),
              rect: r(trust),
            }
          : null,
        free: freeP
          ? {
              color: getComputedStyle(freeP).color,
              bg: getComputedStyle(free).backgroundColor,
              contrastOnBg: contrast(
                getComputedStyle(freeP).color,
                getComputedStyle(free).backgroundColor,
              ),
              rect: r(free),
            }
          : null,
        options: r(options),
        quick: r(quick),
        optionsVsQuick: overlaps(
          options?.getBoundingClientRect(),
          quick?.getBoundingClientRect(),
        ),
      },
      settings: settings
        ? {
            present: true,
            asideDisplay: aside ? getComputedStyle(aside).display : null,
            aside: r(aside),
            content: r(settingsContent),
            root: r(settings),
          }
        : { present: false },
      bodySnippet: document.body?.innerText?.slice(0, 180) || "",
    };
  });

  const shot = await snap(page, `${route.replace(/\W+/g, "_")}_${vw}x${vh}`);
  for (const h of hypothesisHints) {
    log(h, `${route}@${vw}x${vh}`, "focused metrics", { ...data, shot });
  }
  return data;
}

async function main() {
  fs.writeFileSync(LOG, "", "utf8");
  const { email, password } = loadQa();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await login(page, email, password);

    // A: dashboard installer at mobile widths
    for (const [vw, vh] of [
      [360, 800],
      [375, 812],
      [414, 896],
    ]) {
      await measure(page, "/app/dashboard", vw, vh, ["A", "E"]);
    }

    // B: gov hub header
    for (const [vw, vh] of [
      [360, 800],
      [375, 812],
      [414, 896],
    ]) {
      await measure(page, "/app/mock-test", vw, vh, ["B"]);
    }

    // C: mock
    for (const [vw, vh] of [
      [360, 800],
      [414, 896],
    ]) {
      await measure(page, "/app/mock", vw, vh, ["C"]);
    }

    // D: settings tablet
    await measure(page, "/app/settings/profile", 768, 1024, ["D"]);

    // E: desktop width comparison
    for (const route of [
      "/app/live",
      "/app/debriefs",
      "/app/interviews",
      "/app/practice-workspace",
      "/app/learn",
      "/app/analytics",
      "/app/referrals",
      "/app/assessments",
      "/app/mock-test",
    ]) {
      await measure(page, route, 1440, 900, ["E"]);
      await measure(page, route, 1920, 1080, ["E"]);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
