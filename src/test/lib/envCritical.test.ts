import { describe, expect, it } from "vitest";
import { resolveCriticalSupabaseEnv } from "@/lib/envCritical";

const fallbackUrl = "https://example.supabase.co";
const fallbackKey = "anon-fallback";

describe("critical vs optional env", () => {
  it("fails closed on empty URL when failClosed", () => {
    expect(() =>
      resolveCriticalSupabaseEnv({
        url: "",
        anonKey: "pk_test",
        publishableKey: "pk_test",
        failClosed: true,
        fallbackUrl,
        fallbackKey,
      }),
    ).toThrow(/Missing required environment variable: VITE_SUPABASE_URL/);
  });

  it("fails closed on placeholder URL without leaking secrets", () => {
    try {
      resolveCriticalSupabaseEnv({
        url: "https://placeholder.example.com",
        anonKey: "secret-value-must-not-appear",
        publishableKey: undefined,
        failClosed: true,
        fallbackUrl,
        fallbackKey,
      });
      throw new Error("expected throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("VITE_SUPABASE_URL");
      expect(message).not.toContain("secret-value-must-not-appear");
    }
  });

  it("uses fallbacks locally so missing Razorpay does not block boot", () => {
    const resolved = resolveCriticalSupabaseEnv({
      url: "",
      anonKey: "",
      publishableKey: "",
      failClosed: false,
      fallbackUrl,
      fallbackKey,
    });
    expect(resolved.url).toBe(fallbackUrl);
    expect(resolved.anonKey).toBe(fallbackKey);
  });
});
