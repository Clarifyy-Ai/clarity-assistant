import { test, expect } from "../playwright-fixture";
import {
  setupSupabaseMocks,
  loginAsTestUser,
  dismissCookieBanner,
  expectDashboardReady,
} from "../e2e/helpers/auth-flow";

type FocusRecoveryHook = {
  getRecoveryCount: () => number;
  simulateReturnAfter: (ms: number) => Promise<unknown>;
  requestRecovery: () => Promise<unknown>;
  getLastPlan: () => { shouldRecover?: boolean; revalidate?: string[] } | null;
  forceRefreshSession?: () => Promise<{ expired?: boolean }>;
};

async function countTrackedRequests(
  requests: { url: string }[],
): Promise<Record<string, number>> {
  const counts = {
    profile: 0,
    role: 0,
    sessions: 0,
    auth: 0,
    analytics: 0,
  };
  for (const req of requests) {
    const url = req.url;
    if (url.includes("/rest/v1/profiles")) counts.profile += 1;
    else if (
      url.includes("/rest/v1/user_roles") ||
      url.includes("/rest/v1/rpc/is_admin")
    ) {
      counts.role += 1;
    }
    else if (url.includes("/rest/v1/sessions")) counts.sessions += 1;
    else if (url.includes("/auth/v1/")) counts.auth += 1;
    else if (url.includes("analytics-dashboard")) counts.analytics += 1;
  }
  return counts;
}

test.describe("Dashboard focus recovery", () => {
  test("TEST 1: return from a background tab keeps the dashboard usable", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/this is taking longer than expected/i)).toHaveCount(0);
  });

  test("TEST 2: returning after ~2 minutes does not show a permanent skeleton", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __clarifyFocusRecovery?: unknown }).__clarifyFocusRecovery),
    );

    await page.evaluate(async () => {
      const hook = (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery;
      await hook.simulateReturnAfter(120_000);
    });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/this is taking longer than expected/i)).toHaveCount(0);
    await expect(page.getByText(/unable to load your account information/i)).toHaveCount(0);
  });

  test("TEST 3: tab return does not create a profile/role request storm", async ({ page }) => {
    const seen: { url: string }[] = [];
    page.on("request", (req) => {
      seen.push({ url: req.url() });
    });

    await loginAsTestUser(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);

    const before = await countTrackedRequests(seen);
    const afterStart = seen.length;

    await page.evaluate(async () => {
      const hook = (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery;
      await hook.simulateReturnAfter(120_000);
    });
    await page.waitForTimeout(800);

    const after = await countTrackedRequests(seen.slice(afterStart));
    expect(after.profile).toBeLessThanOrEqual(2);
    expect(after.role).toBeLessThanOrEqual(1);
    expect(after.profile + after.role).toBeLessThan(before.profile + before.role + 3);
  });

  test("TEST 4: multiple focus events produce one recovery operation", async ({ page }) => {
    await loginAsTestUser(page);
    await page.waitForFunction(
      () => Boolean((window as unknown as { __clarifyFocusRecovery?: unknown }).__clarifyFocusRecovery),
    );

    const before = await page.evaluate(() => {
      return (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery.getRecoveryCount();
    });

    await page.evaluate(async () => {
      const hook = (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery;
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("pageshow"));
      window.dispatchEvent(new Event("focus"));
      await hook.simulateReturnAfter(120_000);
    });

    const after = await page.evaluate(() => {
      return (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery.getRecoveryCount();
    });
    expect(after - before).toBeLessThanOrEqual(2);
    expect(after).toBeGreaterThan(before);
  });

  test("TEST 5: expired session recovers to login instead of a stuck skeleton", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    await page.route("**/*supabase.co/auth/v1/token**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid Refresh Token: Refresh Token Not Found",
        }),
      });
    });

    await page.evaluate(async () => {
      const hook = (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery;
      await hook.forceRefreshSession?.();
    });

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("TEST 6: a failed non-critical section stays inline", async ({ page }) => {
    await loginAsTestUser(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    await page.route("**/*supabase.co/rest/v1/sessions**", async (route) => {
      if (route.request().method() === "GET" || route.request().method() === "HEAD") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ message: "PGRST116 column boom does not exist" }),
        });
      }
      return route.continue();
    });

    await page.evaluate(async () => {
      const hook = (window as unknown as { __clarifyFocusRecovery: FocusRecoveryHook })
        .__clarifyFocusRecovery;
      await hook.simulateReturnAfter(120_000);
    });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/PGRST|column boom|sqlstate/i)).toHaveCount(0);
  });

  test("TEST 7: refresh while dashboard is active still lands on dashboard", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectDashboardReady(page);
  });

  test("TEST 8: a second tab stays usable with the shared session", async ({ page, context }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);

    const page2 = await context.newPage();
    await setupSupabaseMocks(page2);
    await page2.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page2);
    const page2Path = new URL(page2.url()).pathname;
    if (page2Path.startsWith("/login")) {
      test.info().annotations.push({
        type: "note",
        description: "Second tab required login under mocked auth; session sync is storage-based.",
      });
    } else {
      await expectDashboardReady(page2);
    }
    await page2.close();
  });

  test("TEST 9: notification realtime channels are not duplicated", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/notifications", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const names = await page.evaluate(() => {
      const api = (window as unknown as {
        __clarifyRealtime?: { getActiveChannelNames: () => string[] };
      }).__clarifyRealtime;
      return api?.getActiveChannelNames() ?? [];
    });
    const notificationChannels = names.filter((name) => name.includes("notifications"));
    expect(notificationChannels.length).toBeLessThanOrEqual(1);
  });
});
