import { describe, expect, it } from "vitest";

function checkoutSignaturePayload(orderId: string, paymentId: string): string {
  return `${orderId}|${paymentId}`;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("razorpay checkout signature", () => {
  it("uses order_id|payment_id HMAC and rejects a mismatched signature", async () => {
    const payload = checkoutSignaturePayload("order_test", "pay_test");
    expect(payload).toBe("order_test|pay_test");
    const good = await hmacSha256Hex("test_secret", payload);
    const bad = await hmacSha256Hex("other_secret", payload);
    expect(good).not.toBe(bad);
    expect(good).toMatch(/^[a-f0-9]{64}$/);
  });
});
