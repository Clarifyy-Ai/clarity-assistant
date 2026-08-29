// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useSpeechRecognition
// Wraps the Web Speech API (SpeechRecognition / webkitSpeechRecognition).
// Provides interim + final transcripts, mute/unmute, and auto-restart.
// Falls back gracefully when the API is unavailable (Firefox, older iOS).
// ─────────────────────────────────────────────────────────────────

interface SpeechRecognitionHook {
  transcript:        string;
  interimTranscript: string;
  isListening:       boolean;
  isMuted:           boolean;
  isSupported:       boolean;
  start:             () => void;
  stop:              () => void;
  resetTranscript:   () => void;
  toggleMute:        () => void;
  setTranscript:     (text: string) => void;
}

// Extend the global window type to include vendor-prefixed API
declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [transcript,        setTranscript]        = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening,       setIsListening]       = useState(false);
  const [isMuted,           setIsMuted]           = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isMutedRef     = useRef(false);
  const isActiveRef    = useRef(false);
  const recognitionGenerationRef = useRef(0);

  // ── Check API support ─────────────────────────────────────────
  const SpeechRecognitionAPI =
    typeof window !== "undefined"
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null)
      : null;

  const isSupported = SpeechRecognitionAPI !== null;

  // ── Build recognition instance ────────────────────────────────
  const createRecognition = useCallback((): SpeechRecognition | null => {
    if (!SpeechRecognitionAPI) return null;

    const rec = new SpeechRecognitionAPI();
    const generation = ++recognitionGenerationRef.current;
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      if (isMutedRef.current) return;

      let interimText = "";
      let finalText   = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + " ";
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        setTranscript((prev) => (prev + finalText).trim());
      }
      setInterimTranscript(interimText);
    };

    rec.onend = () => {
      setInterimTranscript("");
      // Auto-restart unless explicitly stopped
      // A previous instance can finish asynchronously after start() creates
      // its replacement. Only the current instance may auto-restart.
      if (
        generation === recognitionGenerationRef.current &&
        recognitionRef.current === rec &&
        isActiveRef.current &&
        !isMutedRef.current
      ) {
        try { rec.start(); } catch { /* ignore overlapping start */ }
      } else {
        setIsListening(false);
      }
    };

    rec.onerror = (event) => {
      // "no-speech" and "audio-capture" are transient — auto-restart handles them
      if (event.error !== "no-speech" && event.error !== "audio-capture") {
        console.warn("[SpeechRecognition] error:", event.error);
      }
    };

    return rec;
  }, [SpeechRecognitionAPI]);

  // ── Start listening ───────────────────────────────────────────
  const start = useCallback((): void => {
    if (!isSupported) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ok */ }
    }

    const rec = createRecognition();
    if (!rec) return;

    recognitionRef.current = rec;
    isActiveRef.current    = true;
    isMutedRef.current     = false;

    try {
      rec.start();
      setIsListening(true);
      setIsMuted(false);
    } catch (err) {
      console.warn("[SpeechRecognition] start failed:", err);
    }
  }, [isSupported, createRecognition]);

  // ── Stop listening ────────────────────────────────────────────
  const stop = useCallback((): void => {
    isActiveRef.current = false;
    recognitionGenerationRef.current++;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ok */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  // ── Reset transcript ──────────────────────────────────────────
  const resetTranscript = useCallback((): void => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // ── Mute / unmute ─────────────────────────────────────────────
  const toggleMute = useCallback((): void => {
    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);

    if (newMuted) {
      // Muted — stop recognition but keep isActiveRef true for auto-resume
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ok */ }
      }
      setInterimTranscript("");
    } else {
      // Unmuted — restart if still in active session
      if (isActiveRef.current) {
        const rec = createRecognition();
        if (rec) {
          recognitionRef.current = rec;
          try { rec.start(); setIsListening(true); } catch { /* ok */ }
        }
      }
    }
  }, [createRecognition]);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* ok */ }
    };
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isMuted,
    isSupported,
    start,
    stop,
    resetTranscript,
    toggleMute,
    setTranscript,
  };
}
