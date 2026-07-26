import { ENV } from "@/lib/env";
import { useState, useEffect, useCallback } from "react";
import {
  scorecardsDB,
  sessionsDB,
  sessionAnswersDB,
} from "@/lib/supabase/database";
import { callGemini } from "@/lib/ai/geminiClient";
import { useAuthStore } from "@/store/userStore";
import type { Scorecard, QuestionScore } from "@/types/scorecard.types";

// ─────────────────────────────────────────────────────────────────
// useScorecard
// ─────────────────────────────────────────────────────────────────

interface UseScorecardOptions {
  sessionId: string;
}

interface ScorecardState {
  scorecard: Scorecard | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  isShared: boolean;
  shareUrl: string | null;
  shareToken: string | null;
}

interface SessionForScoring {
  interview_type?: string | null;
  experience_level?: string | null;
  duration_seconds?: number | null;
  filler_words?: number | null;
  total_filler_words?: number | null;
  avg_wpm?: number | null;
}

interface AnswerRow {
  id: string;
  question: string;
  answer?: string | null;
}

interface FillerSummary {
  total: number;
  rate_per_minute: number;
  top_3: Array<{ word: string; count: number }>;
}

interface WpmTrend {
  avg: number;
  trend: string;
}

interface FeedbackPayload {
  strengths: string[];
  improvements: string[];
  coach_note: string;
  star_adherence: number;
  clarity_score: number;
  structure_score: number;
  relevance_score: number;
}

export function useScorecard({ sessionId }: UseScorecardOptions) {
  const { profile } = useAuthStore();

  const [state, setState] = useState<ScorecardState>({
    scorecard: null,
    isLoading: true,
    isGenerating: false,
    error: null,
    isShared: false,
    shareUrl: null,
    shareToken: null,
  });

  const generateScorecard = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isGenerating: true, isLoading: false }));

    try {
      const session = await sessionsDB.getById(sessionId);

      if (!session) throw new Error("Session not found");

      const answerRows = await sessionAnswersDB.listBySessionId(sessionId);

      const questionsForScoring = (answerRows ?? []).map((row: AnswerRow) => ({
        id: row.id,
        question_text: row.question,
        candidate_answer: row.answer ?? "",
      }));

      const sessionMeta = session as SessionForScoring;
      const durationSeconds = sessionMeta.duration_seconds ?? 0;
      const fillerTotal =
        sessionMeta.filler_words ?? sessionMeta.total_filler_words ?? 0;
      const fillerSummary: FillerSummary = {
        total: fillerTotal,
        rate_per_minute:
          durationSeconds > 0 ? (fillerTotal / durationSeconds) * 60 : 0,
        top_3: [],
      };
      const wpmTrend: WpmTrend = {
        avg: sessionMeta.avg_wpm ?? 0,
        trend: "stable",
      };

      const questionScores = await scoreQuestions(
        questionsForScoring,
        sessionMeta
      );

      const overallScore = calculateOverallScore(
        questionScores,
        fillerSummary.rate_per_minute,
        wpmTrend.avg
      );

      const feedback = await generateFeedback(
        sessionMeta,
        questionScores,
        fillerSummary,
        wpmTrend,
        overallScore
      );

      const scorecard: Scorecard = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        user_id: profile?.id ?? "",
        overall_score: overallScore,
        confidence_score: Math.round(
          questionScores.reduce((a, q) => a + q.confidence_score, 0) /
            Math.max(1, questionScores.length)
        ),
        clarity_score: feedback.clarity_score,
        structure_score: feedback.structure_score,
        relevance_score: feedback.relevance_score,
        question_scores: questionScores,
        filler_count: fillerSummary.total,
        filler_rate: fillerSummary.rate_per_minute,
        top_filler_words: fillerSummary.top_3,
        wpm_avg: wpmTrend.avg,
        wpm_trend: wpmTrend.trend,
        strengths: feedback.strengths,
        improvements: feedback.improvements,
        coach_note: feedback.coach_note,
        star_adherence: feedback.star_adherence,
        is_shared: false,
        share_token: null,
        pdf_url: null,
        generated_at: new Date().toISOString(),
      };

      await scorecardsDB.create(scorecard);

      await sessionsDB.update(sessionId, {
        overall_score: overallScore,
        strengths: feedback.strengths,
        improvements: feedback.improvements,
        duration_seconds: durationSeconds || sessionMeta.duration_seconds,
      } as Parameters<typeof sessionsDB.update>[1]);

      setState((s) => ({
        ...s,
        scorecard,
        isGenerating: false,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isGenerating: false,
        error:
          err instanceof Error ? err.message : "Failed to generate scorecard",
      }));
    }
  }, [sessionId, profile]);

  const loadScorecard = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const existing = await scorecardsDB.getBySessionId(sessionId);

      if (existing) {
        setState((s) => ({
          ...s,
          scorecard: existing,
          isLoading: false,
          isShared: existing.is_shared,
          shareToken: existing.share_token,
          shareUrl: existing.share_token
            ? buildShareUrl(existing.share_token)
            : null,
        }));
        return;
      }

      await generateScorecard();
    } catch {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: "Failed to load scorecard",
      }));
    }
  }, [sessionId, generateScorecard]);

  useEffect(() => {
    if (!sessionId) return;
    void loadScorecard();
  }, [sessionId, loadScorecard]);

  const shareScorecard = useCallback(async (): Promise<string | null> => {
    if (!state.scorecard) return null;
    const token = generateShareToken();
    const url = buildShareUrl(token);
    try {
      await scorecardsDB.markShared(sessionId, token);
    } catch {
      return null;
    }
    setState((s) => ({ ...s, isShared: true, shareToken: token, shareUrl: url }));
    return url;
  }, [state.scorecard, sessionId]);

  /** Downloads scorecard as JSON (honest name — not a PDF). */
  const exportJSON = useCallback(async (): Promise<void> => {
    if (!state.scorecard) return;

    const json = JSON.stringify(state.scorecard, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clarify-ai-scorecard-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.scorecard, sessionId]);

  /** @deprecated Use exportJSON — kept for call-site compatibility. */
  const exportPDF = exportJSON;

  return {
    ...state,
    generateScorecard,
    shareScorecard,
    exportJSON,
    exportPDF,
    reload: loadScorecard,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

async function scoreQuestions(
  questions: Array<{
    id: string;
    question_text: string;
    candidate_answer: string;
  }>,
  session: SessionForScoring
): Promise<QuestionScore[]> {
  if (questions.length === 0) return [];
  const prompt = `You are an expert interview coach. Score each answer on a 0-100 scale.
Session type: ${session.interview_type}
Experience level: ${session.experience_level}

For each question, return a JSON array with objects:
{ "question_id": string, "score": number (0-100), "confidence_score": number (0-100), "star_used": boolean, "key_strength": string, "key_weakness": string, "coach_tip": string }

Questions and answers:
${questions
  .map(
    (q, i) =>
      `Q${i + 1}: "${q.question_text}"\nA: "${q.candidate_answer || "No answer recorded"}"`
  )
  .join("\n\n")}

Return ONLY valid JSON array.`;

  const text = await callGemini({ prompt, model: "gemini-1.5-flash" });
  const clean = text.replace(/```json|```/g, "").trim();
  let raw: Array<Partial<QuestionScore> & { question_id?: string }>;
  try {
    raw = JSON.parse(clean) as Array<
      Partial<QuestionScore> & { question_id?: string }
    >;
  } catch {
    throw new Error("Scorecard scoring failed: invalid AI response");
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Scorecard scoring failed: empty AI response");
  }
  return raw.map((r, i) => {
    if (typeof r.score !== "number" || typeof r.confidence_score !== "number") {
      throw new Error("Scorecard scoring failed: incomplete score payload");
    }
    return {
      question_id: r.question_id ?? questions[i]?.id ?? "",
      question_text: questions[i]?.question_text ?? "",
      order_index: i,
      score: r.score,
      confidence_score: r.confidence_score,
      star_used: r.star_used ?? false,
      key_strength: r.key_strength ?? "",
      key_weakness: r.key_weakness ?? "",
      coach_tip: r.coach_tip ?? "",
    };
  });
}

async function generateFeedback(
  session: SessionForScoring,
  scores: QuestionScore[],
  fillerSummary: FillerSummary,
  wpmTrend: WpmTrend,
  overallScore: number
): Promise<FeedbackPayload> {
  const prompt = `You are an expert interview coach. Generate structured feedback.

Session: ${session.interview_type}, ${session.experience_level}-level
Overall score: ${overallScore}/100
Filler word rate: ${fillerSummary.rate_per_minute.toFixed(1)}/min
Speaking pace: ${wpmTrend.avg} WPM (${wpmTrend.trend})

Return JSON:
{ "strengths": ["..."], "improvements": ["..."], "coach_note": "...", "star_adherence": number, "clarity_score": number, "structure_score": number, "relevance_score": number }

Return ONLY valid JSON.`;

  const text = await callGemini({ prompt, model: "gemini-1.5-flash" });
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: FeedbackPayload;
  try {
    parsed = JSON.parse(clean) as FeedbackPayload;
  } catch {
    throw new Error("Scorecard feedback failed: invalid AI response");
  }
  if (
    typeof parsed.clarity_score !== "number" ||
    typeof parsed.structure_score !== "number" ||
    typeof parsed.relevance_score !== "number"
  ) {
    throw new Error("Scorecard feedback failed: incomplete feedback payload");
  }
  return parsed;
}

function calculateOverallScore(
  questionScores: QuestionScore[],
  fillerRate: number,
  avgWPM: number
): number {
  const avgQuestionScore =
    questionScores.reduce((a, q) => a + q.score, 0) /
    Math.max(1, questionScores.length);
  const fillerPenalty = Math.max(0, (fillerRate - 2) * 1);
  const wpmPenalty =
    avgWPM < 110
      ? (110 - avgWPM) * 0.2
      : avgWPM > 180
        ? (avgWPM - 180) * 0.1
        : 0;
  return Math.max(
    0,
    Math.min(100, Math.round(avgQuestionScore - fillerPenalty - wpmPenalty))
  );
}

function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildShareUrl(token: string): string {
  return `${ENV.APP_URL || window.location.origin}/share/${token}`;
}
