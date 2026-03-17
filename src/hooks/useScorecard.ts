import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { callGemini } from "@/lib/ai/geminiClient";
import { callOpenAI } from "@/lib/ai/openaiClient";
import { buildFillerSummary } from "@/lib/audio/fillerDetector";
import { analyseWPMTrend } from "@/lib/audio/wpmTracker";
import { useAuthStore } from "@/store/userStore";
import type {
  Scorecard,
  QuestionScore,
  FillerWordOccurrence,
  WPMDataPoint,
} from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// useScorecard
// Fetches session data, generates AI scorecard analysis,
// and handles PDF export + sharing.
// ─────────────────────────────────────────────────────────────────

interface UseScorecardOptions {
  sessionId: string;
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

  // ── Load scorecard ────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    loadScorecard();
  }, [sessionId]);

  async function loadScorecard(): Promise<void> {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Check if scorecard already exists in DB
      const { data: existing } = await supabase
        .from("scorecards")
        .select("*")
        .eq("session_id", sessionId)
        .single();

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

      // Generate scorecard from session data
      await generateScorecard();

    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error:     "Failed to load scorecard",
      }));
    }
  }

  // ── Generate scorecard ────────────────────────────────────────

  const generateScorecard = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isGenerating: true, isLoading: false }));

    try {
      // Fetch session data
      const { data: session } = await supabase
        .from("sessions")
        .select(`
          *,
          session_questions(*)
        `)
        .eq("id", sessionId)
        .single();

      if (!session) throw new Error("Session not found");

      // Fetch transcript
      const { data: transcript } = await supabase
        .from("transcripts")
        .select("utterances, filler_occurrences, wpm_data_points")
        .eq("session_id", sessionId)
        .single();

      const fillerOccurrences: FillerWordOccurrence[] =
        transcript?.filler_occurrences ?? [];
      const wpmDataPoints: WPMDataPoint[] =
        transcript?.wpm_data_points ?? [];
      const durationSeconds = session.duration_seconds ?? 0;

      // Build filler + WPM summaries
      const fillerSummary = buildFillerSummary(fillerOccurrences, durationSeconds);
      const wpmTrend      = analyseWPMTrend(wpmDataPoints);

      // Call AI to score each question answer
      const questionScores = await scoreQuestions(
        session.session_questions ?? [],
        transcript?.utterances ?? [],
        session
      );

      // Calculate overall score
      const overallScore = calculateOverallScore(
        questionScores,
        fillerSummary.rate_per_minute,
        wpmTrend.avg
      );

      // Generate written feedback
      const feedback = await generateFeedback(
        session,
        questionScores,
        fillerSummary,
        wpmTrend,
        overallScore
      );

      // Assemble scorecard
      const scorecard: Scorecard = {
        id:                  crypto.randomUUID(),
        session_id:          sessionId,
        user_id:             profile?.id ?? "",
        overall_score:       overallScore,
        confidence_score:    Math.round(
                               questionScores.reduce((a, q) => a + q.confidence_score, 0) /
                               Math.max(1, questionScores.length)
                             ),
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

      // Save to DB
      await supabase.from("scorecards").insert(scorecard);

      setState((s) => ({
        ...s,
        scorecard,
        isGenerating: false,
      }));

    } catch (err) {
      setState((s) => ({
        ...s,
        isGenerating: false,
        error: "Failed to generate scorecard",
      }));
    }
  }, [sessionId, profile]);

  // ── Share scorecard ───────────────────────────────────────────

  const shareScorecard = useCallback(async (): Promise<string | null> => {
    if (!state.scorecard) return null;

    const token = generateShareToken();
    const url   = buildShareUrl(token);

    const { error } = await supabase
      .from("scorecards")
      .update({ is_shared: true, share_token: token })
      .eq("session_id", sessionId);

    if (error) return null;

    setState((s) => ({
      ...s,
      isShared:   true,
      shareToken: token,
      shareUrl:   url,
    }));

    return url;
  }, [state.scorecard, sessionId]);

  // ── Export PDF ────────────────────────────────────────────────

  const exportPDF = useCallback(async (): Promise<void> => {
    if (!state.scorecard) return;

    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    const response = await fetch(`${EDGE_BASE}/export-scorecard-pdf`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) return;

    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `confideq-scorecard-${sessionId.slice(0, 8)}.pdf`;
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

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function scoreQuestions(
  questions: any[],
  utterances: any[],
  session: any
): Promise<QuestionScore[]> {
  if (questions.length === 0) return [];

  const prompt = `You are an expert interview coach. Score each answer on a 0-100 scale.
Session type: ${session.interview_type}
Experience level: ${session.experience_level}

For each question, return a JSON array with objects:
{
  "question_id": string,
  "score": number (0-100),
  "confidence_score": number (0-100),
  "star_used": boolean,
  "key_strength": string,
  "key_weakness": string,
  "coach_tip": string
}

Questions and answers:
${questions.map((q: any, i: number) => `Q${i + 1}: "${q.question_text}"\nA: "${q.candidate_answer ?? "No answer recorded"}"`).join("\n\n")}

Return ONLY valid JSON array.`;

  try {
    const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
    const clean = text.replace(/```json|```/g, "").trim();
    const raw   = JSON.parse(clean);
    return raw.map((r: any, i: number) => ({
      ...r,
      question_text: questions[i]?.question_text ?? "",
      order_index:   i,
    })) as QuestionScore[];
  } catch {
    return questions.map((q: any, i: number) => ({
      question_id:      q.id,
      question_text:    q.question_text,
      order_index:      i,
      score:            50,
      confidence_score: 50,
      star_used:        false,
      key_strength:     "Unable to analyse",
      key_weakness:     "Unable to analyse",
      coach_tip:        "Review your answer and practice the STAR framework.",
    }));
  }
}

async function generateFeedback(
  session: any,
  scores: QuestionScore[],
  fillerSummary: ReturnType<typeof buildFillerSummary>,
  wpmTrend: ReturnType<typeof analyseWPMTrend>,
  overallScore: number
): Promise<{
  strengths:      string[];
  improvements:   string[];
  coach_note:     string;
  star_adherence: number;
  clarity_score:  number;
  structure_score: number;
  relevance_score: number;
}> {
  const prompt = `You are an expert interview coach. Generate structured feedback.

Session: ${session.interview_type}, ${session.experience_level}-level
Overall score: ${overallScore}/100
Filler word rate: ${fillerSummary.rate_per_minute.toFixed(1)}/min
Speaking pace: ${wpmTrend.avg} WPM (${wpmTrend.trend})
Top fillers: ${fillerSummary.top_3.map((f) => f.word).join(", ") || "none"}

Question scores: ${scores.map((s) => `${s.score}/100`).join(", ")}

Return JSON:
{
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "coach_note": "2-3 sentence personal note",
  "star_adherence": number (0-100),
  "clarity_score": number (0-100),
  "structure_score": number (0-100),
  "relevance_score": number (0-100)
}

Return ONLY valid JSON.`;

  try {
    const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      strengths:       ["Completed the session"],
      improvements:    ["Practice the STAR framework", "Reduce filler words"],
      coach_note:      "Keep practising — consistency is key.",
      star_adherence:  50,
      clarity_score:   50,
      structure_score: 50,
      relevance_score: 50,
    };
  }
}

function calculateOverallScore(
  questionScores: QuestionScore[],
  fillerRate: number,
  avgWPM: number
): number {
  const avgQuestionScore =
    questionScores.reduce((a, q) => a + q.score, 0) /
    Math.max(1, questionScores.length);

  // Filler penalty: -1 point per filler per minute above 2/min
  const fillerPenalty = Math.max(0, (fillerRate - 2) * 1);

  // WPM penalty: outside 110-160 range
  const wpmPenalty =
    avgWPM < 110 ? (110 - avgWPM) * 0.2 :
    avgWPM > 180 ? (avgWPM - 180) * 0.1 : 0;

  return Math.max(0, Math.min(100, Math.round(
    avgQuestionScore - fillerPenalty - wpmPenalty
  )));
}

function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildShareUrl(token: string): string {
  return `${import.meta.env.VITE_APP_URL ?? window.location.origin}/scorecard/shared/${token}`;
}
