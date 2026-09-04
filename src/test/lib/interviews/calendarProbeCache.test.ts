import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CALENDAR_PROBE_TIMEOUT_MS,
  CALENDAR_VERIFICATION_PENDING_MSG,
  clearSyncProbeCache,
  isCalendarOauthNotPublicError,
  isCalendarUnavailableError,
  isStaleProbeInflight,
  parseCalendarProbePayload,
  probeSyncAvailabilityCached,
  raceWithTimeout,
  shouldCacheProbeFailure,
} from "@/lib/interviews/calendarProbe";

describe("calendar probe cache", () => {
  afterEach(() => {
    clearSyncProbeCache();
    vi.useRealTimers();
  });

  it("does not cache unauthenticated probe failures", () => {
    expect(shouldCacheProbeFailure({ name: "Error", message: "x", status: 401 })).toBe(false);
    expect(shouldCacheProbeFailure({ name: "Error", message: "x", status: 403 })).toBe(false);
  });

  it("caches definitive NOT_CONFIGURED responses", () => {
    expect(
      shouldCacheProbeFailure({ name: "Error", message: "nope", status: 501, code: "NOT_CONFIGURED" }),
    ).toBe(true);
  });

  it("returns inconclusive without a user and does not call fetch", async () => {
    const fetchProbe = vi.fn();
    const result = await probeSyncAvailabilityCached(false, fetchProbe);
    expect(fetchProbe).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.inconclusive).toBe(true);
    expect(result.connectAllowed).toBe(false);
  });

  it("times out hung probes instead of leaving Checking stuck", async () => {
    vi.useFakeTimers();
    const pending = probeSyncAvailabilityCached(true, () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(CALENDAR_PROBE_TIMEOUT_MS + 25);
    const result = await pending;
    expect(result.available).toBe(false);
    expect(result.unavailable).toBe(false);
    expect(result.inconclusive).toBeUndefined();
  });

  it("raceWithTimeout rejects hung work", async () => {
    vi.useFakeTimers();
    const pending = raceWithTimeout(new Promise(() => {}), 40);
    const assertion = expect(pending).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(40);
    await assertion;
  });

  it("treats inflight older than the probe timeout as stale", () => {
    expect(isStaleProbeInflight(0, CALENDAR_PROBE_TIMEOUT_MS)).toBe(true);
    expect(isStaleProbeInflight(1_000, 1_000)).toBe(false);
  });

  it("parses probe connectAllowed / verification_pending for general users", () => {
    expect(
      parseCalendarProbePayload({
        available: true,
        configured: true,
        publicOauth: false,
        connectAllowed: false,
        reason: "verification_pending",
      }),
    ).toEqual({
      available: true,
      configured: true,
      publicOauth: false,
      connectAllowed: false,
      reason: "verification_pending",
    });
    expect(CALENDAR_VERIFICATION_PENDING_MSG).toMatch(/verification pending/i);
  });

  it("parses allowlisted / public probe as connectAllowed", () => {
    expect(
      parseCalendarProbePayload({
        data: {
          available: true,
          configured: true,
          publicOauth: false,
          connectAllowed: true,
          reason: "ok",
        },
      }),
    ).toMatchObject({ connectAllowed: true, reason: "ok" });
    expect(
      parseCalendarProbePayload({
        available: true,
        configured: true,
        publicOauth: true,
        connectAllowed: true,
        reason: "ok",
      }),
    ).toMatchObject({ publicOauth: true, connectAllowed: true });
  });

  it("fails closed when connectAllowed is omitted from probe", () => {
    expect(
      parseCalendarProbePayload({ available: true, configured: true }),
    ).toMatchObject({ connectAllowed: false, reason: "verification_pending" });
  });

  it("detects OAUTH_NOT_PUBLIC from oauth_start", () => {
    expect(
      isCalendarOauthNotPublicError({
        name: "Error",
        message: "gated",
        code: "OAUTH_NOT_PUBLIC",
        status: 403,
      }),
    ).toBe(true);
  });

  it("does not treat OAUTH_NOT_PUBLIC message as NOT_CONFIGURED", () => {
    expect(
      isCalendarUnavailableError({
        name: "Error",
        message: CALENDAR_VERIFICATION_PENDING_MSG,
        code: "OAUTH_NOT_PUBLIC",
        status: 403,
      }),
    ).toBe(false);
  });

  it("caches connectAllowed from a successful probe", async () => {
    const result = await probeSyncAvailabilityCached(true, async () => ({
      available: true,
      configured: true,
      publicOauth: false,
      connectAllowed: false,
      reason: "verification_pending",
    }));
    expect(result).toMatchObject({
      available: true,
      connectAllowed: false,
      reason: "verification_pending",
    });
  });
});
