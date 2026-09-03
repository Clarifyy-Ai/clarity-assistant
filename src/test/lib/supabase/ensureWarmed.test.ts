import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  ensureSupabaseWarmed,
  resetSupabaseWarmForTests,
} from "@/lib/supabase/ensureWarmed";

describe("ensureSupabaseWarmed", () => {
  beforeEach(() => {
    resetSupabaseWarmForTests();
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent warm calls into one health ping", async () => {
    const ping = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", ping);

    const [a, b] = await Promise.all([
      ensureSupabaseWarmed(),
      ensureSupabaseWarmed(),
    ]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(String(ping.mock.calls[0]?.[0])).toMatch(/\/auth\/v1\/health$/);

    vi.unstubAllGlobals();
  });
});
