import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

describe("liveCatalog hydrate contract", () => {
  beforeEach(async () => {
    fetchEdgeJson.mockReset();
    vi.resetModules();
    const { resetLiveCatalogForTests } = await import("@/lib/billing/liveCatalog");
    resetLiveCatalogForTests();
  });

  it("POSTs billing-catalog with an empty JSON object body (never undefined)", async () => {
    fetchEdgeJson.mockResolvedValueOnce({
      paise: {
        pro_monthly: 249_900,
        enterprise_monthly: 679_900,
        credits_50: 69_900,
        credits_150: 189_900,
        credits_500: 599_900,
      },
      payments_configured: true,
    });

    const { hydrateBillingCatalog, getCatalogPaymentsConfigured } = await import(
      "@/lib/billing/liveCatalog"
    );
    await hydrateBillingCatalog();

    expect(fetchEdgeJson).toHaveBeenCalledWith("billing-catalog", {});
    expect(getCatalogPaymentsConfigured()).toBe(true);
  });

  it("force re-fetches payments_configured", async () => {
    fetchEdgeJson
      .mockResolvedValueOnce({
        paise: { pro_monthly: 1 },
        payments_configured: true,
      })
      .mockResolvedValueOnce({
        paise: { pro_monthly: 1 },
        payments_configured: false,
      });

    const mod = await import("@/lib/billing/liveCatalog");
    await mod.hydrateBillingCatalog();
    expect(mod.getCatalogPaymentsConfigured()).toBe(true);
    await mod.hydrateBillingCatalog({ force: true });
    expect(fetchEdgeJson).toHaveBeenCalledTimes(2);
    expect(mod.getCatalogPaymentsConfigured()).toBe(false);
  });

  it("stores payments_configured false without inventing configured=true on error", async () => {
    fetchEdgeJson.mockResolvedValueOnce({
      paise: { pro_monthly: 100 },
      payments_configured: false,
    });

    const mod = await import("@/lib/billing/liveCatalog");
    await mod.hydrateBillingCatalog();
    expect(mod.getCatalogPaymentsConfigured()).toBe(false);

    mod.resetLiveCatalogForTests();
    fetchEdgeJson.mockRejectedValueOnce(new Error("network"));
    await mod.hydrateBillingCatalog();
    expect(mod.getCatalogPaymentsConfigured()).toBeNull();
  });
});

describe("billing sources have no startTime field", () => {
  it("UpgradeModal, SettingsBilling, razorpayCheckout, liveCatalog omit startTime", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const files = [
      "src/components/billing/UpgradeModal.tsx",
      "src/pages/app/settings/SettingsBilling.tsx",
      "src/lib/billing/razorpayCheckout.ts",
      "src/lib/billing/liveCatalog.ts",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src).not.toMatch(/\bstartTime\b/);
    }
    const bootstrap = fs.readFileSync(path.join(root, "src/bootstrap.tsx"), "utf8");
    expect(bootstrap).toMatch(/reading 'startTime'/);
  });
});
