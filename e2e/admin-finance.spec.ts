/**
 * @see Plan: Admin Cost, Revenue, and Contribution P&L Dashboard
 */
import { test, expect, loginAsTestUser } from "../playwright-fixture";

test.describe("Admin Finance dashboard", () => {
  test.describe.configure({ timeout: 90_000 });

  test("admin can open finance page and see period controls", async ({ page }) => {
    await loginAsTestUser(page, { isAdmin: true, planId: "pro", credits: 100 });

    await page.route("**/functions/v1/admin-finance-report**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          lastUpdated: new Date().toISOString(),
          period: {
            preset: "30d",
            fromIso: "2026-08-01T00:00:00.000Z",
            toIso: "2026-09-01T00:00:00.000Z",
            timezone: "UTC",
          },
          currency: "INR",
          usdToInr: 83,
          overview: {
            grossRevenuePaise: 0,
            purchaseCount: 0,
            averagePurchasePaise: 0,
            revenuePerPayingUserPaise: 0,
            payingUsers: 0,
            refundsPaise: 0,
            refundCount: 0,
            refundRate: 0,
            paymentFees: {
              amountPaise: null,
              quality: "not_configured",
              label: "COST UNKNOWN — payment fee rate not configured",
            },
            apiCost: { amountPaise: 0, quality: "estimated", label: "No provider usage in period" },
            apiCostBreakdown: {
              estimatedMicrocents: 0,
              actualMicrocents: 0,
              estimatedPaise: 0,
              actualPaise: 0,
              unknownRows: 0,
            },
            contribution: {
              contributionProfitPaise: 0,
              contributionMarginPercent: null,
              includedCosts: ["gross_revenue", "refunds", "api_cost"],
              excludedReasons: ["payment_fees:not_configured", "variable_infra:not_configured"],
              formulaLabel: "Contribution Profit",
              fixedOpexConfigured: false,
            },
            creditsConsumed: 0,
            creditsOutstanding: 100,
            creditsReservedOpen: 0,
          },
          revenueSplit: { creditPackPaise: 0, planPaise: 0, attributionNote: "UNKNOWN" },
          creditEconomy: {
            purchased: 0,
            granted: 0,
            used: 0,
            released: 0,
            refunded: 0,
            reservedOpen: 0,
            outstanding: 100,
            note: "Unused credits are liability, not revenue",
          },
          timeSeries: [],
          topProviders: [],
          featureEconomics: [],
          unitCosts: [],
          providerStatus: [
            { provider: "gemini", service: "ai", status: "configured", identifier: "••••••••abcd" },
          ],
          reconciliation: [
            {
              id: "REC-PAYMENT-FEES",
              severity: "major",
              title: "Razorpay fees require configuration",
              detail: "Set billing_settings.payment_fee_rate_bps",
              status: "open",
            },
          ],
          dataQuality: { revenue: "actual", paymentFees: "not_configured" },
          recentOrders: [],
        }),
      });
    });

    await page.goto("/app/admin/finance", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Finance$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Profit & Loss Statement/i)).toBeVisible();
    await expect(page.getByText(/Profit \/ Loss by Feature/i)).toBeVisible();
    await expect(page.getByText(/COST UNKNOWN/i).first()).toBeVisible();
    await expect(page.getByText(/Reconciliation issues/i)).toBeVisible();
    await expect(page.getByText(/REC-PAYMENT-FEES/)).toBeVisible();
    await expect(page.getByText(/No data for this period/i).first()).toBeVisible();
    // Secrets must not appear
    await expect(page.locator("body")).not.toContainText(/sk-[a-zA-Z0-9]{10,}/);
  });
});
