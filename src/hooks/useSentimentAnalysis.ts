import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useSentimentAnalysis
// Lightweight client-side sentiment analysis using heuristic word
// scoring — no API needed. Good enough for real-time confidence
// indicator during a mock interview session.
//
// API matches MockSession.tsx expectations:
//   const sentimentHook = useSentimentAnalysis(stt.transcript)
//   sentimentHook.label      — "positive" | "neutral" | "negative"
//   sentimentHook.confidence — 0-100 score
//   sentimentHook.score      — raw score (-100 to 100)
// ─────────────────────────────────────────────────────────────────

export type SentimentLabel = "positive" | "neutral" | "negative";

const POSITIVE_WORDS = new Set([
  "great", "excellent", "strong", "confident", "excited", "passionate",
  "achieved", "led", "improved", "solved", "delivered", "built",
  "successful", "effectively", "happy", "proud", "accomplished",
  "innovative", "collaborated", "optimized", "increased", "grew",
]);

const NEGATIVE_WORDS = new Set([
  "failed", "struggled", "difficult", "problem", "unfortunately",
  "mistake", "issue", "challenge", "worried", "confused",
  "wrong", "bad", "terrible", "awful", "sorry", "nervous",
  "unsure", "couldn't", "didn't", "won't",
]);

const FILLER_PENALTY_WORDS = new Set([
  "um", "uh", "like", "basically", "literally", "you know", "i mean",
]);

function analyzeText(text: string): { label: SentimentLabel; score: number; confidence: number } {
  if (!text.trim()) return { label: "neutral", score: 0, confidence: 50 };

  const words       = text.toLowerCase().split(/\s+/);
  const totalWords  = words.length;
  let   score       = 0;
  let   fillers     = 0;

  for (const word of words) {
    const clean = word.replace(/[^a-z']/g, "");
    if (POSITIVE_WORDS.has(clean)) score += 3;
    if (NEGATIVE_WORDS.has(clean)) score -= 3;
    if (FILLER_PENALTY_WORDS.has(clean)) { score -= 1; fillers += 1; }
  }

  // Sentence-length bonus — longer answers feel more confident
  if (totalWords > 50)  score += 5;
  if (totalWords > 100) score += 5;

  // Filler ratio penalty
  const fillerRatio = fillers / Math.max(totalWords, 1);
  score -= Math.round(fillerRatio * 20);

  // Clamp
  score = Math.max(-50, Math.min(50, score));

  const label: SentimentLabel =
    score > 5  ? "positive" :
    score < -5 ? "negative" : "neutral";

  // Map score to 0–100 confidence (50 = neutral baseline)
  const confidence = Math.round(50 + score);

  return { label, score, confidence };
}

export function useSentimentAnalysis(transcript = "") {
  const [label,      setLabel]      = useState<SentimentLabel>("neutral");
  const [score,      setScore]      = useState(0);
  const [confidence, setConfidence] = useState(50);

  const prevTextRef = useRef("");

  // ── Auto-analyze when transcript changes ─────────────────────
  useEffect(() => {
    if (transcript === prevTextRef.current) return;
    prevTextRef.current = transcript;

    const result = analyzeText(transcript);
    setLabel(result.label);
    setScore(result.score);
    setConfidence(result.confidence);
  }, [transcript]);

  // ── Manual analyze ────────────────────────────────────────────
  const analyze = useCallback((text: string): void => {
    const result = analyzeText(text);
    setLabel(result.label);
    setScore(result.score);
    setConfidence(result.confidence);
  }, []);

  return {
    label,
    score,
    confidence,     // 0-100
    sentiment: label,  // alias for backward compat
    analyze,
  };
}
