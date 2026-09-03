/**
 * Unified overlay session conversation timeline.
 * Merges coach chat turns with AI Help hint_history for one continuous Chat view.
 */

export type SessionConversationRole =
  | "user"
  | "assistant"
  | "question"
  | "suggestion"
  | "system";

export type SessionConversationItem = {
  id: string;
  role: SessionConversationRole;
  text: string;
  timestamp: number;
  source?: string;
  pending?: boolean;
};

export type ChatHistoryLike = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  source?: string;
  pending?: boolean;
};

export type HintHistoryLike = {
  question: string;
  hint: string;
  timestamp: number;
};

/**
 * Build a chronological timeline for the Chat panel.
 * Hint pairs expand to question + suggestion bubbles (question slightly before suggestion).
 */
export function buildSessionConversationTimeline(input: {
  chatHistory: ChatHistoryLike[];
  hintHistory: HintHistoryLike[];
  systemNotice?: string | null;
  systemNoticeAt?: number | null;
}): SessionConversationItem[] {
  const items: SessionConversationItem[] = [];

  for (const msg of input.chatHistory) {
    const text = String(msg.text ?? "").trim();
    if (!text && !msg.pending) continue;
    items.push({
      id: msg.id ?? `chat-${msg.timestamp}-${msg.role}`,
      role: msg.role,
      text: text || (msg.pending ? "…" : ""),
      timestamp: msg.timestamp,
      source: msg.source,
      pending: msg.pending,
    });
  }

  for (let i = 0; i < input.hintHistory.length; i++) {
    const entry = input.hintHistory[i];
    const q = String(entry.question ?? "").trim();
    const h = String(entry.hint ?? "").trim();
    const ts = entry.timestamp || Date.now();
    if (q) {
      items.push({
        id: `hint-q-${ts}-${i}`,
        role: "question",
        text: q,
        timestamp: ts,
      });
    }
    if (h) {
      items.push({
        id: `hint-a-${ts}-${i}`,
        role: "suggestion",
        text: h,
        timestamp: ts + 1,
      });
    }
  }

  const notice = (input.systemNotice ?? "").trim();
  if (notice) {
    items.push({
      id: `system-${input.systemNoticeAt ?? "notice"}`,
      role: "system",
      text: notice,
      timestamp: input.systemNoticeAt ?? Date.now(),
    });
  }

  return items.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });
}

export type ChatAttentionReason =
  | "listening_timeout"
  | "audio_unavailable"
  | "low_confidence"
  | "stt_reconnect_failed"
  | "manual_needed"
  | null;

export function chatAttentionBannerCopy(reason: ChatAttentionReason): string {
  switch (reason) {
    case "listening_timeout":
      return "No clear question yet — open Chat to type what you heard.";
    case "audio_unavailable":
      return "Audio unavailable — open Chat to type the question.";
    case "low_confidence":
      return "We couldn’t decide the question clearly — open Chat to edit or type it.";
    case "stt_reconnect_failed":
      return "Transcription reconnect failed — open Chat to continue by typing.";
    case "manual_needed":
      return "Couldn’t catch a clear question — open Chat to type or edit what we heard.";
    default:
      return "Open Chat to type or edit the question.";
  }
}

/** True when an interviewer-looking utterance failed the confidence threshold. */
export function isLowConfidenceInterviewerSpeech(input: {
  speaker: string | null | undefined;
  text: string | null | undefined;
  isFinal?: boolean;
  confidence?: number | null;
  hasInterviewerChannel: boolean;
  minConfidence?: number;
}): boolean {
  if (!input.hasInterviewerChannel) return false;
  if (input.isFinal === false) return false;
  if (input.speaker !== "interviewer") return false;
  const text = (input.text ?? "").trim();
  if (text.length < 8) return false;
  const confidence = input.confidence;
  const min = input.minConfidence ?? 0.45;
  return (
    typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence > 0 &&
    confidence < min
  );
}
