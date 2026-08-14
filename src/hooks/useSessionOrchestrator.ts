// ─────────────────────────────────────────────────────────────────
// useSessionOrchestrator — Manages mock/live session lifecycle
// ─────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAuthStore } from "@/store/userStore";
import { generateHint, type GenerateHintRequest } from "@/lib/api/ai";
import { hintIdempotencyKey } from "@/lib/ai/questionDetection";
import { buildResumeContextForAI } from "@/lib/documents/interviewContext";
import { parseResumeContentString } from "@/lib/documents/resumeParse";
import { getLocalHintFallback } from "@/lib/mock/localHintFallback";
import {
  getAiUserFacingError,
  isInsufficientCreditsError,
} from "@/lib/network/aiErrorUx";
import { useDocumentStore } from "@/store/documentStore";
import { useAudioStore } from "@/store/audioStore";
import type { SessionQuestion } from "@/types/session.types";

interface CreateSessionParams {
  session_type: string;
  interview_type: string;
  target_company?: string | null;
  company?: string | null;
  role?: string | null;
  question_count?: number;
  hint_style?: string;
  model?: string;
  resume_id?: string | null;
  jd_id?: string | null;
  /** When provided (e.g. DB session from getOrCreateSession), do not replace with a random id */
  session_id?: string | null;
}

export function useSessionOrchestrator() {
  const store = useSessionStore;

  const createSession = useCallback(async (params: CreateSessionParams) => {
    const sessionId = params.session_id ?? store.getState().session_id ?? crypto.randomUUID();
    if (!params.session_id) {
      store.getState().resetSession();
    }
    store.getState().setSessionId(sessionId);
    store.getState().setMode(params.session_type === "live" ? "live" : "mock");
    store.getState().setStatus("active");
    store.getState().setConfig({
      company: params.company ?? params.target_company ?? null,
      role: params.role ?? null,
      interview_type: params.interview_type as any,
      question_count: params.question_count ?? 5,
      hint_style: (params.hint_style as any) ?? "short_hints",
      model: (params.model as any) ?? "gemini-flash",
      smart_routing: false,
      stealth_mode: false,
      resume_id: params.resume_id ?? null,
      jd_id: params.jd_id ?? null,
      instructions: "",
      enable_system_audio: true,
    });
  }, []);

  const setQuestions = useCallback((questions: SessionQuestion[] | any[]) => {
    const mapped: SessionQuestion[] = questions.map((q: any, i: number) => ({
      id: q.id ?? crypto.randomUUID(),
      session_id: store.getState().session_id ?? "",
      question_number: i + 1,
      question_text: q.question_text ?? q.question ?? q.text ?? String(q),
      question_type: q.question_type ?? q.type ?? "behavioural",
      expected_duration_seconds: q.expected_duration_seconds ?? 120,
      difficulty: q.difficulty ?? "medium",
      tags: q.tags ?? [],
      company_specific: q.company_specific ?? false,
    }));
    store.getState().setQuestions(mapped);
  }, []);

  const nextQuestion = useCallback(() => {
    store.getState().advanceQuestion();
  }, []);

  const completeSession = useCallback(async () => {
    store.getState().setStatus("completed");
  }, []);

  const requestHint = useCallback(async (questionText: string) => {
    const overlay = useOverlayStore.getState();
    const session = store.getState();
    const cfg = session.config as { instructions?: string; role?: string; company?: string } | null;
    const resumeSummary =
      typeof overlay.resume_context === "string"
        ? overlay.resume_context
        : overlay.resume_context?.summary ?? "";
    const userId = useAuthStore.getState().profile?.id ?? useAuthStore.getState().user?.id;
    const activeResume = useDocumentStore.getState().active_context.resume as
      | { content?: string | null }
      | null;
    const parsed = parseResumeContentString(activeResume?.content ?? null);
    const resumeCtx = userId
      ? await buildResumeContextForAI(userId, {
          parsedResume: parsed,
          resumeContent: activeResume?.content ?? null,
          resumeSummary,
          instructions: cfg?.instructions ?? null,
          role: cfg?.role ?? null,
          company: cfg?.company ?? null,
        })
      : resumeSummary || "None provided.";
    const transcript =
      useAudioStore.getState().transcript?.full_transcript ?? "";

    // Record the user's question in chat history so it actually shows up
    overlay.addChatMessage({
      role: "user",
      text: questionText,
      timestamp: Date.now(),
    });

    try {
      overlay.setHintState("generating");
      overlay.setChatGenerating?.(true);

      const payload: GenerateHintRequest = {
        question: questionText,
        resume_context: resumeCtx,
        transcript: transcript.length > 2500 ? transcript.slice(-2500) : transcript,
        interview_type:
          (session.config as { interview_type?: string })?.interview_type ?? "behavioural",
        model: overlay.active_model ?? "gemini-2.5-flash",
        session_id: session.session_id ?? undefined,
      };
      const data = await generateHint(payload, {
        idempotencyKey: hintIdempotencyKey(session.session_id, questionText),
      });

      const hint = typeof data?.hints === "string" ? data.hints : String(data?.hints ?? "");
      const isDegraded =
        data?.success === false ||
        data?.source === "fallback" ||
        data?.refunded === true;

      if (isDegraded) {
        overlay.setCurrentQuestion(questionText);
        overlay.setOfflineFallback(hint);
        overlay.setError(
          "AI hint service unavailable — showing offline coaching tips. Credits refunded if charged.",
        );
        overlay.addChatMessage({
          role: "assistant",
          text: `${hint}\n\n_(Offline coaching tips — AI hint service unavailable.)_`,
          timestamp: Date.now(),
        });
        return;
      }

      overlay.setCurrentQuestion(questionText);
      overlay.appendStreamChunk(hint);
      overlay.commitStreamedHint();
      overlay.setHintState("ready");
      overlay.setError(null);
      overlay.addChatMessage({
        role: "assistant",
        text: hint,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = getAiUserFacingError(err);
      console.error("[useSessionOrchestrator] requestHint failed:", err);

      const interviewType =
        (session.config as { interview_type?: string })?.interview_type ?? "behavioural";
      const fallbackHint = getLocalHintFallback(questionText, interviewType);

      overlay.setCurrentQuestion(questionText);
      overlay.setOfflineFallback(fallbackHint);
      overlay.setError(
        msg.includes("temporarily unavailable")
          ? "AI hint service unavailable — showing offline coaching tips."
          : isInsufficientCreditsError(err)
            ? msg
            : `Hint failed: ${msg}`,
      );
      overlay.addChatMessage({
        role: "assistant",
        text: `${fallbackHint}\n\n_(Offline coaching tips — AI hint service unavailable.)_`,
        timestamp: Date.now(),
      });
    } finally {
      overlay.setChatGenerating?.(false);
    }
  }, []);

  return {
    createSession,
    setQuestions,
    get currentQuestion() {
      return store.getState().current_question;
    },
    get currentQuestionIndex() {
      return store.getState().current_question_index;
    },
    get totalQuestions() {
      return store.getState().questions.length;
    },
    nextQuestion,
    completeSession,
    requestHint,
  };
}
