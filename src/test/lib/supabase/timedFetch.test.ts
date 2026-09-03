import { describe, expect, it, vi } from "vitest";
import { createTimedFetch } from "@/lib/supabase/timedFetch";

describe("createTimedFetch", () => {
  it("aborts hung requests so auth init cannot stall for tens of seconds", async () => {
    const hung: typeof fetch = (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      });
    vi.stubGlobal("fetch", hung);

    const timed = createTimedFetch(20);
    await expect(timed("https://example.test/auth/v1/token")).rejects.toMatchObject({
      name: "AbortError",
    });

    vi.unstubAllGlobals();
  });
});
