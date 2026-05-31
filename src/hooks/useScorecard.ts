// @ts-nocheck
import { ENV } from "@/lib/env";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { callGemini } from "@/lib/ai/geminiClient";
import { buildFillerSummary } from "@/lib/audio/fillerDetector";
import { analyseWPMTrend } from "@/lib/audio/wpmTracker";
import { useAuthStore } from "@/store/userStore";
import type {
  SessionScorecard,
  SessionAnswer,
  FillerWordOccurrence,
  WPMDataPoint,
} from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// useScorecard
// ─────────────────────────────────────────────────────────────────

interface UseScorecardOptions {
  sessionId: string;
}

interface QuestionScore {
  question_id: string;
  question_text: string;
  order_index: number;
  score: number;
  confidence_score: number;
  star_used: boolean;
  key_strength: string;
  key_weakness: string;
  coach_tip: string;
}

interface Scorecard {
  id: string;
  session_id: string;
  user_id: string;
  overall_score: number;
  confidence_score: number;
  clarity_score: number;
  structure_score: number;
  relevance_score: number;
  question_scores: QuestionScore[];
  filler_count: number;
  filler_rate: number;
  top_filler_words: Array<{ word: string; count: number }>;
  wpm_avg: number;
  wpm_trend: string;
  strengths: string[];
  improvements: string[];
  coach_note: string;
  star_adherence: number;
  is_shared: boolean;
  share_token: string | null;
  pdf_url: string | null;
  generated_at: string;
}

interface ScorecardState {
  scorecard:   Scorecard | null;
  isLoading:   boolean;
  isGenerating: boolean;
  error:       string | null;
  isShared:    boolean;
  shareUrl:    string | null;
  shareToken:  string | null;
}

export function useScorecard({ sessionId }: UseScorecardOptions) {
  const { profile } = useAuthStore();

  const [state, setState] = useState<ScorecardState>({
    scorecard:    null,
    isLoading:    true,
    isGenerating: false,
    error:        null,
    isShared:     false,
    shareUrl:     null,
    shareToken:   null,
  });

  useEffect(() => {
    if (!sessionId) return;
    loadScorecard();
  }, [sessionId]);

  async function loadScorecard(): Promise<void> {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const { data: existing } = await supabase
        .from("scorecards")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (existing) {
        setState((s) => ({
          ...s,
          scorecard:   existing as Scorecard,
          isLoading:   false,
          isShared:    existing.is_shared ?? false,
          shareToken:  existing.share_token ?? null,
          shareUrl:    existing.share_token
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
        error:     "Failed to load scorecard",
      }));
    }
  }

  const generateScorecard = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isGenerating: true, isLoading: false }));

    try {
      const { data: session } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (!session) throw new Error("Session not found");

      const { data: answerRows } = await supabase
        .from("session_answers")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      const questionsForScoring = (answerRows ?? []).map((row: any) => ({
        id: row.id,
        question_text: row.question,
        candidate_answer: row.answer ?? "",
      }));

      const durationSeconds = session.duration_seconds ?? 0;
      const fillerTotal = session.filler_words ?? session.total_filler_words ?? 0;
      const fillerSummary = {
        total: fillerTotal,
        rate_per_minute:
          durationSeconds > 0 ? (fillerTotal / durationSeconds) * 60 : 0,
        top_3: [] as Array<{ word: string; count: number }>,
      };
      const wpmTrend = {
        avg: session.avg_wpm ?? 140,
        trend: "stable" as const,
      };

      const questionScores = await scoreQuestions(
        questionsForScoring,
        [],
        session
      );

      const overallScore = calculateOverallScore(questionScores, fillerSummary.rate_per_minute, wpmTrend.avg);

      const feedback = await generateFeedback(session, questionScores, fillerSummary, wpmTrend, overallScore);

      const scorecard: Scorecard = {
        id:                  crypto.randomUUID(),
        session_id:          sessionId,
        user_id:             profile?.id ?? "",
        overall_score:       overallScore,
        confidence_score:    Math.round(questionScores.reduce((a, q) => a + q.confidence_score, 0) / Math.max(1, questionScores.length)),
        clarity_score:       feedback.clarity_score,
        structure_score:     feedback.structure_score,
        relevance_score:     feedback.relevance_score,
        question_scores:     questionScores,
        filler_count:        fillerSummary.total,
        filler_rate:         fillerSummary.rate_per_minute,
        top_filler_words:    fillerSummary.top_3,
        wpm_avg:             wpmTrend.avg,
        wpm_trend:           wpmTrend.trend,
        strengths:           feedback.strengths,
        improvements:        feedback.improvements,
        coach_note:          feedback.coach_note,
        star_adherence:      feedback.star_adherence,
        is_shared:           false,
        share_token:         null,
        pdf_url:             null,
        generated_at:        new Date().toISOString(),
      };

      await supabase.from("scorecards").insert(scorecard);

      await supabase
        .from("sessions")
        .update({
          overall_score: overallScore,
          ai_feedback: feedback.coach_note,
          strengths: feedback.strengths,
          improvements: feedback.improvements,
          duration_seconds: durationSeconds || session.duration_seconds,
        } as any)
        .eq("id", sessionId);

      setState((s) => ({ ...s, scorecard, isGenerating: false }));
    } catch {
      setState((s) => ({ ...s, isGenerating: false, error: "Failed to generate scorecard" }));
    }
  }, [sessionId, profile]);

  const shareScorecard = useCallback(async (): Promise<string | null> => {
    if (!state.scorecard) return null;
    const token = generateShareToken();
    const url   = buildShareUrl(token);
    const { error } = await supabase.from("scorecards").update({ is_shared: true, share_token: token }).eq("session_id", sessionId);
    if (error) return null;
    setState((s) => ({ ...s, isShared: true, shareToken: token, shareUrl: url }));
    return url;
  }, [state.scorecard, sessionId]);

  const exportPDF = useCallback(async (): Promise<void> => {
    if (!state.scorecard) return;

    // Client-side JSON download — the export-scorecard-pdf edge function
    // is not yet deployed. Print/save as PDF via the browser for a formatted view.
    const json = JSON.stringify(state.scorecard, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `clarify-ai-scorecard-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.scorecard, sessionId]);

  return {
    ...state,
    generateScorecard,
    shareScorecard,
    exportPDF,
    reload: loadScorecard,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

async function scoreQuestions(questions: any[], utterances: any[], session: any): Promise<QuestionScore[]> {
  if (questions.length === 0) return [];
  const prompt = `You are an expert interview coach. Score each answer on a 0-100 scale.
Session type: ${session.interview_type}
Experience level: ${session.experience_level}

For each question, return a JSON array with objects:
{ "question_id": string, "score": number (0-100), "confidence_score": number (0-100), "star_used": boolean, "key_strength": string, "key_weakness": string, "coach_tip": string }

Questions and answers:
${questions
  .map(
    (q: any, i: number) =>
      `Q${i + 1}: "${q.question_text ?? q.question ?? ""}"\nA: "${q.candidate_answer ?? q.answer ?? "No answer recorded"}"`
  )
  .join("\n\n")}

Return ONLY valid JSON array.`;

  try {
    const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
    const clean = text.replace(/```json|```/g, "").trim();
    const raw   = JSON.parse(clean);
    return raw.map((r: any, i: number) => ({ ...r, question_text: questions[i]?.question_text ?? "", order_index: i })) as QuestionScore[];
  } catch {
    return questions.map((q: any, i: number) => ({
      question_id: q.id, question_text: q.question_text, order_index: i,
      score: 50, confidence_score: 50, star_used: false,
      key_strength: "Unable to analyse", key_weakness: "Unable to analyse",
      coach_tip: "Review your answer and practice the STAR framework.",
    }));
  }
}

async function generateFeedback(session: any, scores: QuestionScore[], fillerSummary: any, wpmTrend: any, overallScore: number): Promise<{ strengths: string[]; improvements: string[]; coach_note: string; star_adherence: number; clarity_score: number; structure_score: number; relevance_score: number; }> {
  const prompt = `You are an expert interview coach. Generate structured feedback.

Session: ${session.interview_type}, ${session.experience_level}-level
Overall score: ${overallScore}/100
Filler word rate: ${fillerSummary.rate_per_minute.toFixed(1)}/min
Speaking pace: ${wpmTrend.avg} WPM (${wpmTrend.trend})

Return JSON:
{ "strengths": ["..."], "improvements": ["..."], "coach_note": "...", "star_adherence": number, "clarity_score": number, "structure_score": number, "relevance_score": number }

Return ONLY valid JSON.`;

  try {
    const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { strengths: ["Completed the session"], improvements: ["Practice the STAR framework"], coach_note: "Keep practising.", star_adherence: 50, clarity_score: 50, structure_score: 50, relevance_score: 50 };
  }
}

function calculateOverallScore(questionScores: QuestionScore[], fillerRate: number, avgWPM: number): number {
  const avgQuestionScore = questionScores.reduce((a, q) => a + q.score, 0) / Math.max(1, questionScores.length);
  const fillerPenalty = Math.max(0, (fillerRate - 2) * 1);
  const wpmPenalty = avgWPM < 110 ? (110 - avgWPM) * 0.2 : avgWPM > 180 ? (avgWPM - 180) * 0.1 : 0;
  return Math.max(0, Math.min(100, Math.round(avgQuestionScore - fillerPenalty - wpmPenalty)));
}

function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildShareUrl(token: string): string {
  return `${ENV.APP_URL || window.location.origin}/scorecard/shared/${token}`;
}
