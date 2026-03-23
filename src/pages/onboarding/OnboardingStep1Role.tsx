// @ts-nocheck
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeRefCode } from "@/lib/referrals";

// ─────────────────────────────────────────────────────────────────
// Step 1 — Name, role, domain
// Also captures ?ref=CODE and stores it in profile.referred_by
// ─────────────────────────────────────────────────────────────────

const ROLES = [
  { value: "software_engineer",    label: "Software Engineer",     icon: "💻" },
  { value: "product_manager",      label: "Product Manager",       icon: "📦" },
  { value: "data_scientist",       label: "Data Scientist",        icon: "📊" },
  { value: "designer",             label: "Designer",              icon: "🎨" },
  { value: "devops_engineer",      label: "DevOps / SRE",          icon: "⚙️" },
  { value: "business_analyst",     label: "Business Analyst",      icon: "📋" },
  { value: "marketing",            label: "Marketing",             icon: "📣" },
  { value: "other",                label: "Other",                 icon: "🧩" },
];

const DOMAINS = [
  "Technology", "Finance", "Healthcare", "E-commerce",
  "Consulting", "Education", "Media", "Other",
];

export default function OnboardingStep1Role() {
  const navigate    = useNavigate();
  const { user, setProfile } = useAuthStore();
  const [searchParams] = useSearchParams();
  const refCode = normalizeRefCode(searchParams.get("ref"));

  const [name,      setName]      = useState("");
  const [role,      setRole]      = useState("");
  const [domain,    setDomain]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const canProceed = name.trim() && role && domain;

  async function handleNext() {
    if (!canProceed || !user) return;
    setLoading(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from("profiles")
      .update({
        full_name:        name.trim(),
        role,
        domain,
        onboarding_step:  2,
        ...(refCode ? { referred_by: refCode } : {}),
      })
      .eq("id", user.id)
      .select()
      .single();

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
    } else {
      setProfile(data);
      navigate("/onboarding/step-2");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <span className="text-foreground font-bold text-lg">Clarify AI</span>
        </div>

        <OnboardingProgress current={1} />

        <h2 className="text-2xl font-bold text-foreground mb-1">
          Tell us about yourself
        </h2>
        <p className="text-muted-foreground text-sm mb-8">
          We use this to personalise every AI answer to your exact role and industry.
        </p>

        {refCode && (
          <div className="mb-6 px-3 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-300 text-center">
            Referral code <span className="font-mono font-bold">{refCode}</span> applied — you'll both earn bonus credits!
          </div>
        )}

        <div className="space-y-6">
          {/* Name */}
          <Input
            label="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Smith"
            autoFocus
          />

          {/* Role */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              What role are you interviewing for?
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                    role === r.value
                      ? "bg-violet-600/20 border-violet-500/50 text-violet-200"
                      : "bg-secondary/50 border-border text-muted-foreground hover:border-border"
                  )}
                >
                  <span className="text-xl">{r.icon}</span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Domain */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Industry / domain</p>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDomain(d)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    domain === d
                      ? "bg-violet-600/20 border-violet-500/40 text-violet-200"
                      : "bg-secondary/50 border-border text-muted-foreground hover:border-border"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <Button
            variant="primary"
            size="md"
            fullWidth
            loading={loading}
            disabled={!canProceed}
            onClick={handleNext}
          >
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
