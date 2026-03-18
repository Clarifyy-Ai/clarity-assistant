// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Step 3 — AI model preference, hint style, coach tone
// ─────────────────────────────────────────────────────────────────

const HINT_STYLES = [
  {
    value: "full_answer",
    label: "Full Answer",
    sub:   "Complete 2–3 paragraph response",
    icon:  "📝",
  },
  {
    value: "short_hints",
    label: "Short Hints",
    sub:   "2–3 talking point bullets",
    icon:  "💡",
  },
  {
    value: "keywords",
    label: "Keywords Only",
    sub:   "Key terms to build from",
    icon:  "🔑",
  },
];

const COACH_TONES = [
  { value: "encouraging", label: "Encouraging", icon: "🤗", sub: "Warm, supportive" },
  { value: "direct",      label: "Direct",      icon: "🎯", sub: "Honest, concise" },
  { value: "analytical",  label: "Analytical",  icon: "🧠", sub: "Detailed feedback" },
  { value: "socratic",    label: "Socratic",    icon: "❓", sub: "Guides with questions" },
];

const MODELS = [
  { value: "gemini-flash", label: "Gemini Flash",  badge: "Fastest ⚡",  free: true  },
  { value: "gemini-pro",   label: "Gemini Pro",    badge: "Balanced",    free: false },
  { value: "gpt-4o",       label: "GPT-4o",        badge: "Deep answers", free: false },
  { value: "claude-3-5",   label: "Claude 3.5",    badge: "System design",free: false },
];

export default function OnboardingStep3Preferences() {
  const navigate  = useNavigate();
  const { user, profile, setProfile } = useAuthStore();

  const [hintStyle,  setHintStyle]  = useState("short_hints");
  const [coachTone,  setCoachTone]  = useState("encouraging");
  const [model,      setModel]      = useState("gemini-flash");
  const [loading,    setLoading]    = useState(false);

  const isPro = profile?.plan !== "free";

  async function handleNext() {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        hint_style:       hintStyle,
        coach_tone:       coachTone,
        preferred_model:  model,
        onboarding_step:  4,
      })
      .eq("id", user.id)
      .select()
      .single();

    setLoading(false);
    if (!error) { setProfile(data); navigate("/onboarding/step-4"); }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center mb-8">
          <span className="text-white text-sm font-bold">CQ</span>
        </div>

        <OnboardingProgress current={3} />

        <h2 className="text-2xl font-bold text-white mb-1">Your preferences</h2>
        <p className="text-gray-400 text-sm mb-8">
          Customise how ConfideQ coaches you. You can change these any time in settings.
        </p>

        <div className="space-y-7">

          {/* Hint style */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">
              How much help do you want during live sessions?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {HINT_STYLES.map((h) => (
                <button
                  key={h.value}
                  onClick={() => setHintStyle(h.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                    hintStyle === h.value
                      ? "bg-violet-600/20 border-violet-500/50"
                      : "bg-white/3 border-white/10 hover:border-white/20"
                  )}
                >
                  <span className="text-xl">{h.icon}</span>
                  <span className={cn(
                    "text-xs font-semibold",
                    hintStyle === h.value ? "text-violet-200" : "text-gray-300"
                  )}>
                    {h.label}
                  </span>
                  <span className="text-[10px] text-gray-500">{h.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Coach tone */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">AI coach tone</p>
            <div className="grid grid-cols-2 gap-2">
              {COACH_TONES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setCoachTone(t.value)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                    coachTone === t.value
                      ? "bg-violet-600/20 border-violet-500/50"
                      : "bg-white/3 border-white/10 hover:border-white/20"
                  )}
                >
                  <span className="text-xl">{t.icon}</span>
                  <div>
                    <p className={cn(
                      "text-xs font-semibold",
                      coachTone === t.value ? "text-violet-200" : "text-gray-300"
                    )}>
                      {t.label}
                    </p>
                    <p className="text-[10px] text-gray-500">{t.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model preference */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">
              Preferred AI model
            </p>
            <div className="space-y-2">
              {MODELS.map((m) => {
                const locked = !m.free && !isPro;
                return (
                  <button
                    key={m.value}
                    disabled={locked}
                    onClick={() => !locked && setModel(m.value)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                      model === m.value && !locked
                        ? "bg-violet-600/20 border-violet-500/50"
                        : "bg-white/3 border-white/10",
                      locked
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:border-white/20 cursor-pointer"
                    )}
                  >
                    <div className="flex-1">
                      <span className={cn(
                        "text-sm font-semibold",
                        model === m.value ? "text-violet-200" : "text-gray-300"
                      )}>
                        {m.label}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border",
                      m.free
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-violet-500/10 border-violet-500/20 text-violet-400"
                    )}>
                      {locked ? "🔒 Pro" : m.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" size="md" onClick={() => navigate("/onboarding/step-2")}>
              ← Back
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
      </div>
    </div>
  );
}
