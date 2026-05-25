// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep3Preferences.tsx — Step 3: AI model, hint style, coach tone.
// Rendered inside OnboardingIndex (no outer page wrapper needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";

// Mirrors the preferred_model column enum defined in Supabase types
type PreferredModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude-3-5-sonnet"
  | "claude-3-haiku"
  | "gemini-1-5-pro"
  | "gemini-1-5-flash";

// ─── Constants ───────────────────────────────────────────────────────────────

const HINT_STYLES = [
  { value: "full_answer",  label: "Full Answer",    sub: "Complete 2–3 paragraph response", icon: "📝" },
  { value: "short_hints",  label: "Short Hints",    sub: "2–3 talking point bullets",       icon: "💡" },
  { value: "keywords",     label: "Keywords Only",  sub: "Key terms to build from",         icon: "🔑" },
] as const;

const COACH_TONES = [
  { value: "encouraging", label: "Encouraging", icon: "🤗", sub: "Warm, supportive"        },
  { value: "direct",      label: "Direct",      icon: "🎯", sub: "Honest, concise"         },
  { value: "analytical",  label: "Analytical",  icon: "🧠", sub: "Detailed feedback"       },
  { value: "socratic",    label: "Socratic",    icon: "❓", sub: "Guides with questions"   },
] as const;

// FIX: model values must match the ProfileRow preferred_model enum
const MODELS = [
  { value: "gemini-1-5-flash",   label: "Gemini Flash", badge: "Fastest ⚡",    free: true  },
  { value: "gemini-1-5-pro",     label: "Gemini Pro",   badge: "Balanced",      free: false },
  { value: "gpt-4o",             label: "GPT-4o",       badge: "Deep answers",  free: false },
  { value: "claude-3-5-sonnet",  label: "Claude 3.5",   badge: "System design", free: false },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingStep3Preferences({ onNext, onBack, onSkip }: StepProps) {
  const { user, setProfile, planId } = useAuthStore();

  // FIX: was `profile?.plan !== "free"` — authStore exposes `planId` directly
  const isPro = planId !== "free";

  const [hintStyle, setHintStyle] = useState<string>("short_hints");
  const [coachTone, setCoachTone] = useState<string>("encouraging");
  const [model,     setModel]     = useState<PreferredModel>("gemini-1-5-flash");
  const [loading,   setLoading]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleNext() {
    if (!user) return;
    setLoading(true);
    setSaveError(null);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        response_style:  hintStyle,
        coach_tone:      coachTone,
        preferred_model: model,
        onboarding_step: 4,
      } as any)
      .eq("id", user.id)
      .select()
      .maybeSingle();

    setLoading(false);
    if (error) {
      const message = error.message || "Failed to save preferences";
      setSaveError(message);
      toast.error(message);
      return;
    }

    if (data) setProfile(data as unknown as ProfileRow);
    onNext({ preferredModel: model });
  }

  return (
    <div className="max-w-lg mx-auto space-y-7">

      {/* ── Heading ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Your preferences
        </h2>
        <p className="text-muted-foreground text-sm">
          Customise how Clarify AI coaches you. You can change these any time in Settings.
        </p>
      </div>

      {/* ── Hint style ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          How much help do you want during live sessions?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {HINT_STYLES.map((h) => (
            <button
              key={h.value}
              type="button"
              onClick={() => setHintStyle(h.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                hintStyle === h.value
                  ? "bg-violet-600/20 border-violet-500/50"
                  : "bg-secondary/50 border-border hover:border-primary/30",
              )}
            >
              <span className="text-xl">{h.icon}</span>
              <span className={cn(
                "text-xs font-semibold",
                hintStyle === h.value ? "text-violet-200" : "text-muted-foreground",
              )}>
                {h.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{h.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Coach tone ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          AI coach tone
        </p>
        <div className="grid grid-cols-2 gap-2">
          {COACH_TONES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCoachTone(t.value)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                coachTone === t.value
                  ? "bg-violet-600/20 border-violet-500/50"
                  : "bg-secondary/50 border-border hover:border-primary/30",
              )}
            >
              <span className="text-xl">{t.icon}</span>
              <div>
                <p className={cn(
                  "text-xs font-semibold",
                  coachTone === t.value ? "text-violet-200" : "text-muted-foreground",
                )}>
                  {t.label}
                </p>
                <p className="text-[10px] text-muted-foreground">{t.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Model preference ────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Preferred AI model
        </p>
        <div className="space-y-2">
          {MODELS.map((m) => {
            const locked = !m.free && !isPro;
            return (
              <button
                key={m.value}
                type="button"
                disabled={locked}
                onClick={() => { if (!locked) setModel(m.value as PreferredModel); }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  model === m.value && !locked
                    ? "bg-violet-600/20 border-violet-500/50"
                    : "bg-secondary/50 border-border",
                  locked
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:border-primary/30 cursor-pointer",
                )}
              >
                <div className="flex-1">
                  <span className={cn(
                    "text-sm font-semibold",
                    model === m.value && !locked ? "text-violet-200" : "text-muted-foreground",
                  )}>
                    {m.label}
                  </span>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  m.free
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-violet-500/10 border-violet-500/20 text-violet-400",
                )}>
                  {locked ? "🔒 Pro" : m.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Button variant="ghost" size="md" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={onSkip}
          className="text-muted-foreground"
        >
          Skip
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          onClick={handleNext}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
