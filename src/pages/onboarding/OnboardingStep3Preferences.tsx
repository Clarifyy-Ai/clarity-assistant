// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep3Preferences.tsx — Step 3: AI model, hint style, coach tone.
// Rendered inside OnboardingIndex (no outer page wrapper needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useOverlayStore } from "@/store/overlayStore";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";
import type { PreferredAIModel } from "@/types/user.types";
import { MODEL_OPTIONS, normalizePreferredModel } from "@/lib/ai/modelOptions";
import { normalizeToDisplayTier } from "@/lib/constants/pricing";

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

const INTERVIEW_STYLES = [
  { value: "behavioral", label: "Behavioral", icon: "💬", sub: "STAR stories & soft skills" },
  { value: "technical",  label: "Technical",  icon: "💻", sub: "Role-specific depth"        },
  { value: "case_study", label: "Case",       icon: "📊", sub: "Analytical & consulting"    },
  { value: "mixed",      label: "Mixed",      icon: "🔀", sub: "Blend of question styles"   },
] as const;

const PREP_BY_STYLE: Record<string, string> = {
  behavioral: "Prep Lab → STAR Builder",
  technical:  "Prep Lab → Coding Hints",
  case_study: "Prep Lab → System Design",
  mixed:      "Mock Interview + Prep Lab",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingStep3Preferences({ onNext, onBack, onSkip }: StepProps) {
  const { user, setProfile, planId, profile } = useAuthStore();

  const isPro = normalizeToDisplayTier(planId) !== "free";

  const existingStyles = (() => {
    const prefs = profile?.notification_prefs as { interview_styles?: string[] } | null;
    return Array.isArray(prefs?.interview_styles) ? prefs.interview_styles : ["behavioral"];
  })();

  const [hintStyle, setHintStyle] = useState<string>("short_hints");
  const [coachTone, setCoachTone] = useState<string>("encouraging");
  const [model,     setModel]     = useState<PreferredAIModel>("gemini-flash");
  const [styles,    setStyles]    = useState<string[]>(existingStyles);
  const [loading,   setLoading]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toggleStyle(value: string) {
    setStyles((prev) => {
      if (prev.includes(value)) {
        return prev.length > 1 ? prev.filter((s) => s !== value) : prev;
      }
      return [...prev, value];
    });
  }

  async function handleNext() {
    if (!user || styles.length === 0) return;
    setLoading(true);
    setSaveError(null);

    const existingPrefs =
      (profile?.notification_prefs as Record<string, unknown> | null) ?? {};

    const { data, error } = await supabase
      .from("profiles")
      .update({
        response_style:  hintStyle,
        coach_tone:      coachTone,
        preferred_model: model,
        notification_prefs: { ...existingPrefs, interview_styles: styles },
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

    if (data) {
      setProfile(data as unknown as ProfileRow);
      useOverlayStore.getState().setActiveModel(normalizePreferredModel(model));
    }
    onNext({ preferredModel: model, interviewTypes: styles });
  }

  const prepRecommendations = styles
    .map((s) => PREP_BY_STYLE[s])
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

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

      {/* ── Interview style preferences ───────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Interview styles you want to practice
        </p>
        <div className="grid grid-cols-2 gap-2">
          {INTERVIEW_STYLES.map((s) => {
            const selected = styles.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleStyle(s.value)}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                  selected
                    ? "bg-primary/20 border-primary/50"
                    : "bg-secondary/50 border-border hover:border-primary/30",
                )}
              >
                <span className="text-xl">{s.icon}</span>
                <div>
                  <p className={cn(
                    "text-xs font-semibold",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
        {prepRecommendations.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Recommended: {prepRecommendations.join(" · ")}
          </p>
        )}
      </div>

      {/* ── Hint style ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          How much help do you want during live sessions?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {HINT_STYLES.map((h) => (
            <button
              key={h.value}
              type="button"
              onClick={() => setHintStyle(h.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                hintStyle === h.value
                  ? "bg-primary/20 border-primary/50"
                  : "bg-secondary/50 border-border hover:border-primary/30",
              )}
            >
              <span className="text-xl">{h.icon}</span>
              <span className={cn(
                "text-xs font-semibold",
                hintStyle === h.value ? "text-primary" : "text-muted-foreground",
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
                  ? "bg-primary/20 border-primary/50"
                  : "bg-secondary/50 border-border hover:border-primary/30",
              )}
            >
              <span className="text-xl">{t.icon}</span>
              <div>
                <p className={cn(
                  "text-xs font-semibold",
                  coachTone === t.value ? "text-primary" : "text-muted-foreground",
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
          {MODEL_OPTIONS.map((m) => {
            const locked = !m.free && !isPro;
            return (
              <button
                key={m.value}
                type="button"
                disabled={locked}
                onClick={() => { if (!locked) setModel(m.value); }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  model === m.value && !locked
                    ? "bg-primary/20 border-primary/50"
                    : "bg-secondary/50 border-border",
                  locked
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:border-primary/30 cursor-pointer",
                )}
              >
                <div className="flex-1">
                  <span className={cn(
                    "text-sm font-semibold",
                    model === m.value && !locked ? "text-primary" : "text-muted-foreground",
                  )}>
                    {m.label}
                  </span>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  m.free
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-primary/10 border-primary/20 text-primary",
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
          disabled={styles.length === 0}
          onClick={handleNext}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
