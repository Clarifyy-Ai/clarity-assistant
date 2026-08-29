import { test, expect, loginAsTestUser } from "../playwright-fixture";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

test.describe("Resume upload smoke [T-0895]", () => {
  test("uploads a resume file on documents page", async ({ page }) => {
    await loginAsTestUser(page);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clarity-e2e-"));
    const resumePath = path.join(tmpDir, "e2e-resume.txt");
    fs.writeFileSync(
      resumePath,
      "Jane Smith\nSoftware Engineer\n5 years experience with React and TypeScript."
    );

    await page.goto("/app/documents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('input[type="file"]').setInputFiles(resumePath);

    await expect(page.getByText("e2e-resume")).toBeVisible({
      timeout: 20_000,
    });

    fs.unlinkSync(resumePath);
    fs.rmdirSync(tmpDir);
  });
});
