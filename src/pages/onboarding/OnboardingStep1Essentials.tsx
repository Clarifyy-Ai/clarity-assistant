// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep1Essentials — Step 1: Name, target role, experience level.
// Combines former Role + Experience steps into one ~60s screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Code2,
  Package,
  BarChart3,
  Palette,
  Cog,
  ClipboardList,
  Megaphone,
  Puzzle,
  Info,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { normalizeRefCode } from "@/lib/referrals";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";

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

const LEVELS = [
  { value: "intern",  label: "Intern",       sub: "0 yrs"     },
  { value: "junior",  label: "Junior",       sub: "0 – 2 yrs" },
  { value: "mid",     label: "Mid-level",    sub: "2 – 5 yrs" },
  { value: "senior",  label: "Senior",       sub: "5 – 8 yrs" },
  { value: "staff",   label: "Staff / Lead", sub: "8+ yrs"    },
  { value: "manager", label: "Manager",      sub: "Any"       },
] as const;

const YEARS_MAP: Record<string, number> = {
  intern: 0, junior: 1, mid: 3, senior: 6, staff: 10, manager: 8,
};

export default function OnboardingStep1Essentials({ data, onNext }: StepProps) {
  const { user, profile, setProfile } = useAuthStore();
  const [searchParams] = useSearchParams();
  const refCode = normalizeRefCode(searchParams.get("ref"));

  const [name,       setName]       = useState(profile?.full_name ?? "");
  const [role,       setRole]       = useState("");
  const [customRole, setCustomRole] = useState(
    data.targetRole && !ROLES.some((r) => r.value === data.targetRole) ? data.targetRole : "",
  );
  const [level,      setLevel]      = useState(data.currentLevel || "");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const resolvedRole = role === "other" ? customRole.trim().slice(0, 100) : role;

  const canProceed = Boolean(
    name.trim() && role && level && (role !== "other" || customRole.trim()),
  );

  async function handleNext() {
    if (!canProceed || !user) return;
    setLoading(true);
    setError(null);

    const existingPrefs =
      profile?.notification_prefs &&
      typeof profile.notification_prefs === "object" &&
      !Array.isArray(profile.notification_prefs)
        ? (profile.notification_prefs as Record<string, unknown>)
        : {};

    const { data: row, error: dbError } = await supabase
      .from("profiles")
      .update({
        full_name:         name.trim(),
        role_type:         role,
        target_role:       resolvedRole,
        experience_years:  YEARS_MAP[level] ?? 0,
        notification_prefs: {
          ...existingPrefs,
          experience_level: level,
        },
        onboarding_step:   1,
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

    if (row) setProfile(row as unknown as ProfileRow);

    onNext({
      targetRole:        resolvedRole,
      targetCompanies:   data.targetCompanies,
      yearsOfExperience: YEARS_MAP[level] ?? 0,
      currentLevel:      level,
    });
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Quick essentials
        </h2>
        <p className="text-muted-foreground text-sm">
          Two quick questions so Practice Coach can match question difficulty and answer depth to you.
        </p>
      </div>

      {refCode && (
        <div className="px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary text-center">
          Referral code{" "}
          <span className="font-mono font-bold">{refCode}</span>{" "}
          applied — you&apos;ll both earn bonus credits!
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Why we ask:</span>{" "}
          Your role and seniority calibrate every live hint — from intern-friendly prompts to staff-level system design depth.
        </p>
      </div>

      <Input
        label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Jane Smith"
        autoFocus
      />

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Target role
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

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button
        variant="primary"
        size="md"
        fullWidth
        loading={loading}
        disabled={!canProceed}
        onClick={() => void handleNext()}
      >
        Continue
      </Button>
    </div>
  );
}
