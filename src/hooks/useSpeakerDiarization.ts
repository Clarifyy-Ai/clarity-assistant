// @ts-nocheck
import { useCallback, useRef } from "react";
import type { TranscriptSegment } from "./useDeepgramStream";

// ─────────────────────────────────────────────────────────────────
// useSpeakerDiarization
// Takes raw Deepgram segments and routes them to either the
// "interviewer" or "candidate" buffer based on speaker index.
// Also maintains a rolling window for question detection.
// ─────────────────────────────────────────────────────────────────

interface DiarizedOutput {
  interviewer: string;   // latest interviewer utterance
  candidate:   string;   // latest candidate utterance
  isInterviewer: boolean;
}

export function useSpeakerDiarization(
  onInterviewerUtterance: (text: string) => void
) {
  const interviewerBuffer = useRef<string[]>([]);
  const candidateBuffer   = useRef<string[]>([]);

  // The speaker index for the "interviewer" — auto-detected or
  // manually set. Defaults to 1 (second speaker, since candidate
  // speaks first on mic-only setups).
  const interviewerIndex  = useRef<0 | 1>(1);

  // ── Process incoming segment ──────────────────────────────────

  const processSegment = useCallback((segment: TranscriptSegment): DiarizedOutput => {
    const isInterviewer = segment.speaker === interviewerIndex.current;

    if (!segment.is_final) {
      return {
        interviewer:   interviewerBuffer.current.join(" "),
        candidate:     candidateBuffer.current.join(" "),
        isInterviewer,
      };
    }

    if (isInterviewer) {
      interviewerBuffer.current.push(segment.text);

      // Keep rolling window of last 5 utterances
      if (interviewerBuffer.current.length > 5) {
        interviewerBuffer.current.shift();
      }

      // Emit combined utterance for question detection
      onInterviewerUtterance(interviewerBuffer.current.join(" "));
    } else {
      candidateBuffer.current.push(segment.text);
      if (candidateBuffer.current.length > 8) {
        candidateBuffer.current.shift();
      }
    }

    return {
      interviewer:   interviewerBuffer.current.join(" "),
      candidate:     candidateBuffer.current.join(" "),
      isInterviewer,
    };
  }, [onInterviewerUtterance]);

  // ── Manual override for interviewer speaker index ─────────────

  const setInterviewerSpeaker = useCallback((index: 0 | 1): void => {
    interviewerIndex.current = index;
  }, []);

  // ── Flip speaker assignment ───────────────────────────────────

  const flipSpeakers = useCallback((): void => {
    interviewerIndex.current = interviewerIndex.current === 0 ? 1 : 0;
  }, []);

  // ── Clear buffers ─────────────────────────────────────────────

  const clear = useCallback((): void => {
    interviewerBuffer.current = [];
    candidateBuffer.current   = [];
  }, []);

  return {
    processSegment,
    setInterviewerSpeaker,
    flipSpeakers,
    clear,
    getInterviewerText: () => interviewerBuffer.current.join(" "),
    getCandidateText:   () => candidateBuffer.current.join(" "),
    interviewerIndex:   interviewerIndex.current,
  };
}
