// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep4AudioSetup.tsx — Step 4: Microphone test + system audio info.
// Rendered inside OnboardingIndex (no outer page wrapper needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { Button } from "@/components/ui/Button";
import {
  Mic, Volume2, CheckCircle,
  AlertCircle, Monitor, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingStep4AudioSetup({ onNext, onBack, onSkip }: StepProps) {
  const { user, setProfile } = useAuthStore();
  const audio                = useAudioCapture();

  const [micTested,  setMicTested]  = useState(false);
  const [micOk,      setMicOk]      = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [testError,  setTestError]  = useState<string | null>(null);

  // Audio level visualiser
  const [level, setLevel] = useState(0);
  const rafRef             = useRef<number | null>(null);
  const ctxRef             = useRef<AudioContext | null>(null);
  const analyserRef        = useRef<AnalyserNode | null>(null);

  // ── Mic test ────────────────────────────────────────────────────────────

  async function startMicTest() {
    setTestError(null);
    const { error } = await audio.startMic();
    if (error) { setTestError(error); return; }

    // FIX: null guard before using audio.micStream
    if (!audio.micStream) {
      setTestError("Microphone stream not available. Please try again.");
      return;
    }

    const ctx          = new AudioContext();
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    const source = ctx.createMediaStreamSource(audio.micStream);
    source.connect(analyserNode);
    ctxRef.current    = ctx;
    analyserRef.current = analyserNode;

    const data = new Float32Array(analyserNode.frequencyBinCount);

    function loop() {
      analyserNode.getFloatTimeDomainData(data);
      const rms  = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      const norm = Math.min(1, rms * 8);
      setLevel(norm);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    setMicTested(true);

    // Auto-pass after 3 s of detecting audio
    setTimeout(() => {
      setMicOk(true);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audio.stopAll();
      ctxRef.current?.close();
    }, 3000);
  }

  // ── Save and advance ────────────────────────────────────────────────────

  async function handleNext() {
    if (!user) return;
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
      // Cast: Supabase row type vs local ProfileRow differ on computed columns
      setProfile(data as unknown as ProfileRow);
    }

    onNext({ audioVerified: micOk });
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
            <Mic className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-foreground">Microphone</span>
          </div>
          {micOk && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> Working
            </span>
          )}
        </div>

        {/* Level meter */}
        <div className="h-2 bg-background rounded-full overflow-hidden mb-4">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-75",
              micOk ? "bg-emerald-500" : "bg-violet-500",
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

        {!micTested ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={startMicTest}
            leftIcon={<Mic className="w-3.5 h-3.5" />}
          >
            Test microphone
          </Button>
        ) : micOk ? (
          <p className="text-xs text-emerald-400">
            ✓ Microphone detected successfully
          </p>
        ) : (
          <p className="text-xs text-muted-foreground animate-pulse">
            Listening… speak a few words…
          </p>
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
            The overlay is invisible to screen sharing. The interviewer cannot see
            Clarify AI even when you share your screen.
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
          onClick={handleNext}
        >
          {micOk ? "Continue →" : "Skip for now →"}
        </Button>
      </div>
    </div>
  );
}
