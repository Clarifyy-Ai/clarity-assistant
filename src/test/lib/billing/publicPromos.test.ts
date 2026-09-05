import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterPublicPromoOffers,
  formatPublicPromoExpiry,
  formatPublicPromoHeadline,
  resetPublicPromosForTests,
  type PublicPromoRow,
} from "@/lib/billing/publicPromos";

const fetchEdgeJson = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

function row(partial: Partial<PublicPromoRow> & Pick<PublicPromoRow, "code">): PublicPromoRow {
  return {
    discount_percent: 10,
    bonus_credits: 0,
    valid_from: "2020-01-01T00:00:00.000Z",
    valid_until: null,
    description: null,
    is_active: true,
    max_redemptions: null,
    redemption_count: 0,
    ...partial,
  };
}

describe("filterPublicPromoOffers", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it("returns active, in-window promos with normalized codes", () => {
    const offers = filterPublicPromoOffers(
      [
        row({ code: "diwali", discount_percent: 12 }),
        row({ code: "off", is_active: false }),
        row({ code: "exp", valid_until: "2026-01-01T00:00:00.000Z" }),
        row({ code: "future", valid_from: "2027-01-01T00:00:00.000Z" }),
        row({ code: "sold", max_redemptions: 1, redemption_count: 1 }),
      ],
      now,
    );

    expect(offers).toEqual([
      {
        code: "DIWALI",
        discount_percent: 12,
        bonus_credits: 0,
        valid_until: null,
        description: null,
      },
    ]);
  });

  it("formats headline and expiry copy", () => {
    expect(
      formatPublicPromoHeadline({
        code: "GSHSJSJ",
        discount_percent: 10,
        bonus_credits: 100,
        valid_until: null,
        description: null,
      }),
    ).toBe("10% off · +100 bonus credits");

    expect(formatPublicPromoExpiry("2026-08-27T00:00:00.000Z")).toMatch(/2026/);
    expect(formatPublicPromoExpiry(null)).toBeNull();
  });
});

describe("loadPublicPromoOffers", () => {
  beforeEach(() => {
    fetchEdgeJson.mockReset();
    rpc.mockReset();
    resetPublicPromosForTests();
  });

  it("prefers Supabase RPC over Edge for anonymous marketing pages", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          code: "DIWALI",
          discount_percent: 12,
          bonus_credits: 0,
          valid_until: null,
          description: null,
        },
      ],
      error: null,
    });

    const { loadPublicPromoOffers } = await import("@/lib/billing/publicPromos");
    const offers = await loadPublicPromoOffers();
    expect(rpc).toHaveBeenCalledWith("get_public_promo_offers");
    expect(fetchEdgeJson).not.toHaveBeenCalled();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.code).toBe("DIWALI");
  });

  it("falls back to list-public-promos edge when RPC is unavailable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "missing function" } });
    fetchEdgeJson.mockResolvedValueOnce({
      offers: [
        {
          code: "GSHSJSJ",
          discount_percent: 10,
          bonus_credits: 0,
          valid_until: null,
          description: null,
        },
      ],
    });

    const { loadPublicPromoOffers } = await import("@/lib/billing/publicPromos");
    const offers = await loadPublicPromoOffers();
    expect(fetchEdgeJson).toHaveBeenCalledWith("list-public-promos", {});
    expect(offers[0]?.code).toBe("GSHSJSJ");
  });

  it("returns empty list when RPC and edge both fail", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "missing function" } });
    fetchEdgeJson.mockRejectedValueOnce(new Error("network"));
    const { loadPublicPromoOffers } = await import("@/lib/billing/publicPromos");
    const offers = await loadPublicPromoOffers();
    expect(offers).toEqual([]);
  });
});
