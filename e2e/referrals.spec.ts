import { test, expect, loginAsTestUser } from "../playwright-fixture";
import { dismissCookieBanner } from "./helpers/auth-flow";

const DASHBOARD = {
  programme: {
    id: "prog-1",
    name: "Career Pilot Referral v1",
    version: "referral-v1",
    status: "active",
    qualifyingEvent: "authenticated_claim",
    referrerCreditReward: 25,
    refereeCreditReward: 25,
    referralDiscountPercent: 50,
    maximumRewards: null,
    termsUrl: null,
    startAt: new Date().toISOString(),
    endAt: null,
  },
  account: {
    eligible: true,
    referralCode: "E2EREF01",
    referralLink: "https://trycareerpilot.com/signup?ref=E2EREF01",
    referralLinkBase: "https://trycareerpilot.com/signup?ref=",
    eligibilityReason: null,
  },
  summary: {
    attributed: 1,
    pending: 0,
    qualified: 0,
    rewarded: 1,
    creditsEarned: 25,
  },
  history: [
    {
      id: "ref-1",
      referredEmailMasked: "f***@example.com",
      referredId: "user-b",
      status: "rewarded",
      creditsAwarded: 25,
      signedUpAt: new Date().toISOString(),
      convertedAt: null,
      rewardedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
};

test.describe("Referrals page", () => {
  test("shows canonical link, copy, history filters; stores ?ref= on marketing", async ({
    page,
  }) => {
    await page.goto("/pricing?ref=ABC123XY", { waitUntil: "domcontentloaded" });
    const stored = await page.evaluate(() => localStorage.getItem("clarify_ref"));
    expect(stored).toBe("ABC123XY");

    await loginAsTestUser(page);
    await dismissCookieBanner(page);

    await page.route("**/rest/v1/rpc/get_referral_dashboard", async (route) => {
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
        body: JSON.stringify(DASHBOARD),
      });
    });

    await page.goto("/app/referrals", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("referral-link")).toContainText(
      "https://trycareerpilot.com/signup?ref=E2EREF01",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("referral-code")).toHaveText("E2EREF01");
    await expect(page.getByTestId("referral-history")).toBeVisible();
    await expect(page.getByTestId("referral-history-filters")).toBeVisible();

    await page.getByTestId("referral-copy").click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (clipboard) {
      expect(clipboard).toContain("trycareerpilot.com/signup?ref=E2EREF01");
    }
  });

  test("shows Retry on dashboard failure instead of empty signups", async ({ page }) => {
    await loginAsTestUser(page);
    await dismissCookieBanner(page);

    await page.route("**/rest/v1/rpc/get_referral_dashboard", async (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        body: JSON.stringify({ message: "boom", code: "PGRST000" }),
      });
    });

    await page.goto("/app/referrals", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Could not load|Retry|boom|failed/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("referral-empty")).toHaveCount(0);
  });

  for (const viewport of [
    { width: 375, height: 812, name: "mobile" },
    { width: 1280, height: 800, name: "desktop" },
  ] as const) {
    test(`responsive smoke (${viewport.name})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsTestUser(page);
      await dismissCookieBanner(page);
      await page.route("**/rest/v1/rpc/get_referral_dashboard", async (route) => {
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
          body: JSON.stringify({
            ...DASHBOARD,
            history: [],
            summary: { ...DASHBOARD.summary, attributed: 0, rewarded: 0, creditsEarned: 0 },
          }),
        });
      });
      await page.goto("/app/referrals", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("page-width-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("referral-link")).toBeVisible();
    });
  }
});
