import type {
  TranscriptUtterance,
  DiarizationSegment,
  Speaker,
} from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";

// ─────────────────────────────────────────────────────────────────
// Speaker Diarization Engine
// Two-channel approach:
//   Channel 0 (Deepgram speaker 0) → Interviewer
//   Channel 1 (Deepgram speaker 1) → Candidate
//
// Heuristics to improve accuracy:
//   - Questions ending with "?" → interviewer
//   - Short acknowledgements ("okay", "sure", "got it") → candidate
//   - Silence boundary detection to confirm speaker switch
// ─────────────────────────────────────────────────────────────────

// Phrases that almost always come from the interviewer
const INTERVIEWER_SIGNALS = [
  "can you tell me",
  "tell me about",
  "how would you",
  "what would you",
  "walk me through",
  "describe a time",
  "have you ever",
  "what is your",
  "why did you",
  "how do you",
  "what do you think",
  "if you had to",
  "let's say",
  "suppose",
  "imagine",
  "design a",
  "implement",
  "explain",
  "what are the",
];

// Short candidate acknowledgements
const CANDIDATE_ACK_PHRASES = [
  "sure",
  "absolutely",
  "of course",
  "great question",
  "that's a good question",
  "let me think",
  "so",
  "okay so",
];

// ─────────────────────────────────────────────────────────────────
// Classify speaker from utterance
// ─────────────────────────────────────────────────────────────────

export function classifySpeaker(
  utterance: TranscriptUtterance,
  previousSpeaker: Speaker
): Speaker {
  const text = utterance.text.trim().toLowerCase();

  // Direct from Deepgram diarization — speaker 0 = interviewer by convention
  if (utterance.speaker === "interviewer") return "interviewer";
  if (utterance.speaker === "candidate")   return "candidate";

  // Heuristic: question mark at end → interviewer
  if (text.endsWith("?")) return "interviewer";

  // Heuristic: interviewer signal phrases
  if (INTERVIEWER_SIGNALS.some((s) => text.includes(s))) {
    return "interviewer";
  }

  // Heuristic: very short candidate ack
  if (
    text.split(" ").length <= 5 &&
    CANDIDATE_ACK_PHRASES.some((p) => text.startsWith(p))
  ) {
    return "candidate";
  }

  // Default: maintain previous speaker (speaker inertia)
  return previousSpeaker;
}

// ─────────────────────────────────────────────────────────────────
// Extract the interviewer's question from recent utterances
// ─────────────────────────────────────────────────────────────────

export function extractLatestQuestion(
  utterances: TranscriptUtterance[]
): string | null {
  // Walk backwards to find last interviewer utterance
  for (let i = utterances.length - 1; i >= 0; i--) {
    const u = utterances[i];
    if (u.speaker === "interviewer" && u.is_final) {
      return u.text;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Detect speaker change
// ─────────────────────────────────────────────────────────────────

export function detectSpeakerChange(
  newUtterance: TranscriptUtterance,
  segments: DiarizationSegment[]
): boolean {
  if (segments.length === 0) return true;
  const lastSegment = segments[segments.length - 1];
  return lastSegment.speaker !== newUtterance.speaker;
}

// ─────────────────────────────────────────────────────────────────
// Build diarization segment from utterance
// ─────────────────────────────────────────────────────────────────

export function buildDiarizationSegment(
  utterance: TranscriptUtterance
): DiarizationSegment {
  return {
    speaker:    utterance.speaker,
    start_ms:   utterance.start_ms,
    end_ms:     utterance.end_ms,
    text:       utterance.text,
    confidence: utterance.confidence,
  };
}

// ─────────────────────────────────────────────────────────────────
// Process a new utterance through the full diarization pipeline
// Updates audio store with classified speaker and segment
// ─────────────────────────────────────────────────────────────────

export function processUtteranceForDiarization(
  utterance: TranscriptUtterance
): TranscriptUtterance {
  const store = useAudioStore.getState();
  const { diarization } = store;

  // Classify speaker
  const classifiedSpeaker = classifySpeaker(
    utterance,
    diarization.current_speaker
  );

  const enrichedUtterance: TranscriptUtterance = {
    ...utterance,
    speaker:                 classifiedSpeaker,
    is_interviewer_question: classifiedSpeaker === "interviewer" &&
                             utterance.text.trim().endsWith("?"),
  };

  // Update store
  store.setCurrentSpeaker(classifiedSpeaker);
  store.addDiarizationSegment(buildDiarizationSegment(enrichedUtterance));
  store.addUtterance(enrichedUtterance);

  // If interviewer just asked a question, set it as last question
  if (enrichedUtterance.is_interviewer_question) {
    store.setLastQuestion(enrichedUtterance.text);
  }

  return enrichedUtterance;
}

// ─────────────────────────────────────────────────────────────────
// Get full transcript separated by speaker
// ─────────────────────────────────────────────────────────────────

export function getTranscriptBySpeaker(
  utterances: TranscriptUtterance[]
): {
  interviewer: string[];
  candidate: string[];
} {
  const interviewer: string[] = [];
  const candidate: string[] = [];

  for (const u of utterances) {
    if (!u.is_final) continue;
    if (u.speaker === "interviewer") interviewer.push(u.text);
    else candidate.push(u.text);
  }

  return { interviewer, candidate };
}

// ─────────────────────────────────────────────────────────────────
// Summarise speaking time per speaker
// ─────────────────────────────────────────────────────────────────

export function getSpeakingTimeSummary(
  segments: DiarizationSegment[]
): Record<Speaker, number> {
  const totals: Record<Speaker, number> = {
    interviewer: 0,
    candidate:   0,
    unknown:     0,
  };

  for (const seg of segments) {
    totals[seg.speaker] += seg.end_ms - seg.start_ms;
  }

  return totals;
}
