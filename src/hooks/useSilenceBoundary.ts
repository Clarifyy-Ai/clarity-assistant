import { useCallback, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useSilenceBoundary
// VAD (Voice Activity Detection) using AudioContext AnalyserNode.
// Fires onSilence(durationMs) when silence exceeds threshold.
// Used to trigger "interviewer finished — generate hint now".
// ─────────────────────────────────────────────────────────────────

interface SilenceBoundaryOptions {
  silenceThresholdDb:  number;   // default: -50 dB
  silenceDurationMs:   number;   // default: 800 ms
  onSilence:           (durationMs: number) => void;
  onSpeechStart:       () => void;
}

export function useSilenceBoundary({
  silenceThresholdDb = -50,
  silenceDurationMs  = 800,
  onSilence,
  onSpeechStart,
}: SilenceBoundaryOptions) {
  const contextRef   = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const sourceRef    = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const silenceStart = useRef<number | null>(null);
  const wasSpeaking  = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level,      setLevel]      = useState(0);

  // ── Attach to stream ──────────────────────────────────────────

  const attach = useCallback((stream: MediaStream): void => {
    const ctx      = new AudioContext({ sampleRate: 16_000 });
    const analyser = ctx.createAnalyser();
    analyser.fftSize           = 512;
    analyser.smoothingTimeConstant = 0.8;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    contextRef.current  = ctx;
    analyserRef.current = analyser;
    sourceRef.current   = source;

    const dataArray = new Float32Array(analyser.frequencyBinCount);

    function loop() {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatTimeDomainData(dataArray);

      // RMS → dB
      const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length);
      const db  = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const norm = Math.max(0, Math.min(1, (db + 80) / 80));
      setLevel(norm);

      const speaking = db > silenceThresholdDb;

      if (speaking) {
        silenceStart.current = null;
        if (!wasSpeaking.current) {
          wasSpeaking.current = true;
          setIsSpeaking(true);
          onSpeechStart();
        }
      } else {
        if (wasSpeaking.current) {
          // Just went silent — start timer
          if (!silenceStart.current) {
            silenceStart.current = Date.now();
          } else {
            const silent = Date.now() - silenceStart.current;
            if (silent >= silenceDurationMs) {
              wasSpeaking.current  = false;
              silenceStart.current = null;
              setIsSpeaking(false);
              onSilence(silent);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [silenceThresholdDb, silenceDurationMs, onSilence, onSpeechStart]);

  // ── Detach ────────────────────────────────────────────────────

  const detach = useCallback((): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    sourceRef.current?.disconnect();
    contextRef.current?.close();
    contextRef.current  = null;
    analyserRef.current = null;
    sourceRef.current   = null;
  }, []);

  return {
    attach,
    detach,
    isSpeaking,
    level,
  };
}
