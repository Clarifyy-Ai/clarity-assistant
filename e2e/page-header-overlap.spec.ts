/**
 * TC-MOD-006 — geometric non-overlap for PageHeader layout pattern.
 * Uses the same flex/min-width/wrap rules as src/components/layout/PageHeader.tsx
 * (Tailwind CDN) so we can measure real boxes without auth.
 */
import { test, expect } from "../playwright-fixture";

const LONG_TITLE =
  "Anushka_Barai_Resume_DataAnalytics_DataEngineer (1)";
const VERY_LONG =
  "An extremely long professional resume document title containing many words and descriptors.pdf";

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "414x896", width: 414, height: 896 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

function headerHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: { screens: { sm: "640px", md: "768px", lg: "1024px" } }
    };
  </script>
</head>
<body class="bg-white text-black p-4">
  <div data-testid="page-header" class="space-y-4 mb-6 md:mb-8 max-w-full overflow-x-hidden">
    <div
      data-testid="page-header-main"
      class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4"
    >
      <div data-testid="page-header-info" class="flex items-start gap-3 flex-1 min-w-0">
        <div class="mt-1 p-2 rounded-lg shrink-0 bg-blue-100">📄</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start gap-2 min-w-0">
            <h1
              data-testid="page-header-title"
              title="${title.replace(/"/g, "&quot;")}"
              class="min-w-0 max-w-full flex-1 text-2xl sm:text-3xl md:text-4xl font-bold leading-tight break-words [overflow-wrap:anywhere] line-clamp-2"
            >${title}</h1>
          </div>
          <p class="text-sm mt-1 break-words [overflow-wrap:anywhere]">Uploaded recently.</p>
        </div>
      </div>
      <div
        data-testid="page-header-actions"
        class="flex w-full md:w-auto gap-2 shrink-0 flex-wrap justify-start md:justify-end"
      >
        <button type="button">Edit fields</button>
        <button type="button">Re-parse file</button>
        <button type="button">Download</button>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  tol = 1,
): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return !(
    aRight <= b.x + tol ||
    bRight <= a.x + tol ||
    aBottom <= b.y + tol ||
    bBottom <= a.y + tol
  );
}

test.describe("PageHeader layout non-overlap [TC-MOD-006]", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} long underscore title does not overlap actions`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.setContent(headerHtml(LONG_TITLE), { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { tailwind?: unknown }).tailwind) || document.querySelector("h1"));

      // Allow Tailwind CDN to apply utilities.
      await page.waitForTimeout(400);

      const title = page.getByTestId("page-header-title");
      const actions = page.getByTestId("page-header-actions");
      await expect(title).toBeVisible();
      await expect(actions).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit fields" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Re-parse file" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Download" })).toBeVisible();

      const titleBox = await title.boundingBox();
      const actionsBox = await actions.boundingBox();
      expect(titleBox).toBeTruthy();
      expect(actionsBox).toBeTruthy();
      if (!titleBox || !actionsBox) return;

      const sideBySide = actionsBox.x >= titleBox.x + titleBox.width - 2;
      const stacked = actionsBox.y >= titleBox.y + titleBox.height - 2;
      expect(
        sideBySide || stacked,
        `Expected side-by-side or stacked layout at ${vp.name}; title=${JSON.stringify(titleBox)} actions=${JSON.stringify(actionsBox)}`,
      ).toBeTruthy();
      expect(
        boxesOverlap(titleBox, actionsBox),
        `Title and actions overlap at ${vp.name}`,
      ).toBeFalsy();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Actions remain clickable (not covered by the title).
      await page.getByRole("button", { name: "Edit fields" }).click();
      await page.getByRole("button", { name: "Re-parse file" }).click();
      await page.getByRole("button", { name: "Download" }).click();
    });
  }

  test("very long spaced title stays non-overlapping at 1366x768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.setContent(headerHtml(VERY_LONG), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const titleBox = await page.getByTestId("page-header-title").boundingBox();
    const actionsBox = await page.getByTestId("page-header-actions").boundingBox();
    expect(titleBox && actionsBox).toBeTruthy();
    if (!titleBox || !actionsBox) return;
    expect(boxesOverlap(titleBox, actionsBox)).toBeFalsy();
    await expect(page.getByRole("button", { name: "Download" })).toBeEnabled();
  });
});
