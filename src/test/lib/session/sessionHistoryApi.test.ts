import { describe, expect, it } from "vitest";
import {
  SessionHistoryApiError,
  sessionHistoryErrorMessage,
} from "@/lib/session/sessionHistoryApi";

describe("sessionHistoryErrorMessage", () => {
  it("maps AbortError RPC failures to slow-network copy", () => {
    expect(
      sessionHistoryErrorMessage(
        new Error("AbortError: signal is aborted without reason"),
      ),
    ).toMatch(/slow or unstable/i);
  });

  it("maps SessionHistoryApiError without leaking RPC codes", () => {
    const err = new SessionHistoryApiError(
      "RPC_ERROR",
      sessionHistoryErrorMessage(new Error("AbortError: signal is aborted without reason")),
    );
    expect(err.message).not.toMatch(/AbortError/i);
    expect(err.message).toMatch(/Retry/i);
  });

  it("maps timeout errors to retry guidance", () => {
    expect(sessionHistoryErrorMessage(new Error("Session history load timed out after 45s"))).toMatch(
      /slow or unstable/i,
    );
  });
});
