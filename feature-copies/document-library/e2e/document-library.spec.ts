import {
  test,
  expect,
  setupSupabaseMocks,
  clearBrowserAuthState,
  loginAsTestUser,
  expectDashboardReady,
} from "../playwright-fixture";

test.describe("Document library upload UX [T-13]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
  });

  test("library page shows accessible picker and rejects images clearly", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.goto("/app/library", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Document Library/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/PDF, DOCX, TXT, CSV, XLSX/i)).toBeVisible();
    await expect(page.getByText(/Choose file/i)).toBeVisible();

    await page.getByLabel(/I confirm I own this material/i).check();

    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      if (!input) throw new Error("file input missing");
      const file = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", {
        type: "image/png",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.getByText(/Unsupported file format/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
