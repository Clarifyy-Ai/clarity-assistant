// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle, Mic, Volume2, Settings2, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/userStore";
import { useAudioStore } from "@/store/audioStore";
import { supabase } from "@/lib/supabase/client";
import { enumerateAudioDevices } from "@/lib/audio/audioCapture";
import type { AudioDevice } from "@/types/audio.types";
import { toast } from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ─────────────────────────────────────────────────────────────────
// SettingsAudio — mic, language, filler config
// ─────────────────────────────────────────────────────────────────

const STT_LANGUAGES = [
  { code: "en-US", label: "English (US)"    },
  { code: "en-GB", label: "English (UK)"    },
  { code: "en-IN", label: "English (India)" },
  { code: "en-AU", label: "English (AU)"    },
  { code: "fr-FR", label: "French"          },
  { code: "de-DE", label: "German"          },
  { code: "es-ES", label: "Spanish"         },
  { code: "pt-BR", label: "Portuguese (BR)" },
];

const FILLER_WORDS_DEFAULT = ["um", "uh", "like", "you know", "basically", "literally", "so", "right"];

function vadSensitivityToNoiseFloor(pct: number): number {
  return 0.01 + (pct / 100) * 0.19;
}

function noiseFloorToVadSensitivity(floor: number): number {
  return Math.round(Math.min(100, Math.max(0, ((floor - 0.01) / 0.19) * 100)));
}

export default function SettingsAudio() {
  const { user, profile } = useAuthStore();
  const vadConfig = useAudioStore((s) => s.vad_config);
  const setVADConfig = useAudioStore((s) => s.setVADConfig);

  const uiPrefs = (profile?.ui_preferences ?? {}) as Record<string, unknown>;
  const savedVadFloor =
    typeof uiPrefs.vad_noise_floor === "number"
      ? uiPrefs.vad_noise_floor
      : vadConfig.noise_floor;

  const [language,    setLanguage]    = useState(profile?.stt_language ?? "en-US");
  const [fillerWords, setFillerWords] = useState<string[]>(
    profile?.custom_filler_words ?? FILLER_WORDS_DEFAULT
  );
  const [newFiller,   setNewFiller]   = useState("");
  const [micLevel,    setMicLevel]    = useState(0);
  const [testing,     setTesting]     = useState(false);
  const [recording,   setRecording]   = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playingBack, setPlayingBack] = useState(false);
  const [autoGain,    setAutoGain]    = useState(profile?.auto_gain ?? true);
  const [noiseSup,    setNoiseSup]    = useState(profile?.noise_suppression ?? true);
  const [micDevices,  setMicDevices]    = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic]   = useState(
    profile?.audio_input_device ?? profile?.mic_device_id ?? "",
  );
  const [vadSensitivity, setVadSensitivity] = useState(noiseFloorToVadSensitivity(savedVadFloor));
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  const animRef = useRef<number | null>(null);
  const analRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  const stopMicTest = useCallback(() => {
    setTesting(false);
    setRecording(false);
    if (animRef.current != null) cancelAnimationFrame(animRef.current);
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevel(0);
  }, []);

  useEffect(() => () => {
    stopMicTest();
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackRef.current?.pause();
  }, [stopMicTest, playbackUrl]);

  useEffect(() => {
    setVADConfig({ noise_floor: vadSensitivityToNoiseFloor(vadSensitivity) });
  }, [vadSensitivity, setVADConfig]);

  async function refreshMicDevices() {
    try {
      const devices = await enumerateAudioDevices();
      setMicDevices(devices);
      if (!selectedMic && devices.length > 0) {
        const defaultDevice = devices.find((d) => d.isDefault) ?? devices[0];
        setSelectedMic(defaultDevice.deviceId);
      }
    } catch {
      toast.error("Could not list microphones — allow mic access and try again.");
    }
  }

  useEffect(() => {
    void refreshMicDevices();
  }, []);

  async function startMicTest() {
    if (playbackUrl) {
      URL.revokeObjectURL(playbackUrl);
      setPlaybackUrl(null);
    }
    setTesting(true);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.min(100, avg * 2));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied or unavailable.");
      stopMicTest();
    }
  }

  function handlePlayRecording() {
    if (!playbackUrl) return;
    if (playingBack) {
      playbackRef.current?.pause();
      setPlayingBack(false);
      return;
    }
    const audio = new Audio(playbackUrl);
    playbackRef.current = audio;
    audio.onended = () => setPlayingBack(false);
    void audio.play().then(() => setPlayingBack(true)).catch(() => {
      toast.error("Could not play recording.");
    });
  }

  // ── Filler word management ─────────────────────────────────

  function addFiller() {
    const w = newFiller.trim().toLowerCase();
    if (!w || fillerWords.includes(w)) return;
    setFillerWords((p) => [...p, w]);
    setNewFiller("");
  }

  function removeFiller(w: string) {
    setFillerWords((p) => p.filter((f) => f !== w));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const noiseFloor = vadSensitivityToNoiseFloor(vadSensitivity);
    const mergedUiPrefs = {
      ...(typeof profile?.ui_preferences === "object" && profile?.ui_preferences
        ? profile.ui_preferences
        : {}),
      vad_noise_floor: noiseFloor,
    };
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          stt_language:        language,
          custom_filler_words: fillerWords,
          auto_gain:           autoGain,
          noise_suppression:   noiseSup,
          audio_input_device:  selectedMic || null,
          ui_preferences:      mergedUiPrefs,
        })
        .eq("id", user.id);
      if (error) throw error;
      setVADConfig({ noise_floor: noiseFloor });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err?.message ?? "Failed to save audio settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell title="Audio & Speech">
      <Accordion type="multiple" defaultValue={["microphone", "language"]} className="space-y-3">
        <AccordionItem value="microphone" className="rounded-2xl border border-border bg-card px-5 border-b-0">
          <AccordionTrigger className="text-sm font-semibold hover:no-underline py-4">
            <span className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-primary" />
              Microphone
            </span>
          </AccordionTrigger>
          <AccordionContent>
        <div className="space-y-4 pb-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Input device</label>
            {micDevices.length > 0 ? (
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="w-full bg-background border border-input text-foreground rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ring"
              >
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground flex-1">Allow microphone access to list devices.</p>
                <Button variant="secondary" size="xs" onClick={() => void refreshMicDevices()}>
                  Refresh
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Auto gain control</span>
            <Switch checked={autoGain} onCheckedChange={setAutoGain} aria-label="Auto gain control" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Noise suppression</span>
            <Switch checked={noiseSup} onCheckedChange={setNoiseSup} aria-label="Noise suppression" />
          </div>

          {/* Mic level meter + record/playback */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Input level</span>
              <div className="flex items-center gap-1.5">
                {playbackUrl && !testing && (
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={handlePlayRecording}
                    leftIcon={playingBack ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  >
                    {playingBack ? "Stop" : "Play back"}
                  </Button>
                )}
                <Button
                  variant={testing ? "danger" : "secondary"}
                  size="xs"
                  onClick={testing ? stopMicTest : startMicTest}
                  leftIcon={testing ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                >
                  {testing ? (recording ? "Stop recording" : "Stop") : "Test mic"}
                </Button>
              </div>
            </div>
            <ProgressBar
              value={micLevel}
              max={100}
              color={micLevel > 80 ? "red" : micLevel > 30 ? "emerald" : "amber"}
              size="md"
            />
            {testing && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Speak into your mic — recording for playback when you stop
              </p>
            )}
            {playbackUrl && !testing && (
              <p className="text-[10px] text-emerald-400/80 mt-1">Recording ready — use Play back to hear yourself</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">VAD sensitivity</span>
              <Badge variant="secondary" size="sm">{vadSensitivity}%</Badge>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={vadSensitivity}
              onChange={(e) => setVadSensitivity(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="VAD sensitivity"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Higher = picks up quieter speech; lower = ignores more background noise
            </p>
          </div>
        </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="language" className="rounded-2xl border border-border bg-card px-5 border-b-0">
          <AccordionTrigger className="text-sm font-semibold hover:no-underline py-4">
            <span className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-400" />
              Speech recognition language
            </span>
          </AccordionTrigger>
          <AccordionContent>
        <div className="grid grid-cols-2 gap-2 pb-2">
          {STT_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={cn(
                "px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-all",
                language === lang.code
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="fillers" className="rounded-2xl border border-border bg-card px-5 border-b-0">
          <AccordionTrigger className="text-sm font-semibold hover:no-underline py-4">
            <span className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-amber-400" />
              Advanced: filler word tracking
            </span>
          </AccordionTrigger>
          <AccordionContent>
        <div className="pb-2">
        <div className="flex flex-wrap gap-2 mb-3">
          {fillerWords.map((w) => (
            <button
              key={w}
              onClick={() => removeFiller(w)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all"
            >
              "{w}"
              <span className="text-[10px] opacity-60">×</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newFiller}
            onChange={(e) => setNewFiller(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFiller()}
            placeholder="Add a filler word…"
            className="flex-1 bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            aria-label="Add a filler word"
          />
          <Button variant="secondary" size="sm" onClick={addFiller}>
            Add
          </Button>
        </div>
        </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        loading={saving}
        onClick={handleSave}
        leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      >
        {saved ? "Saved!" : "Save audio settings"}
      </Button>
    </SettingsPageShell>
  );
}
