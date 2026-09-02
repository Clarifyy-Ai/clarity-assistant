import { test, expect } from "../playwright-fixture";
import {
  setupSupabaseMocks,
  dismissCookieBanner,
  loginAsTestUser,
  E2E_TEST_USER,
} from "./helpers/auth-flow";

test.describe("Settings billing history pagination", () => {
  test("next advances page label when more than one page of rows exists", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await dismissCookieBanner(page);

    const ledger = Array.from({ length: 20 }, (_, i) => ({
      id: `e2e-credit-${i}`,
      user_id: E2E_TEST_USER.id,
      amount: i % 2 === 0 ? -5 : 50,
      balance_after: 100 - i,
      action: i % 2 === 0 ? "usage:prep_tool" : "purchase:credits",
      description: `E2E transaction ${i + 1}`,
      created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
    }));

    // Register AFTER login mocks so these win over the catch-all supabase route.
    await page.route("**/rest/v1/credit_transactions**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        body: JSON.stringify(ledger),
      });
    });
    await page.route("**/rest/v1/payment_orders**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        body: JSON.stringify([]),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });

    const pageLabel = page.getByTestId("billing-history-page");
    await expect(pageLabel).toBeVisible({ timeout: 20_000 });
    await expect(pageLabel).toContainText(/Page\s+1\s+of\s+\d+/i);

    const next = page.getByTestId("billing-history-next");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(pageLabel).toContainText(/Page\s+2\s+of\s+\d+/i);
  });

  test("refund ledger rows appear when present", async ({ page }) => {
    await loginAsTestUser(page);
    await dismissCookieBanner(page);
    await page.route("**/rest/v1/payment_orders**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        body: JSON.stringify([
          {
            id: "po-refund-1",
            user_id: E2E_TEST_USER.id,
            status: "refunded",
            amount_paise: 69900,
            currency: "INR",
            product_type: "credits_50",
            provider: "razorpay",
            credits_granted: 50,
            created_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
          },
        ]),
      });
    });
    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await page.getByTestId("billing-history-refresh").click();
    const refundFilter = page.getByTestId("billing-history-filter");
    if (await refundFilter.count()) {
      await refundFilter.selectOption("refund").catch(() => undefined);
    }
    await expect(page.getByTestId("billing-refund-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Refund|refunded/i).first()).toBeVisible();
  });
});
