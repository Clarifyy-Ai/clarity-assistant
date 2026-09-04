/**
 * Desktop installer download — Interview Day + Dashboard + public /download CTA.
 * Covers: probe success, MIME fail-closed, missing path, shared CTA parity.
 */
import {
  test,
  expect,
  setupSupabaseMocks,
  clearBrowserAuthState,
  loginAsTestUser,
  expectDashboardReady,
} from "../playwright-fixture";

test.describe.configure({ timeout: 90_000 });

async function mockInstallerAvailable(page: import("@playwright/test").Page) {
  let probeHits = 0;
  await page.route("**/download/Career-Pilot-Setup.exe**", async (route) => {
    probeHits += 1;
    const method = route.request().method();
    return route.fulfill({
      status: method === "GET" ? 206 : 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": method === "GET" ? "1" : "85000000",
        ...(method === "GET" ? { "content-range": "bytes 0-0/85000000" } : {}),
      },
      body: method === "GET" ? Buffer.from([0]) : "",
    });
  });
  await page.route("**/download-windows.php**", async (route) => {
    probeHits += 1;
    return route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "85000000",
      },
      body: "",
    });
  });
  return () => probeHits;
}

async function mockInstallerMissing(page: import("@playwright/test").Page) {
  await page.route("**/download/Career-Pilot-Setup.exe**", async (route) => {
    return route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Not found",
    });
  });
  await page.route("**/download-windows.php**", async (route) => {
    return route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "Desktop installer not published",
    });
  });
}

async function mockInstallerHtmlDisguise(page: import("@playwright/test").Page) {
  await page.route("**/download/Career-Pilot-Setup.exe**", async (route) => {
    return route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/html",
        "content-length": "85000000",
      },
      body: "<html>not an installer</html>",
    });
  });
  await page.route("**/download-windows.php**", async (route) => {
    return route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/html",
        "content-length": "85000000",
      },
      body: "<html>not an installer</html>",
    });
  });
}

test.describe("Desktop Windows installer download", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
  });

  test("public /download CTA enabled when installer probe returns 200 octet-stream", async ({
    page,
  }) => {
    const hits = await mockInstallerAvailable(page);

    await page.goto("/download", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Windows installer/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("desktop-download-button")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("desktop-download-button")).toHaveAttribute(
      "data-installer-available",
      "true",
      { timeout: 20_000 },
    );
    const cta = page.getByTestId("desktop-download-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
    expect(hits()).toBeGreaterThan(0);

    await cta.click();
    await expect(page.getByText(/Download starting/i)).toBeVisible({ timeout: 10_000 });
    await cta.click();
    await expect(page.getByText(/Download starting/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("public /download fail-closes when installer paths are missing", async ({ page }) => {
    await mockInstallerMissing(page);

    await page.goto("/download", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Windows installer/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("desktop-download-button")).toHaveAttribute(
      "data-installer-available",
      "false",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("desktop-installer-unavailable")).toBeVisible();
    await expect(page.getByText(/Desktop app not available yet/i).first()).toBeVisible();
    await expect(page.getByTestId("desktop-download-cta")).toHaveCount(0);
  });

  test("public /download fail-closes when response is HTML disguised as 200", async ({ page }) => {
    await mockInstallerHtmlDisguise(page);

    await page.goto("/download", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("desktop-download-button")).toHaveAttribute(
      "data-installer-available",
      "false",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("desktop-download-cta")).toHaveCount(0);
  });

  test("Interview Day uses shared DesktopDownloadButton when available", async ({ page }) => {
    await mockInstallerAvailable(page);
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.goto("/app/interview-day", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("desktop-download-button").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("desktop-download-button").first()).toHaveAttribute(
      "data-installer-available",
      "true",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("desktop-download-cta").first()).toBeEnabled();
  });

  test("Dashboard uses the same shared download CTA when available", async ({ page }) => {
    await mockInstallerAvailable(page);
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("desktop-download-button").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("desktop-download-button").first()).toHaveAttribute(
      "data-installer-available",
      "true",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("desktop-download-cta").first()).toBeEnabled();
  });

  test("Interview Day fail-closes with unavailable copy when artifact missing", async ({
    page,
  }) => {
    await mockInstallerMissing(page);
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.goto("/app/interview-day", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("desktop-download-button").first()).toHaveAttribute(
      "data-installer-available",
      "false",
      { timeout: 20_000 },
    );
    await expect(page.getByText(/Desktop app not available yet|isn.?t published/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("desktop-download-cta")).toHaveCount(0);
  });
});
