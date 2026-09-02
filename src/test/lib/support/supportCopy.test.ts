import { describe, expect, it } from "vitest";
import {
  SUPPORT_CHIPS,
  SUPPORT_WIDGET_GREETING,
  SUPPORT_WIDGET_SLA,
  SUPPORT_WIDGET_TITLE,
  canSubmitSupportMessage,
  validateSupportAttachment,
} from "@/lib/support/supportCopy";

describe("support copy", () => {
  it("uses Career Pilot Support title and IST SLA without promising immediate live agents", () => {
    expect(SUPPORT_WIDGET_TITLE).toBe("Career Pilot Support");
    expect(SUPPORT_WIDGET_GREETING).toMatch(/how can we help/i);
    expect(SUPPORT_WIDGET_SLA).toContain("India business hours, IST");
    expect(SUPPORT_WIDGET_SLA.toLowerCase()).not.toContain("live");
    expect(SUPPORT_WIDGET_SLA.toLowerCase()).not.toContain("immediate");
  });

  it("exposes category chips including Talk to Support", () => {
    const labels = SUPPORT_CHIPS.map((c) => c.label);
    expect(labels).toContain("Interview Help");
    expect(labels).toContain("Talk to Support");
    expect(SUPPORT_CHIPS.find((c) => c.id === "escalate")?.escalate).toBe(true);
  });

  it("blocks empty, oversize, and duplicate submit", () => {
    expect(canSubmitSupportMessage({ sending: false, draft: "" })).toBe(false);
    expect(canSubmitSupportMessage({ sending: false, draft: "hello" })).toBe(true);
    expect(canSubmitSupportMessage({ sending: true, draft: "hello" })).toBe(false);
    expect(canSubmitSupportMessage({ sending: false, draft: "x".repeat(4001) })).toBe(false);
  });

  it("rejects oversized or unsupported attachments client-side", () => {
    const pdf = new File([new Uint8Array(12)], "note.pdf", { type: "application/pdf" });
    expect(validateSupportAttachment(pdf)).toBeNull();
    const exe = new File([new Uint8Array(12)], "x.exe", { type: "application/x-msdownload" });
    expect(validateSupportAttachment(exe)).toMatch(/png|pdf/i);
    const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    expect(validateSupportAttachment(huge)).toMatch(/5 MB/i);
  });

  it("keeps guest polling below the 8 req/min rate limit", async () => {
    const { SUPPORT_GUEST_POLL_MS } = await import("@/lib/support/supportCopy");
    expect(SUPPORT_GUEST_POLL_MS).toBeGreaterThanOrEqual(8_000);
  });
});
