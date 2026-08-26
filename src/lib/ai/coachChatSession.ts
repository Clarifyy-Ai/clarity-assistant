// src/lib/ai/coachChatSession.ts — shared Live/Mock coach chat submit helper
import { supabase } from "@/lib/supabase/client";
import { streamCoachChat } from "@/lib/ai/openaiClient";
import { createIdempotencyKey } from "@/lib/api/functions";
import {
  checkCreditsForAction,
  refreshCredits,
} from "@/lib/billing/creditsManager";
import { formatTalkingPointsAsHint } from "@/lib/ai/resumeFallback";
import { getAiUserFacingError, openUpgradeIfInsufficientCredits } from "@/lib/network/aiErrorUx";
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

/**
 * Submit a coach-chat turn (Live or Mock Overlay Chat tab).
 * Streams into overlay chat_history; charges ai_coach_message via Edge.
 */
export async function submitCoachChatMessage(
  opts: SubmitCoachChatOptions,
): Promise<void> {
  const profile = useAuthStore.getState().profile;
  if (!profile) return;

  const overlay = useOverlayStore.getState();
  overlay.addChatMessage({
    role: "user",
    text: opts.message,
    timestamp: Date.now(),
  });

  const creditCheck = checkCreditsForAction("coachMessage");
  if (!creditCheck.canProceed) {
    const tp = overlay.resume_talking_points;
    overlay.addChatMessage({
      role: "assistant",
      text: tp
        ? formatTalkingPointsAsHint(tp)
        : creditCheck.reason ?? "Out of credits",
      timestamp: Date.now(),
    });
    return;
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

  try {
    await streamCoachChat({
      message: opts.message,
      sessionId: opts.sessionId,
      conversationId: useOverlayStore.getState().coach_conversation_id,
      currentQuestion: opts.currentQuestion ?? overlay.current_question ?? "",
      recentTranscript: opts.recentTranscript ?? "",
      resumeContext: opts.resumeContext ?? "",
      jobDescription: opts.jobDescription ?? "",
      recentAnswers: opts.recentAnswers ?? [],
      coachTone,
      hintStyle,
      model: overlay.active_model,
      idempotencyKey: createIdempotencyKey("ai-coach-chat"),
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
        useOverlayStore.getState().updateChatMessage(assistantId, {
          text: chatBuffer || "No response received. Please try again.",
          pending: false,
          id: result.message_id || assistantId,
          source: result.source || undefined,
        });
        if (result.conversation_id) {
          useOverlayStore
            .getState()
            .setCoachConversationId(result.conversation_id);
        }
        const remaining = await refreshCredits();
        if (remaining !== null) {
          useSessionStore.getState().consumeCredit(creditCheck.creditsRequired);
        }
      },
      onError: (error) => {
        throw error;
      },
    });
  } catch (err) {
    openUpgradeIfInsufficientCredits(err);
    const msg =
      getAiUserFacingError(err) ||
      "Your coach is temporarily unavailable. Please retry.";
    useOverlayStore.getState().updateChatMessage(assistantId, {
      text: msg,
      pending: false,
    });
    useOverlayStore.getState().setError(msg);
  } finally {
    useOverlayStore.getState().setChatGenerating(false);
  }
}
