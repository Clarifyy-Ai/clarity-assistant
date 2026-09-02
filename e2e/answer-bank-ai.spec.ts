import { test, expect, loginAsTestUser } from "../playwright-fixture";

function prepToolFulfill(
  route: import("@playwright/test").Route,
  status: number,
  body: unknown,
): Promise<void> {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
    },
    body: JSON.stringify(body),
  });
}

async function openAddAnswerModal(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/app/answers", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Answer Bank", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Add Answer" }).first().dispatchEvent("click");
  await expect(page.getByRole("heading", { name: /Add Answer to bank/i })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Answer Bank Generate with AI", () => {
  test("star_method draft fills textarea for behavioural questions", async ({ page }) => {
    await loginAsTestUser(page);

    let toolId = "";
    await page.route("**/functions/v1/prep-tool**", async (route) => {
      try {
        const body = route.request().postDataJSON() as { tool_id?: string };
        toolId = body.tool_id ?? "";
      } catch {
        toolId = "";
      }
      await prepToolFulfill(route, 200, {
        success: true,
        data: {
          result: `Situation: At Acme I led a cross-functional reliability fix.
Task: Reduce checkout failures during peak traffic.
Action: I added retries and monitoring for the payment gateway.
Result: Checkout failures dropped using metrics from my draft.`,
          source: "ai",
        },
        meta: { creditsCharged: 10 },
      });
    });

    await openAddAnswerModal(page);
    await page
      .locator('input[placeholder*="Tell me about a time"]')
      .fill("Tell me about a time you improved reliability.");
    await page.getByRole("button", { name: /Generate with AI/i }).dispatchEvent("click");

    await expect(page.locator("textarea")).toHaveValue(/Situation: At Acme/i, {
      timeout: 15_000,
    });
    expect(toolId).toBe("star_method");
  });

  test("raw_prompt draft fills textarea for technical questions", async ({ page }) => {
    await loginAsTestUser(page);

    let toolId = "";
    await page.route("**/functions/v1/prep-tool**", async (route) => {
      try {
        const body = route.request().postDataJSON() as { tool_id?: string };
        toolId = body.tool_id ?? "";
      } catch {
        toolId = "";
      }
      await prepToolFulfill(route, 200, {
        success: true,
        data: {
          result:
            "I would design a cache with TTL eviction, write-through for hot keys, and metrics on hit rate.",
          source: "ai",
        },
        meta: { creditsCharged: 3 },
      });
    });

    await openAddAnswerModal(page);
    await page.getByRole("button", { name: "Technical", exact: true }).dispatchEvent("click");
    await page
      .locator('input[placeholder*="Tell me about a time"]')
      .fill("How would you design a distributed cache?");
    await page.getByRole("button", { name: /Generate with AI/i }).dispatchEvent("click");

    await expect(page.locator("textarea")).toHaveValue(/distributed cache/i, {
      timeout: 15_000,
    });
    expect(toolId).toBe("raw_prompt");
  });

  test("503 PROVIDER_UNAVAILABLE shows friendly toast, not raw HTTP 503", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/prep-tool**", async (route) => {
      await prepToolFulfill(route, 503, {
        success: false,
        error: "AI is temporarily unavailable. Credits refunded.",
        code: "PROVIDER_UNAVAILABLE",
      });
    });

    await openAddAnswerModal(page);
    await page
      .locator('input[placeholder*="Tell me about a time"]')
      .fill("Tell me about a leadership challenge.");
    await page.getByRole("button", { name: /Generate with AI/i }).dispatchEvent("click");

    await expect(page.getByText(/temporarily unavailable/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/HTTP\s*503/i)).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveValue("");
  });
});
