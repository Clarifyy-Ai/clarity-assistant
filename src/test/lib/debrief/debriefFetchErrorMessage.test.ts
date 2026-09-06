import { describe, expect, it } from "vitest";
import { debriefFetchErrorMessage } from "@/lib/debrief/debriefPageState";
import { userFacingSessionDebriefError } from "@/lib/debrief/debriefJob";

describe("debriefFetchErrorMessage", () => {
  it("maps abort errors to slow-network guidance", () => {
    expect(
      debriefFetchErrorMessage(new Error("AbortError: signal is aborted without reason")),
    ).toMatch(/slow or unstable/i);
  });

  it("maps generate debrief abort errors to retry guidance", () => {
    expect(
      userFacingSessionDebriefError(new Error("AbortError: signal is aborted without reason")),
    ).toMatch(/slow or unstable/i);
  });
});
