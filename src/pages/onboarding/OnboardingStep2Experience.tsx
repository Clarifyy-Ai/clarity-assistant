// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep2Experience.tsx — Step 2: Experience level, target companies,
// interview anxiety self-rating.
// Rendered inside OnboardingIndex (no outer page wrapper needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVELS = [
  { value: "intern",  label: "Intern",       sub: "0 yrs"     },
  { value: "junior",  label: "Junior",       sub: "0 – 2 yrs" },
  { value: "mid",     label: "Mid-level",    sub: "2 – 5 yrs" },
  { value: "senior",  label: "Senior",       sub: "5 – 8 yrs" },
  { value: "staff",   label: "Staff / Lead", sub: "8+ yrs"    },
  { value: "manager", label: "Manager",      sub: "Any"       },
] as const;

const ANXIETY_LABELS: Record<number, string> = {
  1: "Cool as ice 🧊",
  2: "Mostly calm 😊",
  3: "A little nervous 😅",
  4: "Quite anxious 😰",
  5: "Interview terror 😱",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingStep2Experience({ onNext, onBack }: StepProps) {
  const { user, profile, setProfile } = useAuthStore();

  const [level,     setLevel]     = useState("");
  const [companies, setCompanies] = useState("");
  const [anxiety,   setAnxiety]   = useState(3);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleNext() {
    if (!level || !user) return;
    setLoading(true);
    setError(null);

    const targetCompanies = companies
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    // Map UI level → numeric experience_years (schema column)
    const yearsMap: Record<string, number> = {
      intern: 0, junior: 1, mid: 3, senior: 6, staff: 10, manager: 8,
    };

    const existingPrefs =
      profile?.notification_prefs &&
      typeof profile.notification_prefs === "object" &&
      !Array.isArray(profile.notification_prefs)
        ? (profile.notification_prefs as Record<string, unknown>)
        : {};

    const { data, error: dbError } = await supabase
      .from("profiles")
      .update({
        // Keep role_type from Step 1 (target role). Experience level is stored
        // as experience_years + notification_prefs.experience_level only.
        experience_years:  yearsMap[level] ?? 0,
        target_companies:  targetCompanies,
        notification_prefs: {
          ...existingPrefs,
          interview_anxiety: anxiety,
          experience_level: level,
        },
        onboarding_step:   3,
      })
      .eq("id", user.id)
      .select()
      .maybeSingle();

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    // Cast: Supabase row type vs local ProfileRow differ on computed columns
    if (data) setProfile(data as unknown as ProfileRow);
    onNext({ currentLevel: level, targetCompanies });
  }

  return (
    <div className="max-w-lg mx-auto space-y-7">

      {/* ── Heading ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Your experience
        </h2>
        <p className="text-muted-foreground text-sm">
          This calibrates question difficulty and answer depth to your exact level.
          Your target role from the previous step stays unchanged.
        </p>
      </div>

      {/* ── Level selector ──────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Experience level
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLevel(l.value)}
              className={cn(
                "flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all",
                level === l.value
                  ? "bg-primary/20 border-primary/50"
                  : "bg-secondary/50 border-border hover:border-primary/30",
              )}
            >
              <span className={cn(
                "text-sm font-semibold",
                level === l.value ? "text-primary" : "text-muted-foreground",
              )}>
                {l.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{l.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Target companies ────────────────────────────────────────────── */}
      <Input
        label="Target companies (optional)"
        value={companies}
        onChange={(e) => setCompanies(e.target.value)}
        placeholder="e.g. Google, Stripe, Notion"
        hint="Comma-separated. We'll bias questions toward these companies."
      />

      {/* ── Anxiety slider ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">
            How do you feel about interviews?
          </p>
          <span className="text-xs text-primary font-medium">
            {ANXIETY_LABELS[anxiety]}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          value={anxiety}
          onChange={(e) => setAnxiety(Number(e.target.value))}
          className="w-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>No anxiety</span>
          <span>Extreme anxiety</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Button variant="ghost" size="md" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          disabled={!level}
          onClick={handleNext}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
