// ─────────────────────────────────────────────────────────────────
// useSessionOrchestrator — Manages mock/live session lifecycle
// ─────────────────────────────────────────────────────────────────

import { useCallback, useRef } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAuthStore } from "@/store/userStore";
import { streamGenerateHint, type GenerateHintRequest } from "@/lib/api/ai";
import { hintIdempotencyKey } from "@/lib/ai/questionDetection";
import { lastTranscriptSlice } from "@/lib/ai/sessionAiContext";
import { buildFeatureContext } from "@/lib/ai/buildFeatureContext";
import { getMockInterviewContext } from "@/lib/mock/mockContextBridge";
import { parseResumeContentString } from "@/lib/documents/resumeParse";
import { useMockHintBridge } from "@/lib/mock/mockHintBridge";
import {
  getAiUserFacingError,
  isInsufficientCreditsError,
} from "@/lib/network/aiErrorUx";
import { useDocumentStore } from "@/store/documentStore";
import { useAudioStore } from "@/store/audioStore";
import { markAnswerLatency } from "@/lib/analytics/uxMetrics";
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
  const hintAbortRef = useRef<AbortController | null>(null);

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

  const appendAndActivateQuestion = useCallback((question: SessionQuestion | any) => {
    const sessionId = store.getState().session_id ?? "";
    const nextNumber = store.getState().questions.length + 1;
    const mapped: SessionQuestion = {
      id: question.id ?? crypto.randomUUID(),
      session_id: question.session_id || sessionId,
      question_number: question.question_number ?? nextNumber,
      question_text:
        question.question_text ?? question.question ?? question.text ?? String(question),
      question_type: question.question_type ?? question.type ?? "behavioural",
      expected_duration_seconds: question.expected_duration_seconds ?? 120,
      difficulty: question.difficulty ?? "medium",
      tags: question.tags ?? [],
      company_specific: question.company_specific ?? false,
    };
    store.getState().appendAndActivateQuestion(mapped);
  }, []);

  const nextQuestion = useCallback(() => {
    store.getState().advanceQuestion();
  }, []);

  const completeSession = useCallback(async () => {
    store.getState().setStatus("completed");
  }, []);

  const cancelHintRequest = useCallback(() => {
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
  }, []);

  const requestHint = useCallback(async (questionText: string) => {
    const overlay = useOverlayStore.getState();
    const session = store.getState();
    const isMock = session.mode === "mock";
    const mockHint = useMockHintBridge.getState();
    if (session.status === "completed" || session.status === "abandoned") {
      return;
    }
    const cfg = session.config as {
      instructions?: string;
      role?: string;
      company?: string;
      resume_id?: string | null;
      jd_id?: string | null;
      interview_type?: string;
      hint_style?: string;
      seniority?: string;
    } | null;
    const userId = useAuthStore.getState().profile?.id ?? useAuthStore.getState().user?.id;
    const activeResume = useDocumentStore.getState().active_context.resume as
      | { content?: string | null }
      | null;
    const parsed = parseResumeContentString(activeResume?.content ?? null);
    const interviewSnapshot = isMock ? getMockInterviewContext() : null;
    const transcript = lastTranscriptSlice(
      useAudioStore.getState().transcript?.full_transcript ?? "",
    );

    const built = userId
      ? await buildFeatureContext({
          operation: "generate_hint",
          userId,
          sessionId: session.session_id,
          question: questionText,
          interviewSnapshot,
          role: cfg?.role,
          company: cfg?.company,
          interviewType: cfg?.interview_type,
          experienceLevel: cfg?.seniority,
          seniority: cfg?.seniority,
          resumeId: cfg?.resume_id,
          jdId: cfg?.jd_id,
          instructions: cfg?.instructions,
          parsedResume: parsed,
          resumeContent: activeResume?.content ?? null,
          hintStyle: cfg?.hint_style ?? overlay.hint_style,
          coachTone: overlay.coach_tone,
          transcript,
          model: overlay.active_model ?? "gemini-2.5-flash",
        })
      : null;
    const resumeCtx = built?.resumeBlock || "None provided.";

    // Re-check after async context build — session may have ended.
    if (store.getState().status === "completed" || store.getState().status === "abandoned") {
      return;
    }

    // Record the user's question in chat history when overlay is active.
    if (!isMock) {
      overlay.addChatMessage({
        role: "user",
        text: questionText,
        timestamp: Date.now(),
      });
    }

    hintAbortRef.current?.abort();
    const controller = new AbortController();
    hintAbortRef.current = controller;
    const hintSessionId = session.session_id;
    const operationId = hintIdempotencyKey(session.session_id, questionText);
    if (isMock) {
      mockHint.setHintState("generating");
      mockHint.setHintError(null);
      mockHint.setStreamingText("");
    } else {
      overlay.beginHintOperation({
        operationId,
        sessionId: session.session_id,
        questionId: operationId,
        question: questionText,
      });
    }
    markAnswerLatency("t1", { feature: "mock_hint" });

    try {
      if (isMock) {
        mockHint.setHintState("generating");
      } else {
        overlay.setHintState("generating");
        overlay.setChatGenerating?.(true);
      }

      const payload: GenerateHintRequest = built
        ? (built.payload as GenerateHintRequest)
        : {
            question: questionText,
            resume_context: resumeCtx,
            transcript,
            interview_type: cfg?.interview_type ?? "behavioural",
            target_company: cfg?.company ?? "",
            model: overlay.active_model ?? "gemini-2.5-flash",
            session_id: session.session_id ?? undefined,
          };
      let streamed = "";
      let firstChunk = true;
      markAnswerLatency("t3", { feature: "mock_hint" });
      await streamGenerateHint(payload, {
        idempotencyKey: operationId,
        signal: controller.signal,
        onChunk: (chunk) => {
          if (
            controller.signal.aborted ||
            store.getState().session_id !== hintSessionId
          ) {
            return;
          }
          if (firstChunk) {
            firstChunk = false;
            markAnswerLatency("t5", { feature: "mock_hint" });
          }
          streamed += chunk;
          if (isMock) {
            mockHint.appendStreamingChunk(chunk);
          } else {
            overlay.appendStreamChunk(chunk, operationId);
          }
        },
        onDone: () => {
          markAnswerLatency("t6", { feature: "mock_hint" });
        },
      });

      if (
        controller.signal.aborted ||
        store.getState().session_id !== hintSessionId ||
        store.getState().status === "completed" ||
        store.getState().status === "abandoned"
      ) {
        return;
      }

      if (isMock) {
        mockHint.commitHint(streamed);
        overlay.setCurrentQuestion(questionText);
        overlay.setHintState("ready");
        overlay.setError(null);
      } else {
        overlay.commitStreamedHint(operationId);
        overlay.setHintState("ready");
        overlay.setError(null);
        overlay.addChatMessage({
          role: "assistant",
          text: streamed,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (
        store.getState().session_id !== hintSessionId ||
        store.getState().status === "completed" ||
        store.getState().status === "abandoned"
      ) {
        return;
      }

      const msg = getAiUserFacingError(err);
      console.error("[useSessionOrchestrator] requestHint failed:", err);

      if (isMock) {
        const errorMsg = isInsufficientCreditsError(err)
          ? msg
          : msg.includes("temporarily unavailable")
            ? "AI hint service is temporarily unavailable. Try again shortly."
            : `Hint failed: ${msg}`;
        mockHint.setHintState("error");
        mockHint.setHintError(errorMsg);
        overlay.setError(errorMsg);
        return;
      }

      overlay.setCurrentQuestion(questionText);
      overlay.setOfflineFallback(null);
      overlay.setError(
        isInsufficientCreditsError(err)
          ? msg
          : msg.includes("temporarily unavailable")
            ? "AI hint service is temporarily unavailable. Try again shortly."
            : `Hint failed: ${msg}`,
      );
    } finally {
      if (hintAbortRef.current === controller) {
        hintAbortRef.current = null;
      }
      if (!controller.signal.aborted && !isMock) {
        overlay.setChatGenerating?.(false);
      }
    }
  }, []);

  return {
    createSession,
    setQuestions,
    appendAndActivateQuestion,
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
    cancelHintRequest,
  };
}
