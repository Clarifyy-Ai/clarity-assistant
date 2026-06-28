// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep4AudioSetup.tsx — Step 4: Microphone test + system audio info.
// Rendered inside OnboardingIndex (no outer page wrapper needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { Button } from "@/components/ui/Button";
import {
  Mic, Volume2, CheckCircle,
  AlertCircle, Monitor, Info, Play, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";

const RECORD_SECONDS = 3;

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingStep4AudioSetup({ onNext, onBack }: StepProps) {
  const { user, setProfile } = useAuthStore();
  const audio                = useAudioCapture();

  const [recording,   setRecording]   = useState(false);
  const [recordSecs,  setRecordSecs]  = useState(0);
  const [micOk,        setMicOk]        = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [testError,    setTestError]    = useState<string | null>(null);
  const [playbackUrl,  setPlaybackUrl]  = useState<string | null>(null);

  const [level, setLevel] = useState(0);
  const rafRef              = useRef<number | null>(null);
  const ctxRef              = useRef<AudioContext | null>(null);
  const recorderRef         = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const recordTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef          = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      ctxRef.current?.close();
      recorderRef.current?.stop();
      audio.stopAll();
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopVisualizer() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close();
    ctxRef.current = null;
  }

  function startVisualizer(stream: MediaStream) {
    const ctx = new AudioContext();
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyserNode);
    ctxRef.current = ctx;

    const data = new Float32Array(analyserNode.frequencyBinCount);

    function loop() {
      analyserNode.getFloatTimeDomainData(data);
      const rms  = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      setLevel(Math.min(1, rms * 8));
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  function resetRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    stopVisualizer();
    recorderRef.current?.stop();
    recorderRef.current = null;
    chunksRef.current = [];
    audio.stopAll();
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    setRecording(false);
    setRecordSecs(0);
    setMicOk(false);
    setLevel(0);
  }

  async function startMicTest() {
    setTestError(null);
    resetRecording();

    const { error } = await audio.startMic();
    if (error) {
      setTestError(error);
      return;
    }

    const stream = audio.micStream;
    if (!stream) {
      setTestError("Microphone stream not available. Please try again.");
      return;
    }

    startVisualizer(stream);
    setRecording(true);
    setRecordSecs(RECORD_SECONDS);

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stopVisualizer();
      audio.stopAll();
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);
        setMicOk(true);
      } else {
        setTestError("No audio captured. Please try again.");
      }
      setRecording(false);
      setRecordSecs(0);
    };

    recorder.start();

    recordTimerRef.current = setInterval(() => {
      setRecordSecs((prev) => {
        if (prev <= 1) {
          if (recordTimerRef.current) clearInterval(recordTimerRef.current);
          recorderRef.current?.stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function playRecording() {
    if (!playbackUrl) return;
    if (audioElRef.current) {
      audioElRef.current.pause();
    }
    const el = new Audio(playbackUrl);
    audioElRef.current = el;
    void el.play();
  }

  async function handleNext() {
    if (!user || !micOk) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        audio_input_device:  "default",
        auto_transcript:     true,
        noise_suppression:   true,
        onboarding_step:     5,
      })
      .eq("id", user.id)
      .select()
      .maybeSingle();

    setLoading(false);
    if (!error && data) {
      setProfile(data as unknown as ProfileRow);
    }

    onNext({ audioVerified: true });
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {/* ── Heading ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Audio setup</h2>
        <p className="text-muted-foreground text-sm">
          Clarify AI needs your microphone to transcribe interview questions in real time.
          System audio capture lets it hear the interviewer through Zoom or Teams.
        </p>
      </div>

      {/* ── Mic test card ───────────────────────────────────────────────── */}
      <div className="bg-secondary border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Microphone</span>
          </div>
          {micOk && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> Working
            </span>
          )}
        </div>

        <div className="h-2 bg-background rounded-full overflow-hidden mb-4">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-75",
              micOk ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${level * 100}%` }}
          />
        </div>

        {testError && (
          <div className="flex items-center gap-2 text-xs text-red-400 mb-3">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {testError}
          </div>
        )}

        {recording ? (
          <p className="text-xs text-muted-foreground animate-pulse">
            Recording {recordSecs}s sample… speak a few words
          </p>
        ) : micOk ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={playRecording}
              leftIcon={<Play className="w-3.5 h-3.5" />}
            >
              Play sample
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void startMicTest()}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Re-record
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void startMicTest()}
            leftIcon={<Mic className="w-3.5 h-3.5" />}
          >
            Record {RECORD_SECONDS}s test sample
          </Button>
        )}
      </div>

      {/* ── System audio info card ──────────────────────────────────────── */}
      <div className="bg-secondary border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-foreground">System audio</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full">
            Optional
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          When enabled, Clarify AI captures sound from your Zoom / Google Meet /
          Teams tab so it can hear the interviewer&apos;s questions automatically.
          You&apos;ll be prompted to share your screen audio when you start a live session.
        </p>
        <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-xl p-3">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-300 leading-relaxed">
            Use Clarify AI for practice and mock sessions only. If you share your
            screen, the overlay remains visible — do not use this tool to conceal
            assistance during real interviews.
          </p>
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-2">
        <Button variant="ghost" size="md" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          disabled={!micOk}
          onClick={handleNext}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
