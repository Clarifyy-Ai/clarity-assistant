import { test, expect, loginAsTestUser } from "../playwright-fixture";

test.describe("System Design WS14", () => {
  test("generates once without looping and can save", async ({ page }) => {
    await loginAsTestUser(page);

    let prepToolCalls = 0;
    await page.route("**/functions/v1/prep-tool**", async (route) => {
      prepToolCalls += 1;
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({
          success: true,
          data: {
            result: `## 1. Requirements
Shorten URLs and redirect with analytics.

## 2. High-level architecture
API, cache, and database collaborate for reads and writes.

## 3. Data model
urls table with unique short codes.

## 4. Scaling
Shard by code and cache hot keys.

## 5. Tradeoffs
Eventual analytics consistency vs write latency.
`,
          },
          meta: { creditsCharged: 8 },
        }),
      });
    });

    await page.goto("/app/prep/system-design", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "System Design" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByText("Design a URL Shortener").first().click({ force: true });
    const generateBtn = page.getByRole("button", { name: /Get AI breakdown/i });
    await expect(generateBtn).toBeEnabled({ timeout: 15_000 });
    await generateBtn.dispatchEvent("click");

    await expect(page.getByText(/AI Design Breakdown/i)).toBeVisible({
      timeout: 15_000,
    });
    expect(prepToolCalls).toBe(1);

    await page.getByRole("button", { name: /^Save$/i }).dispatchEvent("click");
    await expect(page.getByText("Design notes saved to Answer Bank").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("provider failure does not invent offline design", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/prep-tool**", async (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({
          success: false,
          error: "AI service temporarily unavailable. Credits refunded.",
          code: "PROVIDER_UNAVAILABLE",
        }),
      });
    });

    await page.goto("/app/prep/system-design", { waitUntil: "networkidle" });
    await page.getByText("Design a URL Shortener").first().click({ force: true });
    const generateBtn = page.getByRole("button", { name: /Get AI breakdown/i });
    await expect(generateBtn).toBeEnabled({ timeout: 15_000 });
    await generateBtn.dispatchEvent("click");

    await expect(page.getByText(/temporarily unavailable/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Offline/i)).toHaveCount(0);
  });
});
