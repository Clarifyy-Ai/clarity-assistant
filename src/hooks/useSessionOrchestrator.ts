// ─────────────────────────────────────────────────────────────────
// useSessionOrchestrator — Manages mock/live session lifecycle
// ─────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { supabase } from "@/integrations/supabase/client";
import type { SessionQuestion } from "@/types/session.types";

interface CreateSessionParams {
  session_type: string;
  interview_type: string;
  target_company?: string | null;
  question_count?: number;
  hint_style?: string;
  model?: string;
  resume_id?: string | null;
  jd_id?: string | null;
}

export function useSessionOrchestrator() {
  const store = useSessionStore;

  const createSession = useCallback(async (params: CreateSessionParams) => {
    const sessionId = crypto.randomUUID();
    store.getState().resetSession();
    store.getState().setSessionId(sessionId);
    store.getState().setMode(params.session_type === "live" ? "live" : "mock");
    store.getState().setStatus("active");
    store.getState().setConfig({
      company: params.target_company ?? null,
      role: null,
      interview_type: params.interview_type as any,
      question_count: params.question_count ?? 5,
      hint_style: (params.hint_style as any) ?? "concise",
      model: (params.model as any) ?? "gemini-2.0-flash",
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
    const resumeCtx = overlay.resume_context ?? "";

    try {
      overlay.setHintState("generating");

      const { data, error } = await supabase.functions.invoke("generate-hint", {
        body: {
          question: questionText,
          resume_context: resumeCtx,
          interview_type: (session.config as any)?.interview_type ?? "behavioural",
          model: overlay.active_model ?? "gemini-2.0-flash",
        },
      });

      if (error) {
        console.error("[useSessionOrchestrator] generate-hint error:", error);
        overlay.setHintState("error");
        overlay.setError("Failed to generate hint");
        return;
      }

      const hint = data?.hint ?? data?.answer ?? data?.text ?? "";
      // Add to hint history and set as current hint
      overlay.setCurrentQuestion(questionText);
      overlay.appendStreamChunk(hint);
      overlay.commitStreamedHint();
      overlay.setHintState("ready");
    } catch (err) {
      console.error("[useSessionOrchestrator] requestHint failed:", err);
      overlay.setHintState("error");
      overlay.setError("Failed to generate hint");
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
