/**
 * Transcript-based confidence signals for live metrics.
 * Weights: completeness 40%, filler penalty 30%, sentence structure 20%, vocabulary 10%.
 */

const FILLER_PATTERNS = [
  /\bum\b/gi,
  /\buh\b/gi,
  /\blike\b/gi,
  /\byou know\b/gi,
  /\bbasically\b/gi,
  /\bliterally\b/gi,
] as const;

const MIN_WORDS_FOR_FULL_SCORE = 15;

export const TRANSCRIPT_MIN_WORDS = MIN_WORDS_FOR_FULL_SCORE;

export interface TranscriptConfidenceResult {
  wordCount: number;
  confidenceScore: number;
  completeness: number;
  fillerPenalty: number;
  sentenceStructure: number;
  vocabulary: number;
  isEstimating: boolean;
}

function countSentences(text: string): number {
  const parts = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  return Math.max(1, parts.length);
}

function countFillers(text: string): number {
  let count = 0;
  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function scoreCompleteness(wordCount: number): number {
  if (wordCount < 5) return 10;
  if (wordCount < MIN_WORDS_FOR_FULL_SCORE) {
    return Math.round(20 + (wordCount / MIN_WORDS_FOR_FULL_SCORE) * 60);
  }
  return Math.min(100, Math.round(50 + (wordCount / 120) * 50));
}

function scoreFillerPenalty(wordCount: number, fillerCount: number): number {
  if (wordCount === 0) return 50;
  const rate = fillerCount / wordCount;
  if (rate <= 0.02) return 100;
  if (rate <= 0.05) return 80;
  if (rate <= 0.1) return 55;
  return Math.max(20, Math.round(100 - rate * 400));
}

function scoreSentenceStructure(sentenceCount: number, wordCount: number): number {
  if (wordCount < 3) return 30;
  const avgWordsPerSentence = wordCount / sentenceCount;
  if (avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25) return 95;
  if (avgWordsPerSentence >= 5 && avgWordsPerSentence <= 35) return 75;
  return 50;
}

function scoreVocabulary(words: string[]): number {
  if (words.length === 0) return 40;
  const avgLen =
    words.reduce((sum, w) => sum + w.replace(/[^a-z0-9]/gi, "").length, 0) /
    words.length;
  if (avgLen >= 5.5) return 95;
  if (avgLen >= 4.5) return 80;
  if (avgLen >= 3.5) return 65;
  return 45;
}

export function computeTranscriptConfidence(rawText: string): TranscriptConfidenceResult {
  const text = rawText.trim().toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const isEstimating = wordCount < MIN_WORDS_FOR_FULL_SCORE;

  if (wordCount === 0) {
    return {
      wordCount: 0,
      confidenceScore: 0,
      completeness: 0,
      fillerPenalty: 50,
      sentenceStructure: 30,
      vocabulary: 40,
      isEstimating: true,
    };
  }

  const fillerCount = countFillers(text);
  const sentenceCount = countSentences(text);

  const completeness = scoreCompleteness(wordCount);
  const fillerPenalty = scoreFillerPenalty(wordCount, fillerCount);
  const sentenceStructure = scoreSentenceStructure(sentenceCount, wordCount);
  const vocabulary = scoreVocabulary(words);

  const confidenceScore = Math.round(
    completeness * 0.4 +
      fillerPenalty * 0.3 +
      sentenceStructure * 0.2 +
      vocabulary * 0.1,
  );

  return {
    wordCount,
    confidenceScore: Math.min(100, Math.max(0, confidenceScore)),
    completeness,
    fillerPenalty,
    sentenceStructure,
    vocabulary,
    isEstimating,
  };
}
