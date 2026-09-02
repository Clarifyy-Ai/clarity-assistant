import { describe, expect, it } from "vitest";
import {
  compareSupportPriority,
  eventVisibleToUser,
  sortSupportQueueThreads,
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

  it("filters urgent queue to waiting_agent + urgent priority", () => {
    expect(
      threadMatchesQueue(
        { status: "pending", mode: "waiting_agent", priority: "urgent" },
        "urgent",
      ),
    ).toBe(true);
    expect(
      threadMatchesQueue(
        { status: "pending", mode: "waiting_agent", priority: "normal" },
        "urgent",
      ),
    ).toBe(false);
    expect(
      threadMatchesQueue({ status: "open", mode: "ai", priority: "urgent" }, "urgent"),
    ).toBe(false);
  });

  it("sorts queued threads by priority then last_message_at desc", () => {
    const sorted = sortSupportQueueThreads([
      {
        status: "pending",
        mode: "waiting_agent",
        priority: "normal",
        last_message_at: "2026-01-02T12:00:00Z",
      },
      {
        status: "pending",
        mode: "waiting_agent",
        priority: "urgent",
        last_message_at: "2026-01-01T12:00:00Z",
      },
      {
        status: "pending",
        mode: "waiting_agent",
        priority: "high",
        last_message_at: "2026-01-03T12:00:00Z",
      },
    ]);
    expect(sorted.map((t) => t.priority)).toEqual(["urgent", "high", "normal"]);
  });

  it("ranks priority levels for admin badges", () => {
    expect(compareSupportPriority("urgent", "high")).toBeLessThan(0);
    expect(compareSupportPriority("low", "normal")).toBeGreaterThan(0);
  });
});
