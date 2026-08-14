/**
 * Overlay session interaction states (Practice Coach).
 * Visual/status mapping for capture → transcript → guidance pipeline.
 */

export type OverlaySessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "speech_detected"
  | "transcribing"
  | "question_detected"
  | "generating_guidance"
  | "guidance_ready"
  | "follow_up_detected"
  | "paused"
  | "reconnecting"
  | "rate_limited"
  | "insufficient_credits"
  | "permission_denied"
  | "audio_unavailable"
  | "backend_unavailable"
  | "ai_provider_unavailable"
  | "session_ending"
  | "session_saved";

const TRANSITIONS: Record<OverlaySessionState, readonly OverlaySessionState[]> = {
  idle: ["connecting", "permission_denied"],
    connecting: ["listening", "generating_guidance", "permission_denied", "audio_unavailable", "backend_unavailable", "idle"],
  listening: [
    "speech_detected",
    "question_detected",
    "generating_guidance",
    "paused",
    "reconnecting",
    "permission_denied",
    "audio_unavailable",
    "backend_unavailable",
    "ai_provider_unavailable",
    "rate_limited",
    "insufficient_credits",
    "session_ending",
  ],
  speech_detected: ["transcribing", "listening", "paused", "session_ending"],
  transcribing: [
    "listening",
    "question_detected",
    "paused",
    "reconnecting",
    "session_ending",
  ],
  question_detected: [
    "generating_guidance",
    "listening",
    "insufficient_credits",
    "rate_limited",
    "paused",
    "session_ending",
  ],
  generating_guidance: [
    "guidance_ready",
    "ai_provider_unavailable",
    "backend_unavailable",
    "rate_limited",
    "insufficient_credits",
    "listening",
    "paused",
    "session_ending",
  ],
  guidance_ready: [
    "listening",
    "follow_up_detected",
    "generating_guidance",
    "paused",
    "session_ending",
  ],
  follow_up_detected: [
    "generating_guidance",
    "listening",
    "paused",
    "session_ending",
  ],
  paused: ["listening", "connecting", "session_ending", "idle"],
  reconnecting: ["listening", "paused", "backend_unavailable", "session_ending"],
  rate_limited: ["listening", "paused", "session_ending"],
  insufficient_credits: ["paused", "session_ending", "idle"],
  permission_denied: ["connecting", "idle"],
  audio_unavailable: ["connecting", "idle", "session_ending"],
  backend_unavailable: ["reconnecting", "paused", "session_ending", "idle"],
  ai_provider_unavailable: ["listening", "paused", "session_ending"],
  session_ending: ["session_saved", "idle"],
  session_saved: ["idle"],
};

const FAILURE_STATES: readonly OverlaySessionState[] = [
  "rate_limited",
  "insufficient_credits",
  "permission_denied",
  "audio_unavailable",
  "backend_unavailable",
  "ai_provider_unavailable",
];

export function canTransition(
  from: OverlaySessionState,
  to: OverlaySessionState,
): boolean {
  if (from === to) return true;
  // Failures must always be visible — do not swallow API / audio errors.
  if (FAILURE_STATES.includes(to) && from !== "session_saved") return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionOverlayState(
  from: OverlaySessionState,
  to: OverlaySessionState,
): OverlaySessionState {
  if (canTransition(from, to)) return to;
  return from;
}

export function overlayStateLabel(state: OverlaySessionState): string {
  const labels: Record<OverlaySessionState, string> = {
    idle: "Ready",
    connecting: "Connecting",
    listening: "Listening",
    speech_detected: "Speech detected",
    transcribing: "Transcribing",
    question_detected: "Question detected",
    generating_guidance: "Generating guidance",
    guidance_ready: "Guidance ready",
    follow_up_detected: "Follow-up detected",
    paused: "Paused",
    reconnecting: "Reconnecting",
    rate_limited: "Rate limited",
    insufficient_credits: "Insufficient credits",
    permission_denied: "Permission denied",
    audio_unavailable: "Audio unavailable",
    backend_unavailable: "Backend unavailable",
    ai_provider_unavailable: "AI unavailable",
    session_ending: "Ending session",
    session_saved: "Session saved",
  };
  return labels[state];
}

export function overlayStateRecovery(state: OverlaySessionState): string {
  const recovery: Partial<Record<OverlaySessionState, string>> = {
    permission_denied: "Allow microphone access in system settings, then retry.",
    audio_unavailable: "Check your audio device and try again.",
    backend_unavailable: "The AI request did not go through. Check your connection, then retry.",
    ai_provider_unavailable: "This AI model is unavailable. Switch to Gemini Flash or retry.",
    rate_limited: "Wait briefly, then request guidance again.",
    insufficient_credits: "Add credits or choose a plan, then continue practice.",
    reconnecting: "Stay on this screen; capture will resume when connected.",
  };
  return recovery[state] ?? "Continue when ready, or end the session safely.";
}
