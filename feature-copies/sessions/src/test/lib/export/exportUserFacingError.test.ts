import { describe, expect, it } from "vitest";
import {
  createExportIdempotencyKey,
  messageForExportCode,
  messageFromExportCaught,
  messageFromExportResponse,
} from "@/lib/export/exportUserFacingError";

describe("exportUserFacingError", () => {
  it("maps RATE_LIMITED to actionable copy", () => {
    expect(messageForExportCode("RATE_LIMITED")).toMatch(/Export limit reached/i);
    expect(messageForExportCode("RATE_LIMIT_BACKEND_UNAVAILABLE")).toMatch(
      /Export limit reached/i,
    );
  });

  it("maps EXPORT_FAILED and unknown codes without leaking status text", () => {
    expect(messageForExportCode("EXPORT_FAILED")).toMatch(/couldn't prepare/i);
    expect(messageForExportCode("SOMETHING_ELSE")).toMatch(/couldn't prepare/i);
    expect(messageForExportCode(undefined)).toMatch(/couldn't prepare/i);
  });

  it("parses failed Response JSON code", async () => {
    const res = new Response(
      JSON.stringify({ code: "RATE_LIMITED", error: "Rate limit exceeded." }),
      { status: 429 },
    );
    await expect(messageFromExportResponse(res)).resolves.toMatch(/Export limit reached/i);
  });

  it("falls back for 429 without body", async () => {
    const res = new Response("not-json", { status: 429 });
    await expect(messageFromExportResponse(res)).resolves.toMatch(/Export limit reached/i);
  });

  it("keeps known fetchEdge messages; sanitizes raw errors", () => {
    expect(
      messageFromExportCaught(new Error("Private mode is enabled — cloud AI and analysis are paused.")),
    ).toMatch(/Private mode/i);
    expect(messageFromExportCaught(new Error("column sessions.foo does not exist"))).toMatch(
      /couldn't prepare/i,
    );
  });

  it("creates idempotency keys within length and charset bounds", () => {
    const key = createExportIdempotencyKey("sessions");
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key.length).toBeLessThanOrEqual(150);
    expect(key).toMatch(/^[A-Za-z0-9._:-]+$/);
  });
});
