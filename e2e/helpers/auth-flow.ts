import type { Page } from "@playwright/test";
import { E2E_TEST_USER, setupSupabaseMocks } from "./supabase-mock";

export { E2E_TEST_USER, setupSupabaseMocks };

export async function fillSignupForm(
  page: Page,
  data: {
    fullName: string;
    email: string;
    password: string;
    acceptTerms?: boolean;
  }
): Promise<void> {
  await page.locator('input[name="fullName"]').fill(data.fullName);
  await page.locator('input[name="email"]').fill(data.email);
  await page.locator('input[name="password"]').fill(data.password);
  await page.locator('input[name="confirmPassword"]').fill(data.password);

  const terms = page.locator('input[name="acceptTerms"]');
  const checked = await terms.isChecked();
  const shouldAccept = data.acceptTerms !== false;

  if (shouldAccept !== checked) {
    await terms.click();
  }
}

export async function fillLoginForm(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
}

/** Log in via UI with mocked Supabase responses; lands on /app/dashboard. */
export async function loginAsTestUser(
  page: Page,
  options?: Parameters<typeof setupSupabaseMocks>[1],
): Promise<void> {
  await setupSupabaseMocks(page, options);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page);
  await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app\/dashboard/, { timeout: 20_000 });
}

/** Dismiss cookie banner when it blocks interactions. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: "Accept All" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}
