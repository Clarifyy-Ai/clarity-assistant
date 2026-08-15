import { describe, expect, it } from "vitest";
import {
  SUPPORT_WIDGET_SLA,
  SUPPORT_WIDGET_TITLE,
  canSubmitSupportMessage,
} from "@/lib/support/supportCopy";

describe("support copy", () => {
  it("uses Support title and IST SLA without Live/Immediate", () => {
    expect(SUPPORT_WIDGET_TITLE).toBe("Support");
    expect(SUPPORT_WIDGET_SLA).toContain("India business hours, IST");
    expect(SUPPORT_WIDGET_SLA.toLowerCase()).not.toContain("live");
    expect(SUPPORT_WIDGET_SLA.toLowerCase()).not.toContain("immediate");
  });

  it("blocks empty, oversize, and duplicate submit", () => {
    expect(canSubmitSupportMessage({ sending: false, draft: "" })).toBe(false);
    expect(canSubmitSupportMessage({ sending: false, draft: "hello" })).toBe(true);
    expect(canSubmitSupportMessage({ sending: true, draft: "hello" })).toBe(false);
    expect(canSubmitSupportMessage({ sending: false, draft: "x".repeat(4001) })).toBe(false);
  });
});
