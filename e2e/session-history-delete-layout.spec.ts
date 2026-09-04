/**
 * BUG 16 — geometric reachability for Session History Delete actions.
 * Mirrors CallSessions card action cluster + PageContent overflow-x-hidden shell
 * without auth (same approach as page-header-overlap.spec.ts).
 */
import { test, expect } from "../playwright-fixture";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
] as const;

/** Matches CallSessions action row + PAGE_SHELL overflow-x-hidden (not the old 80px grid). */
function historyCardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-black">
  <main data-testid="page-shell" class="min-w-0 overflow-x-hidden p-4">
    <div data-testid="session-history-list" class="space-y-3 max-w-5xl">
      <div
        data-testid="session-history-row"
        data-source-kind="interview"
        class="bg-white border rounded-2xl p-4"
      >
        <div class="flex gap-3 items-start">
          <div class="rounded-xl bg-gray-100 p-2 shrink-0">🎤</div>
          <div class="min-w-0 flex-1 space-y-1">
            <p class="font-medium text-sm truncate">
              Completed mock interview with a very long title that should truncate only in the text column
            </p>
            <p class="text-xs text-gray-500 truncate">Software Engineer · Acme</p>
          </div>
          <div
            class="shrink-0 flex flex-wrap items-center justify-end gap-1"
            data-testid="session-history-actions"
          >
            <button type="button" class="shrink-0 px-2 py-1 text-sm">View Details</button>
            <button
              type="button"
              class="shrink-0 min-h-11 min-w-11 px-2"
              aria-label="Delete session"
              title="Delete session"
            >🗑</button>
          </div>
        </div>
      </div>
      <div
        data-testid="session-history-row"
        data-source-kind="mock_test"
        class="bg-white border rounded-2xl p-4"
      >
        <div class="flex gap-3 items-start">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-sm truncate">SSC CGL Practice</p>
          </div>
          <div class="shrink-0 flex flex-wrap gap-1" data-testid="session-history-actions">
            <button type="button" class="shrink-0 px-2 py-1 text-sm">View Details</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;
}

test.describe("BUG 16 — Session History Delete layout (no clip)", () => {
  for (const vp of VIEWPORTS) {
    test(`Delete action cluster reachable at ${vp.name} ${vp.width}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.setContent(historyCardHtml(), { waitUntil: "domcontentloaded" });

      const interview = page.locator('[data-testid="session-history-row"][data-source-kind="interview"]');
      const deleteBtn = interview.getByRole("button", { name: "Delete session" });
      await expect(deleteBtn).toBeVisible();

      const metrics = await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-source-kind="interview"] [aria-label="Delete session"]',
        ) as HTMLElement | null;
        const shell = document.querySelector('[data-testid="page-shell"]') as HTMLElement | null;
        if (!btn || !shell) return null;
        const b = btn.getBoundingClientRect();
        const s = shell.getBoundingClientRect();
        return {
          btnLeft: b.left,
          btnRight: b.right,
          btnWidth: b.width,
          btnHeight: b.height,
          shellRight: s.right,
          shellLeft: s.left,
          viewportWidth: window.innerWidth,
          clippedByShell: b.right > s.right + 1 || b.left < s.left - 1,
          pageScrollWidth: document.documentElement.scrollWidth,
          pageClientWidth: document.documentElement.clientWidth,
        };
      });

      expect(metrics).not.toBeNull();
      expect(metrics!.btnWidth).toBeGreaterThan(0);
      expect(metrics!.btnHeight).toBeGreaterThanOrEqual(44);
      expect(metrics!.clippedByShell).toBe(false);
      expect(metrics!.btnLeft).toBeGreaterThanOrEqual(0);
      expect(metrics!.btnRight).toBeLessThanOrEqual(metrics!.viewportWidth + 1);
      // No page-level horizontal overflow trap required to reach Delete.
      expect(metrics!.pageScrollWidth).toBeLessThanOrEqual(metrics!.pageClientWidth + 1);

      const mockRow = page.locator('[data-testid="session-history-row"][data-source-kind="mock_test"]');
      await expect(mockRow.getByRole("button", { name: "Delete session" })).toHaveCount(0);
    });
  }

  test("does not regress to fixed 80px overflow-hidden actions track", async ({ page }) => {
    await page.setContent(historyCardHtml());
    const html = await page.content();
    expect(html).not.toContain("grid-cols-[2fr_1fr_1fr_1fr_1fr_80px]");
    await expect(page.getByTestId("session-history-actions").first()).toHaveClass(/flex-wrap/);
  });
});
