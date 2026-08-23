/**
 * Mock interview session lifecycle — once ENDED, remains terminal.
 * No late request/timer/audio/provider update may revive the session.
 */

export type MockSessionLifecycle = "ACTIVE" | "ENDING" | "ENDED";

export type MockSessionLifecycleEvent =
  | { type: "BEGIN_END" }
  | { type: "CONFIRM_ENDED" }
  | { type: "FORCE_ENDED" };

const ALLOWED: Record<MockSessionLifecycle, ReadonlySet<MockSessionLifecycle>> = {
  ACTIVE: new Set(["ENDING", "ENDED"]),
  ENDING: new Set(["ENDED"]),
  ENDED: new Set(["ENDED"]),
};

export function canTransitionMockSessionLifecycle(
  from: MockSessionLifecycle,
  to: MockSessionLifecycle,
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export function reduceMockSessionLifecycle(
  state: MockSessionLifecycle,
  event: MockSessionLifecycleEvent,
): MockSessionLifecycle {
  switch (event.type) {
    case "BEGIN_END":
      if (state === "ENDED") return "ENDED";
      return "ENDING";
    case "CONFIRM_ENDED":
    case "FORCE_ENDED":
      return "ENDED";
    default:
      return state;
  }
}

export function isMockSessionMutable(lifecycle: MockSessionLifecycle): boolean {
  return lifecycle === "ACTIVE";
}

export function isMockSessionTerminal(lifecycle: MockSessionLifecycle): boolean {
  return lifecycle === "ENDED";
}

/**
 * Guard for async completions: only ACTIVE sessions may apply interview updates.
 * ENDING/ENDED reject stale work.
 */
export function assertMockSessionAllowsUpdate(
  lifecycle: MockSessionLifecycle,
  sessionId: string | null,
  expectedSessionId: string | null,
): boolean {
  if (!isMockSessionMutable(lifecycle)) return false;
  if (!sessionId || !expectedSessionId) return false;
  return sessionId === expectedSessionId;
}
