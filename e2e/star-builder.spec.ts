import { test, expect, loginAsTestUser } from "../playwright-fixture";

const CORS = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
});

test.describe("STAR Builder WS15", () => {
  test("polishes once and preserves original on reject", async ({ page }) => {
    await loginAsTestUser(page);

    let prepToolCalls = 0;
    await page.route("**/functions/v1/prep-tool**", async (route) => {
      prepToolCalls += 1;
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS(origin),
        body: JSON.stringify({
          success: true,
          data: {
            result: `Situation: At Acme I owned checkout reliability during peak traffic.
Task: Reduce failed payments without inventing new employers.
Action: I added retries and monitoring for the payment gateway.
Result: Checkout failures dropped using metrics already described.`,
            source: "ai",
            draft_kind: "polished",
          },
          meta: { creditsCharged: 10 },
        }),
      });
    });

    await page.goto("/app/prep/star-builder", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /STAR Builder/i })).toBeVisible({
      timeout: 15_000,
    });

    const original = "At Acme I owned checkout reliability during peak traffic.";
    await page.locator('input[placeholder*="Tell me about a time"]').fill(
      "Tell me about a reliability incident.",
    );
    await page.locator("textarea").nth(0).fill(original);
    await page.locator("textarea").nth(1).fill("Reduce failed payments.");
    await page.locator("textarea").nth(2).fill("I added retries and monitoring.");
    await page.locator("textarea").nth(3).fill("Checkout failures dropped.");

    await page.getByRole("button", { name: /AI Polish/i }).dispatchEvent("click");
    await expect(page.getByText("AI polished")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Answer polished/i)).toBeVisible();
    expect(prepToolCalls).toBe(1);

    await page.getByRole("button", { name: /Restore original/i }).dispatchEvent("click");
    await expect(page.locator("textarea").nth(0)).toHaveValue(original);
  });

  test("soft AI-down keeps input-based draft without credit error", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/prep-tool**", async (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS(origin),
        body: JSON.stringify({
          success: true,
          data: {
            result: `Situation: At Acme I owned checkout reliability during peak traffic.

Task: Reduce failed payments without inventing new employers.

Action: I added retries and monitoring for the payment gateway.

Result: Checkout failures dropped using metrics already described.

_AI polish is temporarily unavailable — this STAR outline is a draft. Replace placeholders with your real experience before saving._`,
            source: "deterministic",
            draft_kind: "input_based",
          },
          meta: { creditsCharged: 0, source: "deterministic" },
        }),
      });
    });

    await page.goto("/app/prep/star-builder", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /STAR Builder/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator("textarea").nth(0).fill(
      "At Acme I owned checkout reliability during peak traffic.",
    );
    await page.locator("textarea").nth(1).fill("Reduce failed payments without inventing new employers.");
    await page.locator("textarea").nth(2).fill("I added retries and monitoring for the payment gateway.");
    await page.locator("textarea").nth(3).fill("Checkout failures dropped using metrics already described.");

    await page.getByRole("button", { name: /AI Polish/i }).dispatchEvent("click");

    await expect(page.getByRole("status").filter({ hasText: /Input-based draft/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Draft ready \(AI polish unavailable\)/i)).toBeVisible();
    await expect(page.getByText(/insufficient credits/i)).toHaveCount(0);
    await expect(page.getByText(/Answer polished/i)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("provider 502 keeps original content", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/prep-tool**", async (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        headers: CORS(origin),
        body: JSON.stringify({
          success: false,
          error: "AI improvement is temporarily unavailable.",
          code: "PROVIDER_UNAVAILABLE",
        }),
      });
    });

    await page.goto("/app/prep/star-builder", { waitUntil: "networkidle" });
    const original = "Original situation text that must remain.";
    await page.locator("textarea").nth(0).fill(original);
    await page.locator("textarea").nth(1).fill("Task text here for polish.");
    await page.locator("textarea").nth(2).fill("Action text here for polish.");
    await page.locator("textarea").nth(3).fill("Result text here for polish.");

    await page.getByRole("button", { name: /AI Polish/i }).dispatchEvent("click");
    await expect(page.getByText(/temporarily unavailable/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("textarea").nth(0)).toHaveValue(original);
  });

  test("provider 502 is not mislabeled as insufficient credits", async ({ page }) => {
    await loginAsTestUser(page);

    // Healthy balance so any credit messaging would be a false positive.
    await page.route("**/rest/v1/user_credits**", async (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS(origin) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS(origin),
        body: JSON.stringify([{ balance: 500, plan: "pro" }]),
      });
    });

    await page.route("**/functions/v1/prep-tool**", async (route) => {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        headers: CORS(origin),
        body: JSON.stringify({
          success: false,
          error: "AI improvement is temporarily unavailable.",
          code: "PROVIDER_UNAVAILABLE",
        }),
      });
    });

    await page.goto("/app/prep/star-builder", { waitUntil: "networkidle" });
    await page.locator("textarea").nth(0).fill("Situation with enough length for polish.");
    await page.locator("textarea").nth(1).fill("Task with enough length for polish.");
    await page.locator("textarea").nth(2).fill("Action with enough length for polish.");
    await page.locator("textarea").nth(3).fill("Result with enough length for polish.");

    await page.getByRole("button", { name: /AI Polish/i }).dispatchEvent("click");
    await expect(page.getByText(/temporarily unavailable/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/insufficient credits/i)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
