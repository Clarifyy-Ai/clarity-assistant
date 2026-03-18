import { useState, useCallback } from "react";

// Stub hook for speech recognition via Web Speech API
export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);

  const start = useCallback(() => setIsListening(true), []);
  const stop = useCallback(() => setIsListening(false), []);
  const reset = useCallback(() => { setTranscript(""); setIsListening(false); }, []);

  return { transcript, isListening, start, stop, reset, setTranscript };
}
