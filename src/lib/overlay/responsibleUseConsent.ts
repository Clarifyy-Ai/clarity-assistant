/**
 * Responsible-use consent for Practice Coach / desktop overlay.
 * Must be explicitly accepted before capture-backed sessions start.
 */

export const RESPONSIBLE_USE_NOTICE =
  "Use Clarify AI only where assistance, recording, transcription, and screen " +
  "capture are permitted. You are responsible for obtaining required consent and " +
  "following interview, employer, examination, and local privacy rules.";

const STORAGE_KEY = "clarify:responsible-use-ack-v1";

export function hasResponsibleUseConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptResponsibleUseConsent(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export function clearResponsibleUseConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Session may start only when both visibility + responsible-use are acknowledged. */
export function canStartCoachingSession(opts: {
  visibilityAcknowledged: boolean;
  responsibleUseAcknowledged: boolean;
  micGranted: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!opts.micGranted) {
    return { ok: false, reason: "Microphone permission is required." };
  }
  if (!opts.visibilityAcknowledged) {
    return {
      ok: false,
      reason: "Acknowledge that the assistant stays visible on screen share.",
    };
  }
  if (!opts.responsibleUseAcknowledged) {
    return {
      ok: false,
      reason: "Accept the responsible-use notice before starting.",
    };
  }
  return { ok: true };
}
