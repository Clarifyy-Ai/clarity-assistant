import { describe, expect, it } from "vitest";
import {
  eventVisibleToUser,
  threadMatchesQueue,
} from "@/lib/support/adminQueue";

describe("admin live support queue", () => {
  it("maps escalated threads onto waiting_agent mode", () => {
    expect(
      threadMatchesQueue({ status: "pending", mode: "waiting_agent" }, "escalated"),
    ).toBe(true);
    expect(threadMatchesQueue({ status: "open", mode: "ai" }, "escalated")).toBe(false);
  });

  it("treats assigned as assigned_admin_id present", () => {
    expect(
      threadMatchesQueue({ status: "open", assigned_admin_id: "admin-1" }, "assigned"),
    ).toBe(true);
    expect(threadMatchesQueue({ status: "open", assigned_admin_id: null }, "assigned")).toBe(false);
  });

  it("keeps internal notes off the user-visible list", () => {
    expect(eventVisibleToUser("internal")).toBe(false);
    expect(eventVisibleToUser("user")).toBe(true);
  });
});
