import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PublicOffersSection } from "@/components/marketing/PublicOffersSection";

const loadPublicPromoOffers = vi.fn();
const getCachedPublicPromoOffers = vi.fn();

vi.mock("@/lib/billing/publicPromos", () => ({
  loadPublicPromoOffers: (...args: unknown[]) => loadPublicPromoOffers(...args),
  getCachedPublicPromoOffers: () => getCachedPublicPromoOffers(),
  formatPublicPromoHeadline: (offer: { code: string }) => offer.code,
  formatPublicPromoExpiry: () => null,
}));

describe("PublicOffersSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedPublicPromoOffers.mockReturnValue(null);
    loadPublicPromoOffers.mockResolvedValue([]);
  });

  it("does not render a loading placeholder while promos are loading", () => {
    loadPublicPromoOffers.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <MemoryRouter>
        <PublicOffersSection />
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("public-offers-section")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Loading offers")).not.toBeInTheDocument();
  });

  it("renders nothing when promos resolve to an empty list", async () => {
    const { container } = render(
      <MemoryRouter>
        <PublicOffersSection />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadPublicPromoOffers).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders active offers when promos are available", async () => {
    getCachedPublicPromoOffers.mockReturnValue([
      {
        code: "SAVE10",
        discount_percent: 10,
        bonus_credits: 0,
        valid_until: null,
        description: null,
      },
    ]);

    render(
      <MemoryRouter>
        <PublicOffersSection />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("public-offers-section")).toBeInTheDocument();
    expect(screen.getByTestId("public-offer-SAVE10")).toBeInTheDocument();
  });
});
