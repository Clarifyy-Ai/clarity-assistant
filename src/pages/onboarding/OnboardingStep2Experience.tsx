import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Step 2 — Years of experience, target companies, anxiety score
// ─────────────────────────────────────────────────────────────────

const LEVELS = [
  { value: "intern",    label: "Intern",       sub: "0 yrs"     },
  { value: "junior",    label: "Junior",       sub: "0 – 2 yrs" },
  { value: "mid",       label: "Mid-level",    sub: "2 – 5 yrs" },
  { value: "senior",    label: "Senior",       sub: "5 – 8 yrs" },
  { value: "staff",     label: "Staff / Lead", sub: "8+ yrs"    },
  { value: "manager",   label: "Manager",      sub: "Any"       },
];

const ANXIETY_LABELS: Record<number, string> = {
  1: "Cool as ice 🧊",
  2: "Mostly calm 😊",
  3: "A little nervous 😅",
  4: "Quite anxious 😰",
  5: "Interview terror 😱",
};

export default function OnboardingStep2Experience() {
  const navigate  = useNavigate();
  const { user, setProfile } = useAuthStore();

  const [level,     setLevel]     = useState("");
  const [companies, setCompanies] = useState("");
  const [anxiety,   setAnxiety]   = useState(3);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleNext() {
    if (!level || !user) return;
    setLoading(true);

    const targetCompanies = companies
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const { data, error: dbError } = await supabase
      .from("profiles")
      .update({
        experience_level:  level,
        target_companies:  targetCompanies,
        anxiety_score:     anxiety,
        onboarding_step:   3,
      })
      .eq("id", user.id)
      .select()
      .single();

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
    } else {
      setProfile(data);
      navigate("/onboarding/step-3");
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-sm font-bold">CQ</span>
          </div>
        </div>

        <OnboardingProgress current={2} />

        <h2 className="text-2xl font-bold text-white mb-1">Your experience</h2>
        <p className="text-gray-400 text-sm mb-8">
          This calibrates question difficulty and answer depth to your exact level.
        </p>

        <div className="space-y-7">

          {/* Level selector */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">Experience level</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLevel(l.value)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all",
                    level === l.value
                      ? "bg-violet-600/20 border-violet-500/50"
                      : "bg-white/3 border-white/10 hover:border-white/20"
                  )}
                >
                  <span className={cn(
                    "text-sm font-semibold",
                    level === l.value ? "text-violet-200" : "text-gray-300"
                  )}>
                    {l.label}
                  </span>
                  <span className="text-[10px] text-gray-500">{l.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target companies */}
          <Input
            label="Target companies (optional)"
            value={companies}
            onChange={(e) => setCompanies(e.target.value)}
            placeholder="e.g. Google, Stripe, Notion"
            hint="Comma-separated. We'll bias questions toward these companies."
          />

          {/* Anxiety score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-300">
                How do you feel about interviews?
              </p>
              <span className="text-xs text-violet-300 font-medium">
                {ANXIETY_LABELS[anxiety]}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={anxiety}
              onChange={(e) => setAnxiety(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-700 mt-1">
              <span>No anxiety</span>
              <span>Extreme anxiety</span>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => navigate("/onboarding/step-1")}
            >
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
      </div>
    </div>
  );
}
