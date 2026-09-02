import { describe, expect, it } from "vitest";
import { MARKETING_FOOTER_COMPANY_LINKS } from "@/lib/routes/publicMarketing";

describe("TC-PUB-014 footer destination inventory", () => {
  it("lists every company footer link with an internal route target", () => {
    for (const link of MARKETING_FOOTER_COMPANY_LINKS) {
      expect("to" in link).toBe(true);
      if ("to" in link) {
        expect(link.to.startsWith("/")).toBe(true);
        expect(link.to).not.toBe("/help");
      }
    }
  });
});
