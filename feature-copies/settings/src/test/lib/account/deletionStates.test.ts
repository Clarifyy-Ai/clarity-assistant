import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STATES,
  isOpenDeletionStatus,
  isTerminalDeletionStatus,
} from "@/lib/account/deletionStates";

describe("account deletion operation states", () => {
  it("covers the durable job CHECK constraint states", () => {
    expect([...ACCOUNT_DELETION_STATES]).toEqual([
      "requested",
      "identity_confirmed",
      "processing",
      "partially_completed",
      "retrying",
      "completed",
      "failed",
    ]);
  });

  it("treats completed and failed as terminal", () => {
    expect(isTerminalDeletionStatus("completed")).toBe(true);
    expect(isTerminalDeletionStatus("failed")).toBe(true);
    expect(isOpenDeletionStatus("processing")).toBe(true);
    expect(isOpenDeletionStatus("partially_completed")).toBe(true);
    expect(isOpenDeletionStatus("completed")).toBe(false);
  });
});
