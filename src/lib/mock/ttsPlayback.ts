/**
 * TTS playback state machine — one play per playback_id unless user Replays.
 */

export type TtsPlaybackStatus =
  | "not_requested"
  | "generating"
  | "ready"
  | "playing"
  | "completed"
  | "failed"
  | "cancelled";

export type TtsPlaybackRecord = {
  playback_id: string;
  status: TtsPlaybackStatus;
  question_id: string;
  voice_id: string | null;
};

export function buildTtsPlaybackId(input: {
  sessionId: string;
  questionId: string;
  voiceId: string | null | undefined;
  textVersion: string;
}): string {
  const raw = [
    input.sessionId,
    input.questionId,
    input.voiceId ?? "default",
    input.textVersion.trim(),
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `tts_${(h >>> 0).toString(16)}`;
}

/** Auto-play only when this playback_id has never completed. */
export function shouldAutoPlayQuestionTts(
  record: TtsPlaybackRecord | null | undefined,
  playbackId: string,
): boolean {
  if (!record || record.playback_id !== playbackId) return true;
  return (
    record.status === "not_requested" ||
    record.status === "ready" ||
    record.status === "failed" ||
    record.status === "cancelled"
  );
}

export function reduceTtsPlayback(
  current: TtsPlaybackRecord | null,
  event:
    | { type: "REQUEST"; playback_id: string; question_id: string; voice_id: string | null }
    | { type: "READY" }
    | { type: "START" }
    | { type: "COMPLETE" }
    | { type: "FAIL" }
    | { type: "CANCEL" }
    | { type: "MANUAL_REPLAY" },
): TtsPlaybackRecord | null {
  if (event.type === "REQUEST") {
    return {
      playback_id: event.playback_id,
      question_id: event.question_id,
      voice_id: event.voice_id,
      status: "generating",
    };
  }
  if (!current) return null;
  switch (event.type) {
    case "READY":
      return { ...current, status: "ready" };
    case "START":
      return { ...current, status: "playing" };
    case "COMPLETE":
      return { ...current, status: "completed" };
    case "FAIL":
      return { ...current, status: "failed" };
    case "CANCEL":
      return { ...current, status: "cancelled" };
    case "MANUAL_REPLAY":
      return { ...current, status: "ready" };
    default:
      return current;
  }
}
