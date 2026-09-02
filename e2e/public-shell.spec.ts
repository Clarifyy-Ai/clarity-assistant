import {
  test,
  expect,
  dismissCookieBanner,
  setupSupabaseMocks,
} from "../playwright-fixture";

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 720 };

const PUBLIC_MARKETING_ROUTES = [
  { path: "/", heading: /Navigate Your Career|Prepare With Confidence|Career Pilot/i },
  { path: "/terms", heading: /Terms/i },
  { path: "/privacy", heading: /Privacy/i },
  { path: "/verify-certificate", heading: /certificate|verify/i },
] as const;

/** Matches src/lib/constants/contact.ts UNIVERSAL_EMAIL */
const CONTACT_EMAIL = "hello@trycareerpilot.com";

const LEGAL_MAILTO_ROUTES = [
  { path: "/terms", caseId: "TC-PUB-007" },
  { path: "/privacy", caseId: "TC-PUB-008" },
] as const;

test.describe("BUG-011 public shell consistency", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  for (const route of PUBLIC_MARKETING_ROUTES) {
    test(`${route.path} uses shared marketing chrome on desktop`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await dismissCookieBanner(page);

      await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible();
    });
  }

  test("footer has a single signup CTA and single Help Center link", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Get started free" })).toHaveCount(1);
    await expect(footer.getByRole("link", { name: "Help Center" })).toHaveCount(1);
    await expect(footer.getByRole("link", { name: "Sign up free" })).toHaveCount(0);
  });

  test("verify-certificate mobile layout keeps certificate form visible", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/verify-certificate", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    await expect(page.getByTestId("dd-layout-root")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(/certificate id/i)).toBeVisible();
    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
  });

  test("landing footer exposes TC-PUB-014 company links", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    const footer = page.getByRole("contentinfo");
    for (const label of ["About", "Industries", "Cookies", "FAQ"] as const) {
      await expect(footer.getByRole("link", { name: label }).first()).toBeVisible();
    }
  });

  test("guest 404 keeps marketing footer company links", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/this-page-does-not-exist-qa-", { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Industries" }).first()).toBeVisible();
    await expect(footer.getByRole("link", { name: "Cookies" }).first()).toBeVisible();
  });
});

test.describe("TC-PUB-007 / TC-PUB-008 legal mailto links", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
  });

  for (const route of LEGAL_MAILTO_ROUTES) {
    test(`${route.caseId} ${route.path} exposes native mailto contact link`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await dismissCookieBanner(page);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });

      const contactLink = page.locator("article").getByRole("link", { name: CONTACT_EMAIL });
      await contactLink.scrollIntoViewIfNeeded();
      await expect(contactLink).toBeVisible({ timeout: 10_000 });
      await expect(contactLink).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);

      const clickBehavior = await contactLink.evaluate((el) => {
        const anchor = el as HTMLAnchorElement;
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        anchor.dispatchEvent(event);
        return {
          tagName: anchor.tagName,
          hasOnClickAttr: anchor.hasAttribute("onclick"),
          defaultPrevented: event.defaultPrevented,
        };
      });

      expect(clickBehavior.tagName).toBe("A");
      expect(clickBehavior.hasOnClickAttr).toBe(false);
      expect(clickBehavior.defaultPrevented).toBe(false);
    });
  }
});
