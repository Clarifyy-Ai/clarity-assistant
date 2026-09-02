import {
  test,
  expect,
  setupSupabaseMocks,
  fillLoginForm,
  dismissCookieBanner,
  E2E_TEST_USER,
  expectDashboardReady,
  clickLogout,
  clearBrowserAuthState,
  loginAsTestUser,
} from "../playwright-fixture";

test.describe("Login flow [T-0894]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
  });

  test("signs in with mocked credentials and reaches dashboard", async ({
    page,
  }) => {
    await dismissCookieBanner(page);
    await fillLoginForm(page, E2E_TEST_USER.email, E2E_TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expectDashboardReady(page);
    await expect(page.getByText("E2E Test User").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await dismissCookieBanner(page);
    await fillLoginForm(page, "bad@example.com", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/Incorrect email or password/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows the same safe message for unknown email and wrong password [TC-AUTH-002]", async ({
    page,
  }) => {
    await dismissCookieBanner(page);

    await fillLoginForm(page, "nobody@example.com", "any-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    const unknownEmailAlert = page.getByRole("alert");
    await expect(unknownEmailAlert).toContainText(/Incorrect email or password/i, {
      timeout: 15_000,
    });
    await expect(unknownEmailAlert).not.toContainText(/token|jwt|invalid_grant|supabase|otp/i);
    await expect(page).toHaveURL(/\/login/);
    const unknownEmailCopy = (await unknownEmailAlert.textContent()) ?? "";

    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);
    await fillLoginForm(page, E2E_TEST_USER.email, "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    const wrongPasswordAlert = page.getByRole("alert");
    await expect(wrongPasswordAlert).toContainText(/Incorrect email or password/i, {
      timeout: 15_000,
    });
    await expect(wrongPasswordAlert).not.toContainText(/token|jwt|invalid_grant|supabase|otp/i);
    await expect(page).toHaveURL(/\/login/);
    const wrongPasswordCopy = (await wrongPasswordAlert.textContent()) ?? "";

    expect(unknownEmailCopy.replace(/\s+\(\d+ attempts? remaining\)/, "")).toBe(
      wrongPasswordCopy.replace(/\s+\(\d+ attempts? remaining\)/, ""),
    );
  });
});

test.describe("Login validation — TC-AUTH-004", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
    await dismissCookieBanner(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Welcome back" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
  });

  test("shows required errors when both fields are empty", async ({ page }) => {
    let tokenRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/auth/v1/token")
      ) {
        tokenRequests += 1;
      }
    });

    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();
    expect(tokenRequests).toBe(0);
  });

  test("shows email required when only password is filled", async ({ page }) => {
    await page.locator('input[name="password"]').fill("secret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Email is required.")).toBeVisible();
  });

  test("shows password required when only email is filled", async ({ page }) => {
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Password is required.")).toBeVisible();
  });

  test("shows invalid email format error", async ({ page }) => {
    await page.locator('input[name="email"]').fill("not-an-email");
    await page.locator('input[name="password"]').fill("secret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("rejects whitespace-only values", async ({ page }) => {
    await page.locator('input[name="email"]').fill("   ");
    await page.locator('input[name="password"]').fill("   ");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();
  });
});

test.describe("Logout [T-0901]", () => {
  test("logs out from settings and returns to login", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/settings", { waitUntil: "domcontentloaded" });
    await clickLogout(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.locator('input[name="email"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: /Welcome back|Sign in/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
