import { test, expect } from "../playwright-fixture";
import {
  setupSupabaseMocks,
  fillLoginForm,
  dismissCookieBanner,
  loginAsTestUser,
  E2E_TEST_USER,
  isPasswordGrantTokenRequest,
  expectDashboardReady,
  clickLogout,
  clearBrowserAuthState,
} from "./helpers/auth-flow";

const APP_ROUTES = [
  "/app/dashboard",
  "/app/plan",
  "/app/sessions",
  "/app/analytics",
  "/app/mock",
  "/app/prep/star-builder",
  "/app/documents",
  "/app/guide/practice-coach",
];

test.describe("Auth account architecture", () => {
  test("valid login creates one password grant and opens dashboard", async ({
    page,
  }) => {
    await setupSupabaseMocks(page);
    const passwordGrants: string[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/auth\/v1\/token\b/.test(req.url()) &&
        isPasswordGrantTokenRequest(req.url(), req.postData())
      ) {
        passwordGrants.push(req.url());
      }
    });

    await clearBrowserAuthState(page);
    await dismissCookieBanner(page);
    await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectDashboardReady(page);
    expect(passwordGrants.length).toBe(1);
    await expect(page.getByText("E2E Test User").first()).toBeVisible();
    await expect(page.getByText(/Unable to load your account/i)).toHaveCount(0);
  });

  test("invalid login shows a safe error without a request storm", async ({
    page,
  }) => {
    await setupSupabaseMocks(page);
    const tokenPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/auth/v1/token")) {
        tokenPosts.push(req.url());
      }
    });

    await clearBrowserAuthState(page);
    await dismissCookieBanner(page);
    await fillLoginForm(page, "bad@example.com", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Incorrect email or password/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
    expect(tokenPosts.length).toBeLessThanOrEqual(2);
  });

  test("browser refresh restores the session on dashboard", async ({ page }) => {
    await loginAsTestUser(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectDashboardReady(page);
  });

  test("authenticated navigation does not timeout on account loading", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    for (const route of APP_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(
        page.getByText(/Unable to load your account/i),
      ).toHaveCount(0);
    }
  });

  test("logout blocks protected routes", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/settings", { waitUntil: "domcontentloaded" });
    await clickLogout(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("cross-tab logout signs the second tab out", async ({ context, page }) => {
    await loginAsTestUser(page);
    const pageB = await context.newPage();
    await setupSupabaseMocks(pageB);
    await pageB.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await expectDashboardReady(pageB);

    await page.goto("/app/settings", { waitUntil: "domcontentloaded" });
    await clickLogout(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Cross-tab sync is event-driven; allow a short settle then hard-check URL.
    await expect(pageB).toHaveURL(/\/login/, { timeout: 20_000 });
    await pageB.close();
  });

  test("expired session recovers without a permanent skeleton", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.evaluate(() => {
      const expireJwt = (token: string): string => {
        const parts = token.split(".");
        if (parts.length < 2) return token;
        try {
          const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(json) as { exp?: number };
          payload.exp = Math.floor(Date.now() / 1000) - 120;
          const encoded = btoa(JSON.stringify(payload))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
          return `${parts[0]}.${encoded}.${parts[2] ?? "e2e-sig"}`;
        } catch {
          return token;
        }
      };

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.includes("auth-token")) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as {
            currentSession?: {
              expires_at?: number;
              access_token?: string;
              refresh_token?: string;
            };
            expires_at?: number;
            access_token?: string;
            refresh_token?: string;
          };
          const session = parsed.currentSession ?? parsed;
          const expiredAt = Math.floor(Date.now() / 1000) - 120;
          if (session && typeof session === "object") {
            (session as { expires_at?: number }).expires_at = expiredAt;
            const access = (session as { access_token?: string }).access_token;
            if (typeof access === "string") {
              (session as { access_token?: string }).access_token = expireJwt(access);
            }
            (session as { refresh_token?: string }).refresh_token =
              "e2e-revoked-refresh-token";
          }
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          // ignore
        }
      }
    });
    await page.route("**/*supabase.co/auth/v1/token*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid Refresh Token: Refresh Token Not Found",
        }),
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await dismissCookieBanner(page);
    await expect(page.getByText(/session (has )?expired/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
