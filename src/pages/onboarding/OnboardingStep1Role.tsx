// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep1Role.tsx — Step 1: Name, target role, industry domain.
// Rendered inside OnboardingIndex (no outer page wrapper needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  Code2,
  Package,
  BarChart3,
  Palette,
  Cog,
  ClipboardList,
  Megaphone,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import { normalizeRefCode } from "@/lib/referrals";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "software_engineer", label: "Software Engineer", icon: Code2 },
  { value: "product_manager",   label: "Product Manager",   icon: Package },
  { value: "data_scientist",    label: "Data Scientist",    icon: BarChart3 },
  { value: "designer",          label: "Designer",          icon: Palette },
  { value: "devops_engineer",   label: "DevOps / SRE",      icon: Cog },
  { value: "business_analyst",  label: "Business Analyst",  icon: ClipboardList },
  { value: "marketing",         label: "Marketing",         icon: Megaphone },
  { value: "other",             label: "Other",             icon: Puzzle },
];

const DOMAINS = [
  "Technology", "Finance", "Healthcare", "E-commerce",
  "Consulting", "Education", "Media", "Other",
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingStep1Role({ onNext }: StepProps) {
  const { user, setProfile } = useAuthStore();
  const [searchParams]       = useSearchParams();

  // Show referral badge if ?ref= is present in the URL
  const refCode = normalizeRefCode(searchParams.get("ref"));

  const [name,        setName]        = useState("");
  const [role,        setRole]        = useState("");
  const [customRole,  setCustomRole]  = useState("");
  const [domain,      setDomain]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const canProceed = Boolean(
    name.trim()
    && role
    && domain
    && (role !== "other" || customRole.trim()),
  );

  async function handleNext() {
    if (!canProceed || !user) return;
    setLoading(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from("profiles")
      .update({
        full_name:       name.trim(),
        role_type:       role,
        target_role:     role === "other" ? customRole.trim().slice(0, 100) : role,
        domain,
        onboarding_step: 2,
        ...(refCode ? { referred_by: refCode } : {}),
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
    onNext({
      targetRole: role === "other" ? customRole.trim().slice(0, 100) : role,
      targetCompanies: [],
    });
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* ── Heading ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Tell us about yourself
        </h2>
        <p className="text-muted-foreground text-sm">
          We use this to personalise every AI answer to your exact role and industry.
        </p>
      </div>

      {/* ── Referral badge ──────────────────────────────────────────────── */}
      {refCode && (
        <div className="px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary text-center">
          Referral code{" "}
          <span className="font-mono font-bold">{refCode}</span>{" "}
          applied — you&apos;ll both earn bonus credits!
        </div>
      )}

      {/* ── Name ────────────────────────────────────────────────────────── */}
      <Input
        label="Your full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Jane Smith"
        autoFocus
      />

      {/* ── Role grid ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          What role are you interviewing for?
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                role === r.value
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30",
              )}
            >
              <Icon className="h-5 w-5" />
              {r.label}
            </button>
            );
          })}
        </div>
        {role === "other" && (
          <Input
            label="Describe your role"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value.slice(0, 100))}
            placeholder="e.g. UX Research Lead"
            maxLength={100}
            hint={`${customRole.length}/100 characters`}
          />
        )}
      </div>

      {/* ── Domain chips ────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Industry / domain
        </p>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomain(d)}
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                domain === d
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

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
  );
}
