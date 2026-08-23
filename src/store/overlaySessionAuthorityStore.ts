/**
 * Authoritative overlay product session context.
 *
 * Live Copilot and Mock Interview share OverlayWindow, but MUST NOT share
 * incompatible session state. Mode + lifecycle live here — never inferred
 * from route, visible component, audio, or TTS.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

/** Product modes that may own the floating overlay. */
export type OverlayProductMode = "live" | "mock";

/**
 * Authority lifecycle (orthogonal to sessionStore.status and pipeline states).
 * Overlay mounts only when lifecycle is `ready` or `active`.
 */
export type OverlayAuthorityLifecycle =
  | "idle"
  | "initializing"
  | "ready"
  | "active"
  | "terminal";

export interface OverlaySessionAuthorityState {
  /** Monotonic epoch — late async work must match this generation. */
  generation: number;
  mode: OverlayProductMode | null;
  sessionId: string | null;
  lifecycle: OverlayAuthorityLifecycle;
  terminalReason: string | null;
  /** Auth resolved for the current begin attempt (refresh / cold start). */
  authReady: boolean;
}

interface OverlaySessionAuthorityStore extends OverlaySessionAuthorityState {
  setAuthReady: (ready: boolean) => void;

  /**
   * Start a new product session ownership. Bumps generation and clears prior
   * ownership. Callers must reset transient stores before/with this.
   */
  begin: (args: {
    mode: OverlayProductMode;
    sessionId?: string | null;
  }) => number;

  bindSessionId: (sessionId: string, generation: number) => boolean;
  markReady: (generation: number) => boolean;
  markActive: (generation: number) => boolean;
  markTerminal: (generation: number, reason?: string) => boolean;

  /** After persist + media stop — return to idle without bumping generation. */
  clearToIdle: (generation: number) => boolean;

  /** True when session-scoped overlay mutations are allowed. */
  canAcceptSessionMutations: (expectedGeneration?: number) => boolean;

  /**
   * True when OverlayWindow may mount for the current product session.
   * Requires: auth ready + mode + session id + lifecycle ready|active.
   */
  canMountOverlay: () => boolean;

  matchesGeneration: (generation: number) => boolean;
}

const INITIAL: OverlaySessionAuthorityState = {
  generation: 0,
  mode: null,
  sessionId: null,
  lifecycle: "idle",
  terminalReason: null,
  authReady: false,
};

export const useOverlaySessionAuthorityStore = create<OverlaySessionAuthorityStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL,

    setAuthReady: (authReady) => set({ authReady }),

    begin: ({ mode, sessionId = null }) => {
      const generation = get().generation + 1;
      set({
        generation,
        mode,
        sessionId: sessionId ?? null,
        lifecycle: "initializing",
        terminalReason: null,
      });
      return generation;
    },

    bindSessionId: (sessionId, generation) => {
      const s = get();
      if (s.generation !== generation) return false;
      if (s.lifecycle === "terminal" || s.lifecycle === "idle") return false;
      set({ sessionId });
      return true;
    },

    markReady: (generation) => {
      const s = get();
      if (s.generation !== generation) return false;
      if (s.lifecycle === "terminal") return false;
      if (!s.mode || !s.sessionId) return false;
      set({ lifecycle: "ready", terminalReason: null });
      return true;
    },

    markActive: (generation) => {
      const s = get();
      if (s.generation !== generation) return false;
      if (s.lifecycle === "terminal") return false;
      if (!s.mode || !s.sessionId) return false;
      set({ lifecycle: "active", terminalReason: null });
      return true;
    },

    markTerminal: (generation, reason = "ENDED") => {
      const s = get();
      if (s.generation !== generation) return false;
      if (s.lifecycle === "idle") return false;
      set({
        lifecycle: "terminal",
        terminalReason: reason,
      });
      return true;
    },

    clearToIdle: (generation) => {
      const s = get();
      if (s.generation !== generation) return false;
      set({
        mode: null,
        sessionId: null,
        lifecycle: "idle",
        terminalReason: null,
      });
      return true;
    },

    canAcceptSessionMutations: (expectedGeneration) => {
      const s = get();
      if (expectedGeneration != null && s.generation !== expectedGeneration) {
        return false;
      }
      return (
        s.lifecycle === "initializing" ||
        s.lifecycle === "ready" ||
        s.lifecycle === "active"
      );
    },

    canMountOverlay: () => {
      const s = get();
      if (!s.authReady) return false;
      if (!s.mode || !s.sessionId) return false;
      return s.lifecycle === "ready" || s.lifecycle === "active";
    },

    matchesGeneration: (generation) => get().generation === generation,
  })),
);

/** Non-hook accessors for stores / orchestration (avoid stale closures). */
export function getOverlaySessionAuthority() {
  return useOverlaySessionAuthorityStore.getState();
}

export function canAcceptOverlaySessionMutations(
  expectedGeneration?: number,
): boolean {
  return getOverlaySessionAuthority().canAcceptSessionMutations(
    expectedGeneration,
  );
}
