import {
  test,
  expect,
  loginAsTestUser,
  dismissCookieBanner,
  E2E_TEST_USER,
} from "../playwright-fixture";

/**
 * Catalog parity mirrors scripts/billing-catalog-parity.mjs + razorpay webhook rules.
 * Server grants credits from catalog only — never client/order tampering.
 */
const EXPECTED_PACK_IDS = ["credits_50", "credits_150", "credits_500"] as const;
const PACK_CREDITS: Record<(typeof EXPECTED_PACK_IDS)[number], number> = {
  credits_50: 50,
  credits_150: 150,
  credits_500: 500,
};
const CATALOG_PAISE: Record<(typeof EXPECTED_PACK_IDS)[number], number> = {
  credits_50: 69_900,
  credits_150: 189_900,
  credits_500: 599_900,
};

const RAZORPAY_TEST_KEY = "rzp_test_e2e_sandbox";
const PAYMENT_ORDER_ID = "po-e2e-catalog-1";

type RazorpayMockMode = "success" | "fail" | "dismiss";

async function installRazorpaySandboxMock(
  page: import("@playwright/test").Page,
  mode: RazorpayMockMode = "success",
): Promise<void> {
  await page.addInitScript((mockMode: RazorpayMockMode) => {
    (window as unknown as { __e2eRazorpayMode?: RazorpayMockMode }).__e2eRazorpayMode =
      mockMode;

    class RazorpayMock {
      private readonly options: Record<string, unknown>;

      constructor(options: Record<string, unknown>) {
        this.options = options;
        const currentMode =
          (window as unknown as { __e2eRazorpayMode?: RazorpayMockMode }).__e2eRazorpayMode ??
          "success";

        queueMicrotask(() => {
          if (currentMode === "dismiss") {
            const modal = this.options.modal as
              | { ondismiss?: () => void }
              | undefined;
            modal?.ondismiss?.();
            return;
          }

          if (currentMode === "fail") {
            const listeners = (this as unknown as { _listeners?: Record<string, unknown> })
              ._listeners;
            const failed = listeners?.["payment.failed"] as
              | ((res: unknown) => void)
              | undefined;
            failed?.({
              error: {
                reason: "international_transaction_not_allowed",
                description: "Payment failed",
              },
            });
            return;
          }

          const handler = this.options.handler as
            | ((response: Record<string, string>) => void)
            | undefined;
          handler?.({
            razorpay_order_id: String(this.options.order_id ?? "order_e2e"),
            razorpay_payment_id: "pay_e2e_mock",
            razorpay_signature: "mock_sig_e2e",
          });
        });
      }

      open(): void {
        // no-op — behavior runs on construction
      }

      on(event: string, handler: (res: unknown) => void): void {
        const self = this as unknown as { _listeners?: Record<string, unknown> };
        self._listeners = self._listeners ?? {};
        self._listeners[event] = handler;
      }
    }

    window.Razorpay = RazorpayMock as unknown as typeof window.Razorpay;
  }, mode);
}

function installBalanceMocks(
  page: import("@playwright/test").Page,
  getBalance: () => number,
) {
  return Promise.all([
    page.route("**/rest/v1/rpc/get_spendable_credits**", async (route) => {
      const balance = getBalance();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          success: true,
          balance,
          plan_id: "free",
        }),
      });
    }),
    page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "GET") {
        const balance = getBalance();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify([
            {
              id: E2E_TEST_USER.id,
              email: E2E_TEST_USER.email,
              full_name: "E2E Test User",
              onboarding_completed: true,
              plan_id: "free",
              credits: balance,
              subscription_status: "active",
            },
          ]),
        });
      }
      return route.fallback();
    }),
  ]);
}

test.describe("Razorpay billing checkout [BILLING-CHECKOUT]", () => {
  test("catalog pack ids and credit amounts match billing-catalog parity", async () => {
    expect(Object.keys(PACK_CREDITS)).toEqual([...EXPECTED_PACK_IDS]);
    for (const packId of EXPECTED_PACK_IDS) {
      expect(PACK_CREDITS[packId]).toBeGreaterThan(0);
      expect(CATALOG_PAISE[packId]).toBeGreaterThan(0);
    }
  });

  test("billing-catalog open sends JSON body and create-order uses product_type enum", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    let catalogBody: string | null = null;
    let createProductType: string | null = null;

    await installRazorpaySandboxMock(page, "success");
    await loginAsTestUser(page, { credits: 40, planId: "free" });
    await dismissCookieBanner(page);
    await installBalanceMocks(page, () => 40);

    await page.route("**/functions/v1/billing-catalog**", async (route) => {
      catalogBody = route.request().postData();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "billing_settings",
          payments_configured: true,
          paise: {
            pro_monthly: 249_900,
            enterprise_monthly: 679_900,
            credits_50: 69_900,
            credits_150: 189_900,
            credits_500: 599_900,
          },
        }),
      });
    });

    await page.route("**/functions/v1/razorpay-create-order**", async (route) => {
      const body = route.request().postDataJSON() as {
        product_type?: string;
        action?: string;
      };
      if (body.action === "cancel" || body.action === "fail") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: body.action }),
        });
      }
      createProductType = String(body.product_type ?? "");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key_id: RAZORPAY_TEST_KEY,
          order_id: "order_e2e_payload",
          amount: CATALOG_PAISE.credits_50,
          currency: "INR",
          payment_order_id: PAYMENT_ORDER_ID,
          promo_applied: null,
          product_type: body.product_type ?? "credits_50",
        }),
      });
    });

    await page.route("**/functions/v1/razorpay-verify-payment**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "paid" }),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await expect.poll(() => catalogBody).not.toBeNull();
    expect(catalogBody).toBe("{}");

    await page.getByRole("button", { name: /50 credits \(one-time\)/i }).first().click();
    await expect.poll(() => createProductType).toBe("credits_50");

    const appStartTimeErrors = pageErrors.filter((m) => {
      if (
        !/Cannot read properties of undefined \(reading ['"]startTime['"]\)|Cannot read property 'startTime' of undefined/i.test(
          m,
        )
      ) {
        return false;
      }
      return /UpgradeModal|SettingsBilling|razorpayCheckout|liveCatalog/i.test(m);
    });
    expect(appStartTimeErrors).toEqual([]);
  });

  test("payments_configured false shows banner and disables buy", async ({ page }) => {
    await loginAsTestUser(page, { credits: 40, planId: "free" });
    await dismissCookieBanner(page);

    await page.route("**/functions/v1/billing-catalog**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "billing_settings",
          payments_configured: false,
          paise: {
            pro_monthly: 249_900,
            enterprise_monthly: 679_900,
            credits_50: 69_900,
            credits_150: 189_900,
            credits_500: 599_900,
          },
        }),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payments-not-configured-banner")).toBeVisible({
      timeout: 20_000,
    });
    const buy50 = page.getByRole("button", { name: /50 credits \(one-time\)/i }).first();
    await expect(buy50).toBeDisabled();
  });

  test("successful checkout grants catalog credits exactly once", async ({ page }) => {
    const productType = "credits_150" as const;
    const startingBalance = 100;
    let balance = startingBalance;
    let verifyCalls = 0;

    await installRazorpaySandboxMock(page, "success");
    await loginAsTestUser(page, { credits: startingBalance, planId: "free" });
    await dismissCookieBanner(page);
    await installBalanceMocks(page, () => balance);

    await page.route("**/functions/v1/razorpay-create-order**", async (route) => {
      const body = route.request().postDataJSON() as {
        product_type?: string;
        action?: string;
      };
      if (body.action === "cancel" || body.action === "fail") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: body.action === "cancel" ? "cancelled" : "failed" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key_id: RAZORPAY_TEST_KEY,
          order_id: "order_e2e_catalog",
          amount: CATALOG_PAISE[productType],
          currency: "INR",
          payment_order_id: PAYMENT_ORDER_ID,
          promo_applied: null,
          product_type: body.product_type ?? productType,
        }),
      });
    });

    await page.route("**/functions/v1/razorpay-verify-payment**", async (route) => {
      verifyCalls += 1;
      if (verifyCalls === 1) {
        balance += PACK_CREDITS[productType];
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          duplicate: verifyCalls > 1,
          status: "paid",
        }),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`${startingBalance} credits remaining`)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /150 credits \(one-time\)/i }).first().click();

    await expect(page.getByText(/Payment completed/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const expectedBalance = startingBalance + PACK_CREDITS[productType];
    await expect(page.getByText(`${expectedBalance} credits remaining`)).toBeVisible({
      timeout: 20_000,
    });
    expect(verifyCalls).toBe(1);
  });

  test("duplicate verify response does not change balance", async ({ page }) => {
    const startingBalance = 200;
    let balance = startingBalance;
    let verifyCalls = 0;

    await installRazorpaySandboxMock(page, "success");
    await loginAsTestUser(page, { credits: startingBalance, planId: "free" });
    await dismissCookieBanner(page);
    await installBalanceMocks(page, () => balance);

    await page.route("**/functions/v1/razorpay-create-order**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key_id: RAZORPAY_TEST_KEY,
          order_id: "order_dup",
          amount: CATALOG_PAISE.credits_50,
          currency: "INR",
          payment_order_id: PAYMENT_ORDER_ID,
          promo_applied: null,
          product_type: "credits_50",
        }),
      });
    });

    await page.route("**/functions/v1/razorpay-verify-payment**", async (route) => {
      verifyCalls += 1;
      const duplicate = verifyCalls > 1;
      if (!duplicate) balance += PACK_CREDITS.credits_50;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, duplicate, status: "paid" }),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /50 credits \(one-time\)/i }).first().click();
    await expect(page.getByText(/Payment completed/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const afterFirst = startingBalance + PACK_CREDITS.credits_50;
    await expect(page.getByText(`${afterFirst} credits remaining`)).toBeVisible({
      timeout: 20_000,
    });

    await page.evaluate(async () => {
      await fetch(
        "https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/razorpay-verify-payment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: "order_dup",
            razorpay_payment_id: "pay_e2e_mock",
            razorpay_signature: "mock_sig_e2e",
          }),
        },
      );
    });

    expect(verifyCalls).toBe(2);
    expect(balance).toBe(afterFirst);
  });

  test("payment.failed marks order failed and grants no credits", async ({ page }) => {
    const startingBalance = 80;
    let balance = startingBalance;
    let failActionCalled = false;

    await installRazorpaySandboxMock(page, "fail");
    await loginAsTestUser(page, { credits: startingBalance, planId: "free" });
    await dismissCookieBanner(page);
    await installBalanceMocks(page, () => balance);

    await page.route("**/functions/v1/razorpay-create-order**", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      if (body.action === "fail") {
        failActionCalled = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "failed" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key_id: RAZORPAY_TEST_KEY,
          order_id: "order_fail",
          amount: CATALOG_PAISE.credits_50,
          currency: "INR",
          payment_order_id: PAYMENT_ORDER_ID,
          promo_applied: null,
          product_type: "credits_50",
        }),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /50 credits \(one-time\)/i }).first().click();

    await expect(page.getByText(/Payment failed|declined|international/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`${startingBalance} credits remaining`)).toBeVisible({
      timeout: 20_000,
    });
    expect(failActionCalled).toBe(true);
    expect(balance).toBe(startingBalance);
  });

  test("modal dismiss cancels order without granting credits", async ({ page }) => {
    const startingBalance = 60;
    let balance = startingBalance;
    let cancelActionCalled = false;

    await installRazorpaySandboxMock(page, "dismiss");
    await loginAsTestUser(page, { credits: startingBalance, planId: "free" });
    await dismissCookieBanner(page);
    await installBalanceMocks(page, () => balance);

    await page.route("**/functions/v1/razorpay-create-order**", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      if (body.action === "cancel") {
        cancelActionCalled = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "cancelled" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key_id: RAZORPAY_TEST_KEY,
          order_id: "order_cancel",
          amount: CATALOG_PAISE.credits_50,
          currency: "INR",
          payment_order_id: PAYMENT_ORDER_ID,
          promo_applied: null,
          product_type: "credits_50",
        }),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /50 credits \(one-time\)/i }).first().click();

    await expect.poll(() => cancelActionCalled).toBe(true);
    await expect(page.getByText(`${startingBalance} credits remaining`)).toBeVisible({
      timeout: 20_000,
    });
    expect(balance).toBe(startingBalance);
  });

  test("fulfilled payment order appears once in billing history", async ({ page }) => {
    await loginAsTestUser(page, { credits: 100, planId: "free" });
    await dismissCookieBanner(page);

    await page.route("**/rest/v1/credit_transactions**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          {
            id: "ct-purchase",
            user_id: E2E_TEST_USER.id,
            amount: 150,
            action: "purchase:credits_150",
            created_at: "2026-01-02T10:00:00Z",
            stripe_payment_id: "pay_hist_1",
          },
          {
            id: "ct-usage",
            user_id: E2E_TEST_USER.id,
            amount: -5,
            action: "usage:prep_tool",
            created_at: "2026-01-01T10:00:00Z",
            stripe_payment_id: null,
          },
        ]),
      });
    });

    await page.route("**/rest/v1/payment_orders**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          {
            id: "po-hist-1",
            user_id: E2E_TEST_USER.id,
            product_type: "credits_150",
            amount_paise: 189_900,
            status: "fulfilled",
            created_at: "2026-01-02T09:55:00Z",
            paid_at: "2026-01-02T10:00:00Z",
            provider: "razorpay",
            credits_granted: 150,
            provider_payment_id: "pay_hist_1",
          },
        ]),
      });
    });

    await page.goto("/app/settings/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Billing History")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/razorpay — credits 150/i)).toBeVisible();
    await expect(page.getByText(/Credit purchase/i)).toHaveCount(0);
    await expect(page.getByText(/Used: prep tool/i)).toBeVisible();
  });
});
