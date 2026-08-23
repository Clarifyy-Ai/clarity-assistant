import { expect, type Page } from "@playwright/test";
import { E2E_TEST_USER, setupSupabaseMocks } from "./supabase-mock";

export { E2E_TEST_USER, setupSupabaseMocks };

export async function fillSignupForm(
  page: Page,
  data: {
    fullName: string;
    email: string;
    password: string;
    acceptTerms?: boolean;
  }
): Promise<void> {
  await page.locator('input[name="fullName"]').fill(data.fullName);
  await page.locator('input[name="email"]').fill(data.email);
  await page.locator('input[name="password"]').fill(data.password);
  await page.locator('input[name="confirmPassword"]').fill(data.password);

  const terms = page.locator('input[name="acceptTerms"]');
  const checked = await terms.isChecked();
  const shouldAccept = data.acceptTerms !== false;

  if (shouldAccept !== checked) {
    await terms.click();
  }
}

export async function fillLoginForm(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.getByRole("heading", { name: "Welcome back" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const emailInput = page.locator('input[name="email"]').first();
  const passwordInput = page.locator('input[name="password"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  // Auth bootstrap remounts the form while status === "loading"; refill until values stick.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    const emailVal = await emailInput.inputValue();
    const passVal = await passwordInput.inputValue();
    if (emailVal === email && passVal === password) {
      await passwordInput.blur();
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Login form did not keep email/password values");
}

export function isAppDashboardPath(url: URL): boolean {
  return url.pathname === "/app/dashboard" || url.pathname === "/app/dashboard/";
}

/** Wait until the authenticated dashboard is actually painted (not login returnTo). */
export async function expectDashboardReady(page: Page): Promise<void> {
  await page.waitForURL(isAppDashboardPath, { timeout: 20_000 });
  // Seed dismissals before walkthrough / What's New mount and steal clicks.
  await page.evaluate(
    ({ userId, version }) => {
      try {
        localStorage.setItem("clarify:whats-new-dismissed", version);
        localStorage.setItem(
          "Clarify AI-app-walkthrough-v1",
          JSON.stringify({ [userId]: true }),
        );
      } catch {
        // ignore
      }
    },
    { userId: E2E_TEST_USER.id, version: "1.5.0" },
  );
  await dismissBlockingOverlays(page);
  await page
    .getByText(/Preparing your workspace/i)
    .waitFor({ state: "hidden", timeout: 20_000 })
    .catch(() => undefined);
  const ready = page
    .getByRole("heading", { name: /Good (morning|afternoon|evening)/i })
    .or(page.getByText("E2E Test User"));
  await ready.first().waitFor({ state: "visible", timeout: 20_000 });
}

/** Dismiss cookie / tour / what's-new overlays that steal pointer events. */
export async function dismissBlockingOverlays(page: Page): Promise<void> {
  await dismissCookieBanner(page);
  await dismissWalkthrough(page);

  const dismissors = [
    page.getByRole("button", { name: /^got it$/i }),
    page.getByRole("button", { name: /dismiss/i }),
    page.getByRole("button", { name: /close/i }),
    page.getByRole("button", { name: /skip tour/i }),
  ];
  for (const button of dismissors) {
    if ((await button.count()) === 0) continue;
    const visible = button.locator("visible=true").first();
    if (await visible.isVisible().catch(() => false)) {
      await visible.click({ timeout: 2_000 }).catch(() => undefined);
    }
  }

  // Radix Dialog/Sheet overlays use this class — Escape closes the topmost.
  for (let i = 0; i < 3; i += 1) {
    const overlay = page.locator("div.fixed.inset-0.z-50[data-state='open']");
    if ((await overlay.count()) === 0) break;
    await page.keyboard.press("Escape");
    await overlay
      .first()
      .waitFor({ state: "hidden", timeout: 1_500 })
      .catch(() => undefined);
  }
}

/** Ensure no leftover GoTrue session makes /login redirect into the app shell.
 * Do NOT use page.addInitScript to clear storage: it is context-wide and
 * wipes the session on every later reload and on every extra tab.
 */
export async function clearBrowserAuthState(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });

  if (!/\/login(?:\?|$)/.test(new URL(page.url()).pathname)) {
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore
      }
    });
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 90_000 });
  }

  await dismissCookieBanner(page);
  const emailInput = page.locator('input[name="email"]').first();
  try {
    await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    // Auth bootstrap sometimes leaves a blank shell after reload; hard navigate once more.
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await dismissCookieBanner(page);
    await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  }
}

/** True for password grants; false for refresh_token grants. */
export function isPasswordGrantTokenRequest(
  url: string,
  body: string | null | undefined,
): boolean {
  const payload = `${url}\n${body ?? ""}`;
  if (
    /grant_type=refresh_token|grant_type"\s*:\s*"refresh_token"/.test(payload)
  ) {
    return false;
  }
  return (
    /grant_type=password|grant_type"\s*:\s*"password"/.test(payload) ||
    /username=/.test(payload) ||
    /"email"\s*:/.test(body ?? "") ||
    /email=/.test(body ?? "")
  );
}

/** Settings + sidebar both expose Log out; prefer a visible control. */
export async function clickLogout(page: Page): Promise<void> {
  await dismissBlockingOverlays(page);
  await page
    .getByRole("heading", { name: /Settings/i })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => undefined);

  // Prefer the Settings panel button (explicit text) over the sidebar icon.
  const settingsLogout = page.locator(
    'aside button[aria-label="Log out"]:visible, button[aria-label="Log out"]:visible',
  );
  await settingsLogout.first().click({ timeout: 15_000, force: false });
}

/** Log in via UI with mocked Supabase responses; lands on /app/dashboard. */
export async function loginAsTestUser(
  page: Page,
  options?: Parameters<typeof setupSupabaseMocks>[1],
): Promise<void> {
  await setupSupabaseMocks(page, options);
  await clearBrowserAuthState(page);
  await dismissCookieBanner(page);
  await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
  await dismissCookieBanner(page);
  const signIn = page.getByRole("button", { name: "Sign in" });
  await expect(signIn).toBeEnabled({ timeout: 20_000 });
  await signIn.click();
  await expectDashboardReady(page);
}

/** Dismiss the first-run product tour overlay when it blocks clicks. */
export async function dismissWalkthrough(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: /Skip tour/i });
  try {
    await skip.waitFor({ state: "visible", timeout: 2_500 });
    await skip.click();
    await page
      .getByRole("dialog", { name: /walkthrough|tour/i })
      .waitFor({ state: "hidden", timeout: 3_000 })
      .catch(() => undefined);
  } catch {
    // Tour not shown for this session.
  }
}

/** Dismiss cookie banner when it blocks interactions. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: "Accept All" });
  try {
    await accept.waitFor({ state: "visible", timeout: 4_000 });
    await accept.click();
    await page
      .getByRole("dialog", { name: /cookie notice/i })
      .waitFor({
        state: "hidden",
        timeout: 2_000,
      })
      .catch(() => undefined);
  } catch {
    // Banner not shown for this session.
  }
}
