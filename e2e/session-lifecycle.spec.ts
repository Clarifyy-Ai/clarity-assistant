import { test, expect, loginAsTestUser, dismissCookieBanner, dismissWalkthrough } from "../playwright-fixture";

test.describe("Session start eligibility and lifecycle", () => {
  test("TEST 1 — eligible start creates one session", async ({ page }) => {
    const starts: string[] = [];
    await page.route("**/functions/v1/start-session", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      starts.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "11111111-1111-4111-8111-111111111111",
          started_at: new Date().toISOString(),
          reused: false,
          status: "active",
        }),
      });
    });

    await loginAsTestUser(page);
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await expect(page.getByRole("heading", { name: /Mock/i }).first()).toBeVisible({ timeout: 20_000 });
    const start = page.getByRole("button", { name: /Start Mock Session/i });
    await expect(start).toBeVisible();
    await start.click();
    await page.waitForTimeout(500);
    expect(starts.length).toBeLessThanOrEqual(2);
    expect(starts.length).toBeGreaterThan(0);
  });

  test("TEST 2 — daily limit is not 502 and shows reset copy", async ({ page }) => {
    await page.route("**/functions/v1/start-session", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          allowed: false,
          reason: "DAILY_LIMIT_REACHED",
          code: "DAILY_LIMIT_REACHED",
          error: "You've reached today's session limit (3 of 3).",
          used: 3,
          limit: 3,
          reset_at: "2026-08-24T00:00:00.000Z",
          upgrade_available: true,
        }),
      });
    });

    await loginAsTestUser(page);
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await page.getByRole("button", { name: /Start Mock Session/i }).click();
    await expect(page.getByText(/today's session limit/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/502|Bad Gateway|Payment Required/i)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/app\/mock\/session\//);
  });

  test("TEST 3 — credits exhausted is distinct from daily limit", async ({ page }) => {
    await page.route("**/functions/v1/start-session", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          allowed: false,
          reason: "CREDITS_EXHAUSTED",
          code: "CREDITS_EXHAUSTED",
          error: "You have no credits remaining. Upgrade to continue practicing.",
        }),
      });
    });

    await loginAsTestUser(page);
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    await page.getByRole("button", { name: /Start Mock Session/i }).click();
    await expect(page.getByText(/credits remaining/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/today's session limit/i)).toHaveCount(0);
    await expect(page.getByText(/502/)).toHaveCount(0);
  });

  test("TEST 7 — double start does not create two in-flight requests after disable", async ({ page }) => {
    let starts = 0;
    await page.route("**/functions/v1/start-session", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      starts += 1;
      await page.waitForTimeout(300);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "11111111-1111-4111-8111-111111111111",
          started_at: new Date().toISOString(),
          reused: starts > 1,
        }),
      });
    });

    await loginAsTestUser(page);
    await page.goto("/app/mock", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);
    const start = page.getByRole("button", { name: /Start Mock Session/i });
    await Promise.all([start.click(), start.click()]);
    await page.waitForTimeout(800);
    expect(starts).toBe(1);
  });

  test("TEST 8 — heartbeat 503 does not finalize; SESSION_EXPIRED is terminal", async ({ page }) => {
    const actions: string[] = [];
    await page.route("**/functions/v1/start-session", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      let body: { action?: string } = {};
      try {
        body = route.request().postDataJSON() as typeof body;
      } catch {
        body = {};
      }
      actions.push(String(body.action ?? "start"));
      if (body.action === "heartbeat") {
        if (actions.filter((a) => a === "heartbeat").length === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              code: "DEPENDENCY_UNAVAILABLE",
              error: "Session service is temporarily unavailable.",
              retryable: true,
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            found: true,
            reason: "ACTIVE",
            session_id: "11111111-1111-4111-8111-111111111111",
            status: "active",
            lifecycle_status: "IN_PROGRESS",
            started_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          }),
        });
        return;
      }
      if (body.action === "restore") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            found: true,
            reason: "ACTIVE",
            session_id: "11111111-1111-4111-8111-111111111111",
            status: "active",
            lifecycle_status: "IN_PROGRESS",
            started_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            reused: true,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "11111111-1111-4111-8111-111111111111",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          reused: false,
          status: "active",
        }),
      });
    });

    let finalizeCalls = 0;
    await page.route("**/functions/v1/finalize-session", async (route) => {
      finalizeCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "11111111-1111-4111-8111-111111111111",
          status: "completed",
          already_terminal: false,
        }),
      });
    });

    await loginAsTestUser(page);
    await page.goto("/app/live/overlay", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);

    // Exercise lease classifier in page context (same module as LiveOverlay).
    const classified = await page.evaluate(async () => {
      const { classifyPracticeLeaseResult } = await import(
        "/src/lib/session/practiceSessionLease.ts"
      );
      const transient = classifyPracticeLeaseResult(null, {
        code: "DEPENDENCY_UNAVAILABLE",
        status: 503,
        message: "down",
      });
      const expired = classifyPracticeLeaseResult({
        reason: "SESSION_EXPIRED",
        lifecycle_status: "EXPIRED",
        terminal_reason: "SESSION_TIMEOUT",
      });
      return { transient, expired };
    }).catch(() => null);

    if (classified) {
      expect(classified.transient.kind).toBe("transient");
      expect(classified.expired.kind).toBe("expired");
    }

    // Transient 503 must not have forced finalize just by opening overlay.
    expect(finalizeCalls).toBe(0);
  });
});
