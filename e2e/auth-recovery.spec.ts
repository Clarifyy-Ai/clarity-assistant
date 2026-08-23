import { test, expect, dismissCookieBanner } from "../playwright-fixture";

test.describe("Auth recovery & legacy dashboard route", () => {
  test("anonymous /dashboard reaches SPA and redirects toward login", async ({
    page,
  }) => {
    const response = await page.goto("/dashboard", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(
      (url) => url.pathname === "/login" || url.pathname === "/app/dashboard",
      { timeout: 20_000 },
    );
  });

  test("login shows session expired message from reason query", async ({
    page,
  }) => {
    await page.goto(
      "/login?reason=session_expired&returnTo=%2Fapp%2Fdashboard",
      { waitUntil: "domcontentloaded" },
    );
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Your session has expired\. Please sign in again\./i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("cold load has no CSP console violations for structured-data injection", async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/content security policy|refused to (execute|load)/i.test(text)) {
        cspViolations.push(text);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const actionable = cspViolations.filter(
      (v) =>
        /structured-data|inline script|CameraPlainVariable|cdn\.gpteng\.co/i.test(
          v,
        ),
    );
    expect(actionable).toEqual([]);
  });
});
