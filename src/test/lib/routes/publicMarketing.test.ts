import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKETING_FOOTER_BOTTOM_LINKS,
  MARKETING_FOOTER_COMPANY_LINKS,
  PUBLIC_MARKETING_COMPANY_ROUTES,
  PUBLIC_MARKETING_CORE_ROUTES,
} from "@/lib/routes/publicMarketing";

describe("public marketing route inventory", () => {
  const appSource = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

  it("registers every company marketing route in App.tsx", () => {
    for (const route of PUBLIC_MARKETING_COMPANY_ROUTES) {
      expect(appSource).toContain(`path: "${route.path}"`);
    }
  });

  it("registers core marketing routes in App.tsx", () => {
    for (const route of PUBLIC_MARKETING_CORE_ROUTES) {
      if (route.path === "/") continue;
      expect(appSource).toContain(`path: "${route.path}"`);
    }
  });

  it("keeps Help and FAQ as separate canonical surfaces", () => {
    const help = PUBLIC_MARKETING_CORE_ROUTES.find((route) => route.path === "/help");
    const faq = PUBLIC_MARKETING_COMPANY_ROUTES.find((route) => route.path === "/faq");
    expect(help?.heading).toBe("Help Center");
    expect(faq?.heading).toBe("FAQ");
    expect(help?.inventoryNote).toMatch(/not the same as \/faq/i);
    expect(faq?.inventoryNote).toMatch(/Help Center/i);
  });

  it("exposes footer company links for TC-PUB-014 inventory rows", () => {
    const labels = MARKETING_FOOTER_COMPANY_LINKS.map((link) => link.label);
    expect(labels).toEqual(
      expect.arrayContaining(["About", "Industries", "Cookies", "FAQ", "Careers", "Contact Sales"]),
    );
  });

  it("mirrors company footer links in the compact bottom bar", () => {
    const bottomLabels = MARKETING_FOOTER_BOTTOM_LINKS.map((link) => link.label);
    expect(bottomLabels).toEqual(
      expect.arrayContaining(["About", "Industries", "Cookies", "FAQ", "Careers"]),
    );
  });
});
