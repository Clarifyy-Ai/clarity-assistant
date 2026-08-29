import { describe, expect, it } from "vitest";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";

describe("resolveCreditBalance", () => {
  it("is unknown before the profile loads even if the store is the initial 0", () => {
    expect(
      resolveCreditBalance({
        isProfileLoaded: false,
        profileCredits: null,
        storeCredits: 0,
      }),
    ).toEqual({ balance: 0, known: false });
  });

  it("prefers a positive profile balance over the pre-fetch store 0", () => {
    expect(
      resolveCreditBalance({
        isProfileLoaded: true,
        profileCredits: 50,
        storeCredits: 0,
      }),
    ).toEqual({ balance: 50, known: true });
  });

  it("uses the store after a real deduction (store and profile disagree, store not 0)", () => {
    expect(
      resolveCreditBalance({
        isProfileLoaded: true,
        profileCredits: 50,
        storeCredits: 44,
      }),
    ).toEqual({ balance: 44, known: true });
  });

  it("treats a loaded zero balance as known empty", () => {
    expect(
      resolveCreditBalance({
        isProfileLoaded: true,
        profileCredits: 0,
        storeCredits: 0,
      }),
    ).toEqual({ balance: 0, known: true });
  });

  it("falls back to profile.credits when store credits are unset", () => {
    expect(
      resolveCreditBalance({
        isProfileLoaded: true,
        profileCredits: 33,
        storeCredits: null,
      }),
    ).toEqual({ balance: 33, known: true });
  });
});
