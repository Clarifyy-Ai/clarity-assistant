/**
 * Product-session lifecycle for Live Copilot vs Mock Interview overlay.
 * Shared presentation (OverlayWindow); separate authoritative ownership.
 */

import { useSessionStore } from "@/store/sessionStore";
import {
  getOverlaySessionAuthority,
  type OverlayProductMode,
} from "@/store/overlaySessionAuthorityStore";
import { resetTransientOverlaySessionStores } from "@/lib/session/resetOverlaySessionStores";

export type BeginOverlayProductSessionArgs = {
  mode: OverlayProductMode;
  sessionId?: string | null;
  /** When false, skip store wipe (rare restore path that already cleaned). Default true. */
  resetStores?: boolean;
};

/**
 * Claim overlay ownership for a product mode.
 * Always bumps generation so in-flight work from a prior session is ignored.
 */
export function beginOverlayProductSession(
  args: BeginOverlayProductSessionArgs,
): { generation: number; mode: OverlayProductMode } {
  const resetStores = args.resetStores !== false;
  if (resetStores) {
    resetTransientOverlaySessionStores({ hideOverlay: true, stopTts: true });
  }

  const generation = getOverlaySessionAuthority().begin({
    mode: args.mode,
    sessionId: args.sessionId ?? null,
  });

  // Authoritative mode on sessionStore — OverlayWindow / controllers read this.
  useSessionStore.getState().setMode(args.mode);
  if (args.sessionId) {
    useSessionStore.getState().setSessionId(args.sessionId);
  }
  useSessionStore.getState().setStatus("warming_up");

  return { generation, mode: args.mode };
}

export function bindOverlayProductSessionId(
  sessionId: string,
  generation: number,
): boolean {
  const ok = getOverlaySessionAuthority().bindSessionId(sessionId, generation);
  if (!ok) return false;
  useSessionStore.getState().setSessionId(sessionId);
  return true;
}

/** Context ready — overlay may mount (loading → visible shell). */
export function markOverlayProductSessionReady(generation: number): boolean {
  return getOverlaySessionAuthority().markReady(generation);
}

/** Audio / interview loop running. */
export function markOverlayProductSessionActive(generation: number): boolean {
  const ok = getOverlaySessionAuthority().markActive(generation);
  if (ok) {
    useSessionStore.getState().setStatus("active");
  }
  return ok;
}

/**
 * Freeze overlay against late transcript / hint / timer updates.
 * Call BEFORE stopping media if you still need a final store snapshot,
 * or immediately after snapshot — either way mutations stop after this.
 */
export function markOverlayProductSessionTerminal(
  generation: number,
  reason: string = "ENDED",
): boolean {
  return getOverlaySessionAuthority().markTerminal(generation, reason);
}

/**
 * After persist + media teardown: wipe transients and release ownership.
 */
export function teardownOverlayProductSession(generation: number): void {
  const auth = getOverlaySessionAuthority();
  if (!auth.matchesGeneration(generation)) return;

  resetTransientOverlaySessionStores({ hideOverlay: true, stopTts: true });
  auth.clearToIdle(generation);
}

export function syncOverlayAuthReady(ready: boolean): void {
  getOverlaySessionAuthority().setAuthReady(ready);
}

export function getActiveOverlayProductGeneration(): number {
  return getOverlaySessionAuthority().generation;
}

export function getActiveOverlayProductMode(): OverlayProductMode | null {
  return getOverlaySessionAuthority().mode;
}
