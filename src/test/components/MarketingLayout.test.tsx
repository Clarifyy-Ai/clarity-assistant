import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";
import { MARKETING_FOOTER_COMPANY_LINKS } from "@/lib/routes/publicMarketing";

function renderMarketingLayout() {
  return render(
    <MemoryRouter>
      <MarketingLayout>
        <div>Page body</div>
      </MarketingLayout>
    </MemoryRouter>,
  );
}

describe("MarketingLayout public shell", () => {
  it("exposes one canonical signup CTA in the footer columns", () => {
    renderMarketingLayout();
    const footer = screen.getByRole("contentinfo");
    const signupLinks = within(footer).getAllByRole("link", { name: PUBLIC_CTAS.signup });
    expect(signupLinks).toHaveLength(1);
  });

  it("exposes one Help Center link in the footer columns", () => {
    renderMarketingLayout();
    const footer = screen.getByRole("contentinfo");
    const helpLinks = within(footer).getAllByRole("link", { name: PUBLIC_CTAS.help });
    expect(helpLinks).toHaveLength(1);
  });

  it("does not repeat Help or signup labels in the footer bottom bar", () => {
    renderMarketingLayout();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).queryByRole("link", { name: PUBLIC_CTAS.helpShort })).toBeNull();
    expect(within(footer).queryByRole("link", { name: "Sign up free" })).toBeNull();
  });

  it("exposes TC-PUB-014 company footer links in columns and bottom bar", () => {
    renderMarketingLayout();
    const footer = screen.getByRole("contentinfo");
    for (const link of MARKETING_FOOTER_COMPANY_LINKS) {
      expect(within(footer).getAllByRole("link", { name: link.label }).length).toBeGreaterThan(0);
    }
    expect(within(footer).getAllByRole("link", { name: "Industries" }).length).toBeGreaterThanOrEqual(2);
    expect(within(footer).getAllByRole("link", { name: "Cookies" }).length).toBeGreaterThanOrEqual(2);
    expect(within(footer).getAllByRole("link", { name: "FAQ" }).length).toBeGreaterThanOrEqual(2);
  });
});
