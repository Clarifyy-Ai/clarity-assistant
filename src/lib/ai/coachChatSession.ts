// src/lib/ai/coachChatSession.ts — shared Live/Mock coach chat submit helper
import { supabase } from "@/lib/supabase/client";
import { streamCoachChat } from "@/lib/ai/openaiClient";
import { createIdempotencyKey } from "@/lib/api/functions";
import {
  checkCreditsForAction,
  refreshCreditsFromStore,
} from "@/lib/billing/creditPrecheck";
import { getAiUserFacingError, openUpgradeIfInsufficientCredits } from "@/lib/network/aiErrorUx";
import { ApiClientError } from "@/lib/api/apiClient";
import { generateId } from "@/lib/utils";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAuthStore } from "@/store/userStore";
import type { CoachTone, HintStyle } from "@/types/user.types";

export type SubmitCoachChatOptions = {
  message: string;
  sessionId: string;
  currentQuestion?: string;
  recentTranscript?: string;
  resumeContext?: string;
  jobDescription?: string;
  recentAnswers?: string[];
  signal?: AbortSignal;
};

/** Load persisted coach messages for an active session into overlay chat UI. */
export async function loadCoachChatHistory(sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("coach_messages")
    .select("id, role, content, created_at, conversation_id")
    .eq("session_id", sessionId)
    .eq("status", "complete")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error || !data) return;

  const overlay = useOverlayStore.getState();
  overlay.clearChatHistory();

  const convId =
    (data[0] as { conversation_id?: string } | undefined)?.conversation_id ?? null;
  if (convId) overlay.setCoachConversationId(convId);

  for (const row of data) {
    overlay.addChatMessage({
      id: row.id,
      role: row.role === "coach" ? "assistant" : "user",
      text: row.content,
      timestamp: new Date(row.created_at).getTime(),
    });
  }
}

const pendingChatIdempotency = new Map<string, string>();

function chatTurnKey(sessionId: string, message: string): string {
  return `${sessionId}:${message.trim()}`;
}

/**
 * Submit a coach-chat turn (Live or Mock Overlay Chat tab).
 * Streams into overlay chat_history; charges ai_coach_message via Edge.
 */
export async function submitCoachChatMessage(
  opts: SubmitCoachChatOptions,
): Promise<boolean> {
  const profile = useAuthStore.getState().profile;
  if (!profile) return false;

  const overlay = useOverlayStore.getState();
  const userMsgId = generateId();
  overlay.addChatMessage({
    id: userMsgId,
    role: "user",
    text: opts.message,
    timestamp: Date.now(),
  });

  const creditCheck = checkCreditsForAction("coachMessage");
  if (!creditCheck.canProceed) {
    overlay.addChatMessage({
      role: "assistant",
      text: creditCheck.reason ?? "Insufficient credits for coach chat. Add credits or upgrade your plan to continue.",
      timestamp: Date.now(),
      error: true,
    });
    return false;
  }

  const assistantId = generateId();
  overlay.setChatGenerating(true);
  overlay.addChatMessage({
    id: assistantId,
    role: "assistant",
    text: "",
    timestamp: Date.now(),
    pending: true,
  });

  let chatBuffer = "";
  const coachTone = ((profile as { coach_tone?: CoachTone }).coach_tone ??
    "encouraging") as CoachTone;
  const hintStyle = (overlay.hint_style ??
    (profile as { hint_style?: HintStyle }).hint_style ??
    "short_hints") as HintStyle;

  const turnKey = chatTurnKey(opts.sessionId, opts.message);
  const idempotencyKey =
    pendingChatIdempotency.get(turnKey) ?? createIdempotencyKey("ai-coach-chat");
  pendingChatIdempotency.set(turnKey, idempotencyKey);

  try {
    await streamCoachChat({
      message: opts.message,
      sessionId: opts.sessionId,
      conversationId: useOverlayStore.getState().coach_conversation_id,
      previousTurns: useOverlayStore
        .getState()
        .chat_history.filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text })),
      currentQuestion: opts.currentQuestion ?? overlay.current_question ?? "",
      recentTranscript: opts.recentTranscript ?? "",
      resumeContext: opts.resumeContext ?? "",
      jobDescription: opts.jobDescription ?? "",
      recentAnswers: opts.recentAnswers ?? [],
      coachTone,
      hintStyle,
      model: overlay.active_model,
      // Keep in sync with Edge geminiChat timeoutMs 45_000 × maxAttempts 2.
      timeoutMs: 90_000,
      idempotencyKey,
      signal: opts.signal,
      onMeta: (meta) => {
        if (meta.conversation_id) {
          useOverlayStore.getState().setCoachConversationId(meta.conversation_id);
        }
      },
      onChunk: (chunk) => {
        chatBuffer += chunk;
        useOverlayStore.getState().updateChatMessage(assistantId, {
          text: chatBuffer,
          pending: true,
        });
      },
      onDone: async (result) => {
        chatBuffer = result.fullText || chatBuffer;
        const source = result.source || undefined;
        // Never present offline STAR scaffolds as successful coach answers.
        if (source === "python" || source === "deterministic" || source === "fallback") {
          useOverlayStore.getState().updateChatMessage(assistantId, {
            text:
              "Coach AI is temporarily unavailable. Try again in a moment.",
            pending: false,
            id: result.message_id || assistantId,
            source,
          });
          return;
        }
        useOverlayStore.getState().updateChatMessage(assistantId, {
          text: chatBuffer || "No response received. Please try again.",
          pending: false,
          id: result.message_id || assistantId,
          source,
        });
        if (result.conversation_id) {
          useOverlayStore
            .getState()
            .setCoachConversationId(result.conversation_id);
        }
        await refreshCreditsFromStore();
        const remaining = useAuthStore.getState().profile?.credits ?? null;
        if (remaining !== null) {
          useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
        }
      },
      onError: (error) => {
        throw error;
      },
    });
    pendingChatIdempotency.delete(turnKey);
    return true;
  } catch (err) {
    // Drop idempotency key on terminal failure so a retry can re-reserve after Edge refund.
    pendingChatIdempotency.delete(turnKey);
    openUpgradeIfInsufficientCredits(err);
    const timedOut =
      err instanceof ApiClientError &&
      (err.code === "REQUEST_ABORTED" ||
        err.status === 408 ||
        /timed? ?out|CP-10245/i.test(err.message));
    const msg = timedOut
      ? "Coach reply timed out (CP-10245). Your message was not accepted — retry the same turn."
      : getAiUserFacingError(err) ||
        "Coach AI is temporarily unavailable. Try again in a moment.";
    // Keep the submitted question visible and turn the pending row into an
    // actionable response. A global overlay error banner obscures chat content
    // in compact/mic-only layouts.
    useOverlayStore.getState().updateChatMessage(assistantId, {
      text: msg,
      pending: false,
      error: true,
    });
    return false;
  } finally {
    useOverlayStore.getState().setChatGenerating(false);
  }
}
