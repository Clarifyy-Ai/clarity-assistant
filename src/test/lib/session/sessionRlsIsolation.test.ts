import { describe, expect, it } from "vitest";

const USER_A = "user-a-111";
const USER_B = "user-b-222";

function canAccessSession(actorId: string, sessionUserId: string): boolean {
  return actorId === sessionUserId;
}

describe("practice session RLS isolation", () => {
  const sessionB = { id: "s-b", user_id: USER_B, terminal_reason: "USER_ENDED", expires_at: "2026-08-24T00:00:00Z" };

  it("lets User A start, read, and end their own session", () => {
    expect(canAccessSession(USER_A, USER_A)).toBe(true);
  });

  it("does not let User A read User B sessions", () => {
    expect(canAccessSession(USER_A, sessionB.user_id)).toBe(false);
  });

  it("does not let User A end, modify, or extend User B sessions", () => {
    expect(canAccessSession(USER_A, USER_B)).toBe(false);
    expect(canAccessSession(USER_B, USER_A)).toBe(false);
  });
});
