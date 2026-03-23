// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle, Mic, Volume2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

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

export default function SettingsAudio() {
  const { user, profile } = useAuthStore();

  const [language,    setLanguage]    = useState(profile?.stt_language ?? "en-US");
  const [fillerWords, setFillerWords] = useState<string[]>(
    profile?.custom_filler_words ?? FILLER_WORDS_DEFAULT
  );
  const [newFiller,   setNewFiller]   = useState("");
  const [micLevel,    setMicLevel]    = useState(0);
  const [testing,     setTesting]     = useState(false);
  const [autoGain,    setAutoGain]    = useState(profile?.auto_gain ?? true);
  const [noiseSup,    setNoiseSup]    = useState(profile?.noise_suppression ?? true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  const animRef = useRef<number | null>(null);
  const analRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Mic test ─────────────────────────────────────────────────

  async function startMicTest() {
    setTesting(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx     = new AudioContext();
    const source  = ctx.createMediaStreamSource(stream);
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
  }

  function stopMicTest() {
    setTesting(false);
    cancelAnimationFrame(animRef.current!);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setMicLevel(0);
  }

  useEffect(() => () => { stopMicTest(); }, []);

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
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          stt_language:        language,
          custom_filler_words: fillerWords,
          auto_gain:           autoGain,
          noise_suppression:   noiseSup,
        })
        .eq("id", user.id);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err?.message ?? "Failed to save audio settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Audio & Speech</h2>

      {/* Mic test */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Mic className="w-4 h-4 text-violet-400" />
          Microphone
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Auto gain control</span>
            <Toggle checked={autoGain} onChange={() => setAutoGain((p) => !p)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Noise suppression</span>
            <Toggle checked={noiseSup} onChange={() => setNoiseSup((p) => !p)} />
          </div>

          {/* Mic level meter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Input level</span>
              <Button
                variant={testing ? "danger" : "secondary"}
                size="xs"
                onClick={testing ? stopMicTest : startMicTest}
                leftIcon={<Mic className="w-3 h-3" />}
              >
                {testing ? "Stop" : "Test mic"}
              </Button>
            </div>
            <ProgressBar
              value={micLevel}
              max={100}
              color={micLevel > 80 ? "red" : micLevel > 30 ? "emerald" : "amber"}
              size="md"
            />
            {testing && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Speak into your mic — the bar should rise
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* STT language */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-blue-400" />
          Speech recognition language
        </h3>
        <div className="grid grid-cols-2 gap-2">
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
      </Card>

      {/* Filler words */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-amber-400" />
          Filler word tracking
        </h3>
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
          />
          <Button variant="secondary" size="sm" onClick={addFiller}>
            Add
          </Button>
        </div>
      </Card>

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        loading={saving}
        onClick={handleSave}
        leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      >
        {saved ? "Saved!" : "Save audio settings"}
      </Button>
    </div>
  );
}
