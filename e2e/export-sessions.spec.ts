import { test, expect, loginAsTestUser } from "../playwright-fixture";

test.describe("Export sessions & scores (WS21)", () => {
  test("exports sessions CSV successfully", async ({ page }) => {
    await loginAsTestUser(page);

    await page.goto("/app/settings/data", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Data & Export/i })).toBeVisible({
      timeout: 15_000,
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByTestId("export-sessions").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/career-pilot-sessions-.*\.csv$/);

    const path = await download.path();
    if (path) {
      const fs = await import("node:fs/promises");
      const body = await fs.readFile(path, "utf8");
      expect(body.split("\n")[0]).toMatch(/^id,session_type,title,/);
    }

    await expect(page.getByText(/CSV export downloaded/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows rate-limit message and does not mark Done on 429", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/export-user-data**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "access-control-allow-headers":
              "authorization, apikey, content-type, idempotency-key, x-idempotency-key, x-client-info, x-request-id",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        });
        return;
      }
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
          "Retry-After": "60",
        },
        body: JSON.stringify({
          success: false,
          error: "Rate limit exceeded.",
          code: "RATE_LIMITED",
          retryAfterSeconds: 60,
        }),
      });
    });

    await page.goto("/app/settings/data", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Data & Export/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("export-sessions").click();

    await expect(page.getByText(/Export limit reached/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("export-sessions")).not.toHaveText(/Done/i);
  });

  test("double-click does not fire two export POSTs", async ({ page }) => {
    await loginAsTestUser(page);

    let postCount = 0;
    await page.route("**/functions/v1/export-user-data**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "access-control-allow-headers":
              "authorization, apikey, content-type, idempotency-key, x-idempotency-key, x-client-info, x-request-id",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        });
        return;
      }
      if (route.request().method() === "POST") {
        postCount += 1;
        // Hold briefly so a second click can race while exporting=true
        await new Promise((r) => setTimeout(r, 400));
      }
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
          "Content-Disposition": 'attachment; filename="career-pilot-export-sessions.json"',
        },
        body: JSON.stringify({
          exported_at: new Date().toISOString(),
          user_id: "e2e-user-0001-0001-0001-000000000001",
          sessions: [],
        }),
      });
    });

    await page.goto("/app/settings/data", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Data & Export/i })).toBeVisible({
      timeout: 15_000,
    });

    const btn = page.getByTestId("export-sessions");
    await btn.click();
    await btn.click({ force: true }).catch(() => undefined);

    await expect(page.getByText(/CSV export downloaded/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(postCount).toBe(1);
  });
});
