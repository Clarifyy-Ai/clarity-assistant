/**
 * Overlay session interaction states (Practice Coach + Mock Interview).
 * Visual/status mapping for capture → transcript → guidance pipeline.
 *
 * Live and Mock share common states but have mode-specific transitions.
 * Do not force both products through the exact same FSM path.
 */

import type { OverlayProductMode } from "@/store/overlaySessionAuthorityStore";

export type OverlaySessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "speech_detected"
  | "transcribing"
  | "tab_audio_detected"
  | "question_detected"
  | "question_generated"
  | "question_spoken"
  | "candidate_answering"
  | "answer_finalizing"
  | "next_question_pending"
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

const COMMON_FROM_LISTENING: readonly OverlaySessionState[] = [
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
];

const BASE_TRANSITIONS: Record<OverlaySessionState, readonly OverlaySessionState[]> = {
  idle: ["connecting", "question_generated", "permission_denied"],
  connecting: [
    "listening",
    "generating_guidance",
    "permission_denied",
    "audio_unavailable",
    "backend_unavailable",
    "idle",
  ],
  listening: [...COMMON_FROM_LISTENING, "tab_audio_detected", "candidate_answering"],
  speech_detected: [
    "transcribing",
    "listening",
    "candidate_answering",
    "paused",
    "session_ending",
  ],
  transcribing: [
    "listening",
    "question_detected",
    "candidate_answering",
    "paused",
    "reconnecting",
    "session_ending",
  ],
  tab_audio_detected: [
    "transcribing",
    "question_detected",
    "listening",
    "paused",
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
  question_generated: [
    "question_spoken",
    "generating_guidance",
    "listening",
    "paused",
    "session_ending",
  ],
  question_spoken: [
    "candidate_answering",
    "listening",
    "generating_guidance",
    "paused",
    "session_ending",
  ],
  candidate_answering: [
    "answer_finalizing",
    "speech_detected",
    "transcribing",
    "listening",
    "generating_guidance",
    "paused",
    "session_ending",
  ],
  answer_finalizing: [
    "next_question_pending",
    "guidance_ready",
    "listening",
    "paused",
    "session_ending",
  ],
  next_question_pending: [
    "question_generated",
    "connecting",
    "listening",
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
    "candidate_answering",
    "paused",
    "session_ending",
  ],
  guidance_ready: [
    "listening",
    "follow_up_detected",
    "generating_guidance",
    "candidate_answering",
    "next_question_pending",
    "paused",
    "session_ending",
  ],
  follow_up_detected: [
    "generating_guidance",
    "listening",
    "paused",
    "session_ending",
  ],
  paused: ["listening", "connecting", "question_generated", "session_ending", "idle"],
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

/** Live-only states that Mock should not enter via normal transitions. */
const LIVE_ONLY: ReadonlySet<OverlaySessionState> = new Set([
  "tab_audio_detected",
  "question_detected",
  "follow_up_detected",
]);

/** Mock-only states that Live should not enter via normal transitions. */
const MOCK_ONLY: ReadonlySet<OverlaySessionState> = new Set([
  "question_generated",
  "question_spoken",
  "candidate_answering",
  "answer_finalizing",
  "next_question_pending",
]);

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
  mode?: OverlayProductMode | null,
): boolean {
  if (from === to) return true;
  // Failures must always be visible — do not swallow API / audio errors.
  if (FAILURE_STATES.includes(to) && from !== "session_saved") return true;
  // Terminal path always allowed.
  if (to === "session_ending" || to === "session_saved") return true;

  if (mode === "live" && MOCK_ONLY.has(to)) return false;
  if (mode === "mock" && LIVE_ONLY.has(to)) return false;

  return BASE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionOverlayState(
  from: OverlaySessionState,
  to: OverlaySessionState,
  mode?: OverlayProductMode | null,
): OverlaySessionState {
  if (canTransition(from, to, mode)) return to;
  return from;
}

export function overlayStateLabel(state: OverlaySessionState): string {
  const labels: Record<OverlaySessionState, string> = {
    idle: "Ready",
    connecting: "Connecting",
    listening: "Listening",
    speech_detected: "Speech detected",
    transcribing: "Transcribing",
    tab_audio_detected: "Tab audio detected",
    question_detected: "Question detected",
    question_generated: "Question ready",
    question_spoken: "Question spoken",
    candidate_answering: "Your turn",
    answer_finalizing: "Finalizing answer",
    next_question_pending: "Next question",
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
    backend_unavailable:
      "The AI request did not go through. Check your connection, then retry — your session stays open.",
    ai_provider_unavailable:
      "AI is temporarily unavailable. Retry guidance without ending the session, or switch model.",
    rate_limited: "Wait briefly, then request guidance again.",
    insufficient_credits: "Add credits or choose a plan, then continue practice.",
    reconnecting: "Stay on this screen; capture will resume when connected.",
    question_generated: "Listen to the question, then answer when ready.",
    question_spoken: "Answer out loud or request a hint when ready.",
    candidate_answering: "Keep speaking — silence advances when you finish.",
    next_question_pending: "Preparing the next interview question.",
    tab_audio_detected: "Hearing the interviewer — wait for the full question.",
  };
  return recovery[state] ?? "Continue when ready, or end the session safely.";
}

/** Map a user-facing error string to the overlay pipeline state (not always "AI unavailable"). */
export function pipelineStateFromErrorMessage(
  message: string | null | undefined,
): OverlaySessionState {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("credit")) return "insufficient_credits";
  if (msg.includes("rate") || msg.includes("429")) return "rate_limited";
  if (
    msg.includes("permission") ||
    msg.includes("microphone") ||
    /\bmic\b/.test(msg)
  ) {
    return "permission_denied";
  }
  if (
    msg.includes("transcript") ||
    msg.includes("deepgram") ||
    msg.includes("speech-to-text") ||
    msg.includes("stt") ||
    msg.includes("tab audio") ||
    msg.includes("system audio")
  ) {
    return "audio_unavailable";
  }
  if (
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("couldn't reach") ||
    msg.includes("could not reach") ||
    msg.includes("connection") ||
    msg.includes("cors") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("503") ||
    msg.includes("502")
  ) {
    return "backend_unavailable";
  }
  if (
    msg.includes("practice session has expired") ||
    (msg.includes("session expired") && !msg.includes("sign in"))
  ) {
    return "session_ending";
  }
  return "ai_provider_unavailable";
}
