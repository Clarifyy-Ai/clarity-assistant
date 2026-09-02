import { afterEach, describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  classifyGovSearchFailure,
  inflightKeyFor,
  resetGovSearchLifecycleForTests,
  shareInFlightSearch,
} from "@/lib/gov-exam/searchLifecycle";

describe("classifyGovSearchFailure", () => {
  afterEach(() => {
    resetGovSearchLifecycleForTests();
  });

  it("ignores superseded requests so a newer search owns the spinner", () => {
    expect(
      classifyGovSearchFailure({
        err: new Error("boom"),
        superseded: true,
        currentAborted: false,
      }),
    ).toEqual({ action: "ignore" });
  });

  it("turns a timeout into a retryable error instead of leaving loading", () => {
    expect(
      classifyGovSearchFailure({
        err: new Error("The request timed out. Please try again."),
        superseded: false,
        currentAborted: true,
        timedOut: true,
      }),
    ).toMatchObject({
      action: "error",
      code: "SEARCH_TIMEOUT",
      retryable: true,
    });
  });

  it("clears the spinner when the current request is aborted", () => {
    expect(
      classifyGovSearchFailure({
        err: new DOMException("The operation was aborted.", "AbortError"),
        superseded: false,
        currentAborted: true,
      }),
    ).toEqual({ action: "idle" });
  });

  it("maps 401 to a recoverable auth error", () => {
    expect(
      classifyGovSearchFailure({
        err: new ApiClientError({
          message: "Sign in to continue.",
          status: 401,
          code: "AUTH_REQUIRED",
        }),
        superseded: false,
        currentAborted: false,
      }),
    ).toMatchObject({ action: "error", code: "AUTH_REQUIRED", retryable: true });
  });

  it("maps 5xx to a recoverable search failure", () => {
    expect(
      classifyGovSearchFailure({
        err: new ApiClientError({
          message: "Exam search failed. Please try again.",
          status: 500,
          code: "SEARCH_FAILED",
        }),
        superseded: false,
        currentAborted: false,
      }),
    ).toMatchObject({ action: "error", code: "SEARCH_FAILED" });
  });
});

describe("shareInFlightSearch", () => {
  afterEach(() => {
    resetGovSearchLifecycleForTests();
  });

  it("dedupes concurrent identical keys onto one request", async () => {
    let starts = 0;
    const start = () => {
      starts += 1;
      return Promise.resolve({ results: [] });
    };
    const key = inflightKeyFor("ssc", "");
    const [a, b] = await Promise.all([
      shareInFlightSearch(key, undefined, start),
      shareInFlightSearch(key, undefined, start),
    ]);
    expect(starts).toBe(1);
    expect(a.results).toEqual([]);
    expect(b.results).toEqual([]);
  });

  it("does not abort a shared request while another waiter is still listening", async () => {
    let aborted = false;
    const start = (signal: AbortSignal) =>
      new Promise<{ results: [] }>((resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
        setTimeout(() => resolve({ results: [] }), 20);
      });

    const first = new AbortController();
    const second = new AbortController();
    const key = inflightKeyFor("ssc", "ssc");
    const p1 = shareInFlightSearch(key, first.signal, start);
    const p2 = shareInFlightSearch(key, second.signal, start);
    first.abort();
    await expect(p2).resolves.toEqual({ results: [] });
    await expect(p1).resolves.toEqual({ results: [] });
    expect(aborted).toBe(false);
  });
});
